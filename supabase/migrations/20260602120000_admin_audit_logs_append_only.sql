-- ============================================================================
-- admin_audit_logs append-only enforcement
-- Created: 2026-06-02
-- Purpose: The admin_audit_logs table (security_hardening) relied only on the
--          absence of UPDATE/DELETE RLS policies for immutability — which
--          service_role bypasses. Enforce true append-only semantics with a
--          trigger that blocks UPDATE and DELETE for ALL roles, including
--          service_role and the table owner. Required for tamper-evident audit
--          logging (SOC 2 readiness).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_admin_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_logs is append-only; % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

COMMENT ON FUNCTION public.prevent_admin_audit_mutation IS
  'Blocks UPDATE/DELETE on admin_audit_logs to guarantee append-only audit history.';

DROP TRIGGER IF EXISTS admin_audit_logs_no_update ON public.admin_audit_logs;
CREATE TRIGGER admin_audit_logs_no_update
  BEFORE UPDATE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_audit_mutation();

DROP TRIGGER IF EXISTS admin_audit_logs_no_delete ON public.admin_audit_logs;
CREATE TRIGGER admin_audit_logs_no_delete
  BEFORE DELETE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_audit_mutation();
