-- ============================================================================
-- security_audit_log append-only enforcement
-- Created: 2026-06-02
-- Purpose: Mirror the admin_audit_logs append-only guarantee on the runtime
--          security-event log. Blocks UPDATE and DELETE for ALL roles
--          (including service_role and the table owner) so security telemetry
--          is tamper-evident. Verified safe: no edge function or migration
--          updates/deletes security_audit_log (inserts only).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_security_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_log is append-only; % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

COMMENT ON FUNCTION public.prevent_security_audit_mutation IS
  'Blocks UPDATE/DELETE on security_audit_log to guarantee append-only telemetry.';

DROP TRIGGER IF EXISTS security_audit_log_no_update ON public.security_audit_log;
CREATE TRIGGER security_audit_log_no_update
  BEFORE UPDATE ON public.security_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_security_audit_mutation();

DROP TRIGGER IF EXISTS security_audit_log_no_delete ON public.security_audit_log;
CREATE TRIGGER security_audit_log_no_delete
  BEFORE DELETE ON public.security_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_security_audit_mutation();
