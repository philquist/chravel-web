-- ============================================================================
-- Fix notification delivery pipeline (production gap audit, Jul 2026)
--
-- Root causes addressed:
--   1. trigger_queue_notification_deliveries missing in production → 0 rows in
--      notification_deliveries → dispatch cron had nothing to send.
--   2. should_send_notification() defaulted p_channel to 'push', so DB fanout
--      treated push_enabled as an in-app creation gate (wrong contract).
--   3. notify_on_broadcast() in production still used legacy send_notification()
--      instead of create_notification_for_trip_members() with preference gating.
-- ============================================================================

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
  ON CONFLICT (notification_id, channel) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_queue_notification_deliveries ON public.notifications;
CREATE TRIGGER trigger_queue_notification_deliveries
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_notification_deliveries();

INSERT INTO public.notification_deliveries (
  notification_id,
  channel,
  status,
  next_attempt_at
)
SELECT
  n.id,
  'push',
  'queued'::public.notification_delivery_status,
  COALESCE(n.created_at, NOW())
FROM public.notifications n
LEFT JOIN public.notification_deliveries nd
  ON nd.notification_id = n.id
 AND nd.channel = 'push'
WHERE nd.id IS NULL
  AND COALESCE(n.is_visible, true) = true
  AND n.created_at > NOW() - INTERVAL '90 days'
ON CONFLICT (notification_id, channel) DO NOTHING;

CREATE OR REPLACE FUNCTION public.should_send_notification(
  p_user_id uuid,
  p_notification_type text,
  p_channel text DEFAULT 'in_app'
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

  IF NOT FOUND THEN
    IF p_channel IN ('push', 'email', 'sms') THEN
      IF p_channel = 'sms' THEN
        RETURN false;
      END IF;
      RETURN true;
    END IF;
    IF p_notification_type IN ('chat', 'chat_messages', 'messages') THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  CASE p_channel
    WHEN 'in_app' THEN
      v_channel_enabled := true;
    WHEN 'push' THEN
      v_channel_enabled := COALESCE(v_prefs.push_enabled, true);
    WHEN 'email' THEN
      v_channel_enabled := COALESCE(v_prefs.email_enabled, false);
    WHEN 'sms' THEN
      v_channel_enabled := false;
    ELSE
      v_channel_enabled := true;
  END CASE;

  IF NOT v_channel_enabled THEN
    RETURN false;
  END IF;

  CASE p_notification_type
    WHEN 'broadcasts', 'broadcast' THEN v_type_enabled := v_prefs.broadcasts;
    WHEN 'chat', 'chat_messages', 'messages', 'mention' THEN
      v_type_enabled := v_prefs.chat_messages;
    WHEN 'tasks', 'task' THEN v_type_enabled := v_prefs.tasks;
    WHEN 'payments', 'payment' THEN v_type_enabled := v_prefs.payments;
    WHEN 'calendar', 'calendar_events', 'event' THEN v_type_enabled := v_prefs.calendar_events;
    WHEN 'polls', 'poll' THEN v_type_enabled := v_prefs.polls;
    WHEN 'join_requests', 'join_request' THEN v_type_enabled := v_prefs.join_requests;
    WHEN 'trip_invites', 'trip_invite', 'invite' THEN v_type_enabled := v_prefs.trip_invites;
    WHEN 'basecamp_updates', 'basecamp' THEN v_type_enabled := v_prefs.basecamp_updates;
    ELSE v_type_enabled := true;
  END CASE;

  RETURN COALESCE(v_type_enabled, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_broadcast()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_uuid UUID;
BEGIN
  BEGIN
    v_trip_uuid := NEW.trip_id::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN NEW;
  END;

  PERFORM public.create_notification_for_trip_members(
    v_trip_uuid,
    NEW.created_by,
    'broadcast',
    'broadcast',
    NEW.id,
    'broadcasts',
    COALESCE(NEW.priority, 'normal'),
    '/trip/' || NEW.trip_id || '?tab=broadcasts',
    'New broadcast',
    LEFT(COALESCE(NEW.message, ''), 140),
    jsonb_build_object('broadcast_id', NEW.id),
    'broadcast:' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_broadcast ON public.broadcasts;
CREATE TRIGGER trigger_notify_broadcast
  AFTER INSERT ON public.broadcasts
  FOR EACH ROW
  WHEN (NEW.is_sent = TRUE OR NEW.scheduled_for IS NULL)
  EXECUTE FUNCTION public.notify_on_broadcast();
