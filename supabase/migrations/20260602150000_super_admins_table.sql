-- ============================================================================
-- DB-backed super-admin roster
-- Created: 2026-06-02
-- Purpose: Replace the hardcoded email allowlist inside is_super_admin() with a
--          managed, audited database table. Grants/revocations are written to
--          the (append-only, hash-chained) admin_audit_logs. The four founder
--          emails are seeded BEFORE is_super_admin() is repointed, so no one is
--          locked out during the switch (the whole migration is one
--          transaction).
--
-- Source-of-truth note: public.super_admins is now the server-side source of
-- truth. src/constants/admins.ts remains a CLIENT-SIDE UX failsafe and should
-- be kept in sync with the active roster.
-- ============================================================================

-- ── 1. Roster table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.super_admins (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL UNIQUE CHECK (email = lower(email)),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ,
  note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_super_admins_active
  ON public.super_admins (email) WHERE revoked_at IS NULL;

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- Only existing super admins may read the roster. No INSERT/UPDATE/DELETE
-- policies → authenticated users cannot mutate it directly; changes go through
-- the SECURITY DEFINER functions below (or service_role).
DROP POLICY IF EXISTS "super_admins_read_roster" ON public.super_admins;
CREATE POLICY "super_admins_read_roster"
  ON public.super_admins
  FOR SELECT
  USING (public.is_super_admin());

COMMENT ON TABLE public.super_admins IS
  'Server-side source of truth for Chravel super-admin access. Mutated only via '
  'grant_super_admin/revoke_super_admin; all changes audited to admin_audit_logs.';

-- ── 2. Audit trigger (grant/revoke → admin_audit_logs) ──────────────────────
CREATE OR REPLACE FUNCTION public.log_super_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_audit_logs (admin_id, action, target_user_id, old_state, new_state)
    VALUES (auth.uid(), 'super_admin.granted', NEW.user_id, NULL,
            jsonb_build_object('email', NEW.email, 'note', NEW.note));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.admin_audit_logs (admin_id, action, target_user_id, old_state, new_state)
    VALUES (auth.uid(),
            CASE
              WHEN NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN 'super_admin.revoked'
              WHEN NEW.revoked_at IS NULL AND OLD.revoked_at IS NOT NULL THEN 'super_admin.reinstated'
              ELSE 'super_admin.updated'
            END,
            NEW.user_id,
            jsonb_build_object('email', OLD.email, 'revoked_at', OLD.revoked_at),
            jsonb_build_object('email', NEW.email, 'revoked_at', NEW.revoked_at));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS super_admins_audit ON public.super_admins;
CREATE TRIGGER super_admins_audit
  AFTER INSERT OR UPDATE ON public.super_admins
  FOR EACH ROW EXECUTE FUNCTION public.log_super_admin_change();

-- ── 3. Seed founders BEFORE repointing is_super_admin() ─────────────────────
-- Founder emails scrubbed from source. Rows are provisioned via the
-- `bootstrap-super-admins` edge function using the SUPER_ADMIN_BOOTSTRAP_EMAILS
-- secret. Production already has these rows; fresh envs must invoke that
-- function once. See docs/ops/super-admin-bootstrap.md.
SELECT 1;

-- ── 4. Repoint is_super_admin() to the table ────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
      AND revoked_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

COMMENT ON FUNCTION public.is_super_admin IS
  'Returns true if the caller (by JWT email) is an active row in public.super_admins. '
  'Server-side source of truth for all privilege checks. Manage via '
  'grant_super_admin/revoke_super_admin. src/constants/admins.ts is a client-side failsafe.';

-- ── 5. Management functions (caller must already be super admin) ────────────
CREATE OR REPLACE FUNCTION public.grant_super_admin(_email text, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin may grant super-admin access';
  END IF;
  INSERT INTO public.super_admins (email, granted_by, note)
  VALUES (lower(_email), auth.uid(), _note)
  ON CONFLICT (email) DO UPDATE
    SET revoked_at = NULL,
        granted_by = auth.uid(),
        granted_at = now(),
        note = COALESCE(EXCLUDED.note, public.super_admins.note);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_super_admin(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin may revoke super-admin access';
  END IF;
  UPDATE public.super_admins
  SET revoked_at = now()
  WHERE email = lower(_email) AND revoked_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_super_admin(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_super_admin(text)      FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_super_admin(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_super_admin(text)      TO authenticated;
