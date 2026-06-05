-- ============================================================================
-- Fix admin_audit_logs hash-chain ordering + close TRUNCATE bypass
-- Created: 2026-06-02
-- Purpose: The first hash-chain implementation ordered the chain by
--          (created_at, id). Rows inserted in a single transaction share now()
--          (= created_at) and id is a random UUID, so the chain order was
--          non-deterministic and verify_admin_audit_chain() reported breaks.
--          This migration introduces a monotonic `seq` identity column as the
--          canonical chain order, repoints the trigger + verifier to it, and
--          recomputes any existing rows so the live chain is intact.
--
--          It also adds BEFORE TRUNCATE guards: row-level append-only triggers
--          do NOT fire on TRUNCATE, which would otherwise wipe an audit log.
--
-- Idempotent: safe to run after the corrected base migration (ADD COLUMN IF NOT
-- EXISTS is skipped; functions are replaced identically; recompute re-derives
-- the same hashes).
-- ============================================================================

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
  PERFORM pg_advisory_xact_lock(hashtext('admin_audit_logs_chain'));

  SELECT event_hash INTO v_prev
  FROM public.admin_audit_logs
  ORDER BY seq DESC
  LIMIT 1;

  v_prev := COALESCE(v_prev, '');
  NEW.prev_hash := v_prev;

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

-- Recompute existing rows in seq order. The append-only UPDATE trigger is
-- briefly disabled for this one controlled correction (rows are freshly created
-- bootstrap entries with no external reliance yet).
ALTER TABLE public.admin_audit_logs DISABLE TRIGGER admin_audit_logs_no_update;

DO $$
DECLARE
  r         RECORD;
  v_prev    TEXT := '';
  v_payload TEXT;
  v_hash    TEXT;
BEGIN
  FOR r IN SELECT * FROM public.admin_audit_logs ORDER BY seq ASC LOOP
    v_payload :=
         v_prev
      || COALESCE(r.id::text, '')
      || COALESCE(r.admin_id::text, '')
      || COALESCE(r.action, '')
      || COALESCE(r.trip_id, '')
      || COALESCE(r.target_user_id::text, '')
      || COALESCE(r.old_state::text, '')
      || COALESCE(r.new_state::text, '')
      || COALESCE(r.created_at::text, '');
    v_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    UPDATE public.admin_audit_logs SET prev_hash = v_prev, event_hash = v_hash WHERE seq = r.seq;
    v_prev := v_hash;
  END LOOP;
END;
$$;

ALTER TABLE public.admin_audit_logs ENABLE TRIGGER admin_audit_logs_no_update;

-- Close the TRUNCATE bypass on both audit tables (row triggers don't fire on TRUNCATE).
DROP TRIGGER IF EXISTS admin_audit_logs_no_truncate ON public.admin_audit_logs;
CREATE TRIGGER admin_audit_logs_no_truncate
  BEFORE TRUNCATE ON public.admin_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_admin_audit_mutation();

DROP TRIGGER IF EXISTS security_audit_log_no_truncate ON public.security_audit_log;
CREATE TRIGGER security_audit_log_no_truncate
  BEFORE TRUNCATE ON public.security_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_security_audit_mutation();
