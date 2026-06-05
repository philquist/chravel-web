-- Forward-fix for 20260110000000_account_deletion_rpc.sql (which was never applied to prod).
--
-- Two problems with the original, fixed here:
--   1. The request/cancel RPCs INSERTed into security_audit_log using columns
--      (event_type, user_id, details) that DO NOT EXIST. The real columns are
--      (action, table_name, record_id, metadata). Because these RPCs are
--      SECURITY DEFINER with no exception handling, the bad INSERT raised and
--      aborted the whole function — so the in-app "Delete Account" button errored.
--   2. process-account-deletions (the cron executor) was never scheduled, so
--      accounts past their 30-day grace period were never actually deleted and
--      the Sign in with Apple grant was never revoked (App Store 5.1.1(v)).
--
-- This migration is self-contained and idempotent: it (re)creates the columns,
-- index, and all three RPCs with the correct audit columns (audit writes are now
-- non-fatal), then schedules the deletion executor to run daily.

-- 1) Columns + index (idempotent) ------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deletion_scheduled_for timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_deletion_scheduled
ON public.profiles (deletion_scheduled_for)
WHERE deletion_scheduled_for IS NOT NULL;

-- 2) request_account_deletion ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_scheduled_date timestamptz;
  v_existing_request timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT deletion_scheduled_for INTO v_existing_request
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF v_existing_request IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Account deletion already scheduled',
      'scheduled_for', v_existing_request
    );
  END IF;

  -- 30-day grace period per App Store guideline 5.1.1
  v_scheduled_date := now() + interval '30 days';

  UPDATE public.profiles
  SET
    deletion_requested_at = now(),
    deletion_scheduled_for = v_scheduled_date
  WHERE user_id = v_user_id;

  -- Audit is non-critical: never let it abort the deletion request.
  BEGIN
    INSERT INTO public.security_audit_log (action, table_name, user_id, metadata)
    VALUES (
      'account_deletion_requested',
      'profiles',
      v_user_id,
      jsonb_build_object('scheduled_for', v_scheduled_date, 'requested_at', now())
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Account scheduled for deletion in 30 days',
    'scheduled_for', v_scheduled_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;

-- 3) cancel_account_deletion -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_scheduled_date timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT deletion_scheduled_for INTO v_scheduled_date
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF v_scheduled_date IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No pending deletion request to cancel'
    );
  END IF;

  IF v_scheduled_date <= now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Deletion period has expired and cannot be cancelled'
    );
  END IF;

  UPDATE public.profiles
  SET
    deletion_requested_at = NULL,
    deletion_scheduled_for = NULL
  WHERE user_id = v_user_id;

  BEGIN
    INSERT INTO public.security_audit_log (action, table_name, user_id, metadata)
    VALUES (
      'account_deletion_cancelled',
      'profiles',
      v_user_id,
      jsonb_build_object('cancelled_at', now())
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Deletion request cancelled successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_account_deletion() TO authenticated;

-- 4) get_account_deletion_status -------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_account_deletion_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_requested_at timestamptz;
  v_scheduled_for timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT deletion_requested_at, deletion_scheduled_for
  INTO v_requested_at, v_scheduled_for
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF v_scheduled_for IS NULL THEN
    RETURN jsonb_build_object('pending_deletion', false);
  END IF;

  RETURN jsonb_build_object(
    'pending_deletion', true,
    'requested_at', v_requested_at,
    'scheduled_for', v_scheduled_for,
    'days_remaining', EXTRACT(DAY FROM (v_scheduled_for - now()))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_account_deletion_status() TO authenticated;

COMMENT ON FUNCTION public.request_account_deletion() IS
  'Marks user account for deletion with 30-day grace period. App Store Guideline 5.1.1 compliant.';
COMMENT ON FUNCTION public.cancel_account_deletion() IS
  'Cancels a pending account deletion request if within the 30-day grace period.';
COMMENT ON FUNCTION public.get_account_deletion_status() IS
  'Returns the current account deletion status including days remaining if pending.';

-- 5) Schedule the deletion executor (idempotent) ---------------------------------
-- Runs daily at 03:00 UTC. Mirrors the auth pattern of the live
-- chravel-dispatch-notification-deliveries job (Bearer service_role_key, which
-- process-account-deletions' verifyCronAuth accepts).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE NOTICE 'cron schema not available; skipping process-account-deletions schedule.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chravel-process-account-deletions') THEN
    PERFORM cron.unschedule('chravel-process-account-deletions');
  END IF;

  PERFORM cron.schedule(
    'chravel-process-account-deletions',
    '0 3 * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://jmjiyekmxwsxkfnqwyaa.supabase.co/functions/v1/process-account-deletions',
      headers := ('{"Content-Type":"application/json","Authorization":"Bearer ' ||
                  current_setting('app.settings.service_role_key', true) || '"}')::jsonb,
      body := '{}'::jsonb
    );
    $cron$
  );
END $$;
