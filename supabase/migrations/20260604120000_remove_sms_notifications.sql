-- ============================================================================
-- MVP Infra Cleanup: full removal of SMS / Twilio notifications.
--
-- Preserves push + email + in-app delivery. SMS duplicated those channels and
-- added compliance / deliverability / cost surface without MVP value. The
-- application code path was removed in the preceding commits; this migration
-- removes the SMS-only database objects and the SMS columns on the shared
-- notification_preferences table.
--
-- Intentional design choice: the CHECK constraints
--   notification_deliveries.channel CHECK (... 'sms')
--   notification_logs.type          CHECK (... 'sms')
-- are LEFT WIDENED (the 'sms' value is still allowed). Historical rows may carry
-- 'sms'; tightening these constraints would require purging/migrating existing
-- rows and risks failing on production data for zero functional gain — nothing
-- inserts a new 'sms' row once the trigger and dispatcher stop producing them.
--
-- Reversible: see the documented ROLLBACK block at the bottom of this file.
-- ============================================================================

-- NOTE: This migration intentionally does NOT recreate the fan-out trigger or
-- touch notification_deliveries rows. Production's notification_deliveries schema
-- differs from this repo's older migrations (it uses error_message + a
-- notification_delivery_status enum incl. 'cancelled', and has no
-- recipient_user_id) — see docs/NOTIFICATION_DELIVERY_SCHEMA_DIVERGENCE.md. The
-- prod-shaped fan-out (push-only) is owned exclusively by
-- 20260604170000_notification_fanout_prod_schema.sql so this migration cannot
-- fail on prod-canonical columns. Here we only drop the SMS-specific objects.

-- 1) Drop the SMS entitlement enforcement trigger + function on the SHARED
--    notification_preferences table (drop the trigger before the function, and
--    the dependent function before is_user_sms_entitled).
DROP TRIGGER IF EXISTS trigger_enforce_sms_entitlement ON public.notification_preferences;
DROP FUNCTION IF EXISTS public.enforce_sms_entitlement_on_preferences();
DROP FUNCTION IF EXISTS public.is_user_sms_entitled(UUID);

-- 4) Drop the SMS rate-limit helper functions.
DROP FUNCTION IF EXISTS public.check_sms_rate_limit(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.increment_sms_counter(UUID);

-- 5) Drop the SMS-only compliance opt-in table (its RLS policies and updated_at
--    trigger are dropped automatically with the table).
DROP TABLE IF EXISTS public.sms_opt_in;

-- 6) Drop the SMS phone-number CHECK constraint + its validator before dropping
--    the column it guards.
ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS valid_sms_phone_number;
DROP FUNCTION IF EXISTS public.validate_phone_number(TEXT);

-- 7) Recreate should_send_notification (3-arg, the surviving overload) so it no
--    longer references the SMS columns. Behaviour is unchanged for push/email
--    and category checks; the 'sms' channel now always resolves to false.
CREATE OR REPLACE FUNCTION public.should_send_notification(
  p_user_id uuid,
  p_notification_type text,
  p_channel text DEFAULT 'push'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefs RECORD;
  v_type_enabled BOOLEAN;
  v_channel_enabled BOOLEAN;
BEGIN
  SELECT * INTO v_prefs
  FROM notification_preferences
  WHERE user_id = p_user_id;

  -- No preferences: allow push/email defaults; SMS is removed.
  IF NOT FOUND THEN
    IF p_channel = 'sms' THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  CASE p_channel
    WHEN 'push' THEN v_channel_enabled := v_prefs.push_enabled;
    WHEN 'email' THEN v_channel_enabled := v_prefs.email_enabled;
    WHEN 'sms' THEN v_channel_enabled := false; -- SMS removed
    ELSE v_channel_enabled := true;
  END CASE;

  IF NOT v_channel_enabled THEN
    RETURN false;
  END IF;

  CASE p_notification_type
    WHEN 'broadcasts' THEN v_type_enabled := v_prefs.broadcasts;
    WHEN 'chat_messages', 'messages' THEN v_type_enabled := v_prefs.chat_messages;
    WHEN 'tasks' THEN v_type_enabled := v_prefs.tasks;
    WHEN 'payments' THEN v_type_enabled := v_prefs.payments;
    WHEN 'calendar', 'calendar_events' THEN v_type_enabled := v_prefs.calendar_events;
    WHEN 'polls' THEN v_type_enabled := v_prefs.polls;
    WHEN 'join_requests' THEN v_type_enabled := v_prefs.join_requests;
    WHEN 'trip_invites' THEN v_type_enabled := v_prefs.trip_invites;
    WHEN 'basecamp_updates' THEN v_type_enabled := v_prefs.basecamp_updates;
    ELSE v_type_enabled := true;
  END CASE;

  RETURN COALESCE(v_type_enabled, true);
END;
$$;

-- 8) Drop the SMS-only columns from the shared notification_preferences table.
ALTER TABLE public.notification_preferences
  DROP COLUMN IF EXISTS sms_enabled,
  DROP COLUMN IF EXISTS sms_phone_number,
  DROP COLUMN IF EXISTS sms_sent_today,
  DROP COLUMN IF EXISTS last_sms_reset_date;

-- ============================================================================
-- ROLLBACK (manual; reverse order). Restores the SMS schema objects. Note that
-- the application code that consumed them was removed in the same change set, so
-- a matching code revert is also required to actually re-enable SMS delivery.
--
-- 1) Re-add columns:
--    ALTER TABLE public.notification_preferences
--      ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN DEFAULT FALSE,
--      ADD COLUMN IF NOT EXISTS sms_phone_number TEXT,
--      ADD COLUMN IF NOT EXISTS sms_sent_today INTEGER DEFAULT 0,
--      ADD COLUMN IF NOT EXISTS last_sms_reset_date DATE DEFAULT CURRENT_DATE;
-- 2) Recreate validate_phone_number() + the valid_sms_phone_number CHECK
--    (copy from 20260107000000_add_sms_phone_number.sql).
-- 3) Recreate the sms_opt_in table + its RLS policies + updated_at trigger
--    (copy from 20260214103000_sms_delivery_architecture.sql, sections 3/5/12).
-- 4) Recreate is_user_sms_entitled() (latest body in 20260409000001),
--    enforce_sms_entitlement_on_preferences() + trigger_enforce_sms_entitlement
--    (from 20260214103000, section 6).
-- 5) Recreate check_sms_rate_limit() + increment_sms_counter()
--    (from 20260204145210).
-- 6) Restore queue_notification_deliveries() with the 'sms' VALUES row
--    (from 20260214103000, section 7).
-- 7) Restore the 'sms' branch in should_send_notification()
--    (from 20260107000000).
-- ============================================================================
