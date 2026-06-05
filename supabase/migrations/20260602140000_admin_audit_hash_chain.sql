-- ============================================================================
-- admin_audit_logs tamper-evident hash chaining
-- Created: 2026-06-02
-- Purpose: Make admin_audit_logs tamper-evident. Each row stores prev_hash
--          (the previous row's event_hash) and event_hash = sha256(prev_hash ||
--          canonical row payload). Any insertion, reordering, or content change
--          breaks the chain and is detectable via verify_admin_audit_chain().
--          Combined with the existing append-only triggers, this gives
--          insert-only + tamper-evident audit history (SOC 2 readiness).
--
-- Ordering: a monotonic `seq` identity column defines chain order. created_at
--   cannot be used because rows inserted in one transaction share now(), and id
--   is a random UUID (not insertion-ordered). The BEFORE INSERT trigger reads
--   the current max-seq row as the predecessor (the new row is not yet in the
--   table), serialized by a transaction advisory lock for concurrency safety.
--
-- Notes:
--   * pgcrypto lives in the `extensions` schema on Supabase; digest() is
--     fully-qualified as extensions.digest so it resolves regardless of
--     search_path.
-- ============================================================================

ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS prev_hash  TEXT;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS event_hash TEXT;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS seq BIGINT GENERATED ALWAYS AS IDENTITY;

CREATE OR REPLACE FUNCTION public.compute_admin_audit_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev    TEXT;
  v_payload TEXT;
BEGIN
  -- Serialize concurrent inserts so the chain head is deterministic.
  PERFORM pg_advisory_xact_lock(hashtext('admin_audit_logs_chain'));

  -- Predecessor = most recently inserted row (highest seq). The new row is not
  -- yet visible (BEFORE INSERT), so this is the true previous link.
  SELECT event_hash INTO v_prev
  FROM public.admin_audit_logs
  ORDER BY seq DESC
  LIMIT 1;

  v_prev := COALESCE(v_prev, '');
  NEW.prev_hash := v_prev;

  -- Canonical payload: previous hash + the row's immutable content fields.
  v_payload :=
       v_prev
    || COALESCE(NEW.id::text, '')
    || COALESCE(NEW.admin_id::text, '')
    || COALESCE(NEW.action, '')
    || COALESCE(NEW.trip_id, '')
    || COALESCE(NEW.target_user_id::text, '')
    || COALESCE(NEW.old_state::text, '')
    || COALESCE(NEW.new_state::text, '')
    || COALESCE(NEW.created_at::text, '');

  NEW.event_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.compute_admin_audit_hash IS
  'BEFORE INSERT trigger: links each admin_audit_logs row into a sha256 hash chain (ordered by seq).';

DROP TRIGGER IF EXISTS admin_audit_logs_hash_chain ON public.admin_audit_logs;
CREATE TRIGGER admin_audit_logs_hash_chain
  BEFORE INSERT ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.compute_admin_audit_hash();

-- Integrity verifier: returns one row per broken link (empty result = intact).
CREATE OR REPLACE FUNCTION public.verify_admin_audit_chain()
RETURNS TABLE(broken_at_id uuid, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      RECORD;
  v_prev TEXT := '';
  v_calc TEXT;
BEGIN
  FOR r IN
    SELECT * FROM public.admin_audit_logs ORDER BY seq ASC
  LOOP
    IF COALESCE(r.prev_hash, '') <> v_prev THEN
      broken_at_id := r.id; reason := 'prev_hash mismatch'; RETURN NEXT;
    END IF;

    v_calc := encode(extensions.digest(
         v_prev
      || COALESCE(r.id::text, '')
      || COALESCE(r.admin_id::text, '')
      || COALESCE(r.action, '')
      || COALESCE(r.trip_id, '')
      || COALESCE(r.target_user_id::text, '')
      || COALESCE(r.old_state::text, '')
      || COALESCE(r.new_state::text, '')
      || COALESCE(r.created_at::text, ''), 'sha256'), 'hex');

    IF v_calc <> COALESCE(r.event_hash, '') THEN
      broken_at_id := r.id; reason := 'event_hash mismatch'; RETURN NEXT;
    END IF;

    v_prev := r.event_hash;
  END LOOP;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.verify_admin_audit_chain IS
  'Recomputes the admin_audit_logs hash chain (in seq order); returns a row per broken link (empty = intact).';

REVOKE ALL ON FUNCTION public.verify_admin_audit_chain() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_admin_audit_chain() TO authenticated, service_role;
