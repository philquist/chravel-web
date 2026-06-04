-- ============================================================================
-- Wire the notification → delivery fan-out using PRODUCTION's notification_deliveries
-- schema (Option A reconciliation — see docs/NOTIFICATION_DELIVERY_SCHEMA_DIVERGENCE.md).
--
-- Production's table is the canonical design:
--   notification_deliveries(
--     id, notification_id, channel text, status notification_delivery_status,
--     recipient text, attempt_count int, max_attempts int, next_attempt_at,
--     last_attempted_at, sent_at, error_message, provider_message_id, metadata,
--     created_at, updated_at)
--   status enum values: queued | processing | sent | failed | cancelled
--
-- create-notification inserts a notifications row and relies on this trigger to
-- enqueue push + email deliveries that the dispatch-notification-deliveries cron
-- (every minute, via claim_notification_deliveries) then sends. The trigger was
-- missing in production (155 notifications → 0 deliveries).
--
-- This migration is idempotent and uses ONLY columns that exist in production:
-- it inserts (notification_id, channel, status, next_attempt_at). recipient is
-- nullable (resolved at send time); attempt_count/max_attempts use their defaults.
--
-- SCOPE: PUSH ONLY. Every notification_preferences row in production currently has
-- email_enabled = TRUE, so fanning out an 'email' channel would email the entire
-- user base on the next notification. The product goal here is push + badges, so
-- this trigger enqueues the 'push' channel only. Re-enable an 'email' VALUES row
-- below as a DELIBERATE, separately-reviewed change once email is intended.
--
-- IMPORTANT: deploy this together with the matching dispatch-notification-deliveries
-- function (which also targets this schema). Deploying the trigger without the
-- aligned dispatcher would queue rows the old dispatcher cannot process.
-- ============================================================================

-- Idempotency key the fan-out relies on (prod table only had a PK).
CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_notification_id_channel_key
  ON public.notification_deliveries (notification_id, channel);

CREATE OR REPLACE FUNCTION public.queue_notification_deliveries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_deliveries (
    notification_id,
    channel,
    status,
    next_attempt_at
  )
  VALUES
    (NEW.id, 'push', 'queued'::public.notification_delivery_status, COALESCE(NEW.created_at, NOW()))
    -- , (NEW.id, 'email', 'queued'::public.notification_delivery_status, COALESCE(NEW.created_at, NOW()))
    --   ^ email intentionally disabled (all users are email_enabled; would blast). Re-enable deliberately.
  ON CONFLICT (notification_id, channel) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_queue_notification_deliveries ON public.notifications;
CREATE TRIGGER trigger_queue_notification_deliveries
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_notification_deliveries();
