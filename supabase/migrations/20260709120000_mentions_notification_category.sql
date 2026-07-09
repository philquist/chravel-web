-- @mentions get a dedicated, pushable notification category.
--
-- Problem: `mention` notifications were routed to the `chat_messages` category,
-- which is permanently suppressed from external delivery (push/email). As a
-- result @mentions only ever appeared in-app and never pushed.
--
-- Fix: introduce a first-class `mentions` preference (column-per-category model,
-- matching every other category in public.notification_preferences), default it
-- ON so mentions push out of the box, teach should_send_notification() the new
-- pref key, and gate the mention branch of notify_on_chat_message() by this pref
-- instead of the raw push_enabled flag. Plain chat behaviour is unchanged
-- (still in-app only, still suppressed downstream).
--
-- The edge-side mirror of this (NotificationCategory union, TYPE_TO_CATEGORY_MAP
-- `mention` -> `mentions`, DEFAULT_NOTIFICATION_PREFERENCES, non-suppressed +
-- non-email-eligible) lives in supabase/functions/_shared/notificationUtils.ts.

-- 1) Add the new per-category preference column (default ON: push by default).
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS mentions BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.notification_preferences.mentions IS
  '@mentions notification category. Default ON (in-app + push). Distinct from '
  'mentions_only, which restricts whether NON-mention chat notifies.';

-- 2) Teach should_send_notification about the mentions pref key.
--    'mention' is removed from the chat branch so it is gated by the dedicated
--    mentions column rather than the (permanently off) chat_messages column.
CREATE OR REPLACE FUNCTION public.should_send_notification(
  p_user_id uuid,
  p_notification_type text,
  p_channel text DEFAULT 'in_app'::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    -- No prefs row: plain chat defaults off, everything else (incl. mentions) on.
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
    WHEN 'mentions', 'mention' THEN v_type_enabled := COALESCE(v_prefs.mentions, true);
    WHEN 'chat', 'chat_messages', 'messages' THEN
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
$function$;

-- 3) Gate the mention branch of notify_on_chat_message by the mentions pref.
--    The in-app row is created when the user has mentions enabled; the push
--    channel is enforced downstream in dispatch-notification-deliveries via
--    enforcePreferenceAtSendTime('push', 'mentions', prefs). Plain chat gating
--    (mentions_only fallback + chat pref) is preserved verbatim.
CREATE OR REPLACE FUNCTION public.notify_on_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_trip_name TEXT;
  v_author_name TEXT;
  v_member RECORD;
  v_should_notify BOOLEAN;
  v_prefs notification_preferences%ROWTYPE;
  v_is_mentioned BOOLEAN;
BEGIN
  -- Get trip name
  SELECT name INTO v_trip_name FROM trips WHERE id = NEW.trip_id;

  -- Get author name
  v_author_name := COALESCE(NEW.author_name, 'Someone');

  -- Notify each active trip member except the sender
  FOR v_member IN
    SELECT tm.user_id
    FROM trip_members tm
    WHERE tm.trip_id = NEW.trip_id
    AND tm.user_id != NEW.user_id
    AND (tm.status IS NULL OR tm.status = 'active')
  LOOP
    -- Check if user is mentioned
    v_is_mentioned := NEW.mentioned_user_ids IS NOT NULL
                      AND v_member.user_id = ANY(NEW.mentioned_user_ids);

    -- Get user preferences
    SELECT * INTO v_prefs
    FROM notification_preferences
    WHERE user_id = v_member.user_id;

    -- Determine if we should notify
    v_should_notify := false;

    IF NOT FOUND THEN
      -- No preferences = use defaults (chat off, but mentions on)
      v_should_notify := v_is_mentioned;
    ELSIF v_is_mentioned THEN
      -- Mentions are gated by the dedicated `mentions` category (default ON).
      -- Downstream dispatch still enforces the push channel toggle.
      v_should_notify := COALESCE(v_prefs.mentions, true);
    ELSIF COALESCE(v_prefs.mentions_only, true) THEN
      -- User only wants mentions, skip regular messages
      v_should_notify := false;
    ELSE
      -- Check if chat notifications are enabled
      v_should_notify := public.should_send_notification(v_member.user_id, 'chat');
    END IF;

    IF v_should_notify THEN
      INSERT INTO notifications (
        user_id,
        title,
        message,
        type,
        trip_id,
        is_read,
        is_visible,
        metadata
      ) VALUES (
        v_member.user_id,
        CASE WHEN v_is_mentioned
          THEN v_author_name || ' mentioned you'
          ELSE 'New message in ' || COALESCE(v_trip_name, 'your trip')
        END,
        LEFT(NEW.content, 100),
        CASE WHEN v_is_mentioned THEN 'mention' ELSE 'chat' END,
        NEW.trip_id,
        false,
        true,
        jsonb_build_object(
          'message_id', NEW.id,
          'sender_id', NEW.user_id,
          'is_mention', v_is_mentioned
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;
