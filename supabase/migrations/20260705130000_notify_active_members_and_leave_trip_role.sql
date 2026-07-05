-- Two follow-ups discovered while auditing the leave_trip fix
-- (20260705020000_restore_leave_trip_membership_status.sql):
--
-- 1. notify_on_chat_message() / notify_on_calendar_event() selected trip
--    members without filtering (status IS NULL OR status = 'active'), so a
--    member who left a trip via leave_trip() would still receive chat/
--    calendar notifications for it. Verified both functions' current bodies
--    against the live schema before writing this — the only change is
--    adding the same status filter already used by is_active_trip_member().
--
-- 2. src/hooks/useRoleAssignments.ts:323 calls
--    supabase.rpc('leave_trip_role', { _trip_id, _role_id }), but no such
--    function exists in production. Verified the two functions that do
--    exist for this table (assign_user_to_role / remove_user_from_role,
--    added by an earlier migration) are both admin-only — they explicitly
--    reject a caller who isn't a trip creator/admin, so neither covers a
--    member removing their own role assignment. leave_trip_role is added
--    here as a new, self-service counterpart, following the same
--    SECURITY DEFINER + auth.uid()-scoped pattern as leave_trip().

-- 1a. notify_on_chat_message: skip members who have left the trip.
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
      -- Always notify on mention (unless push globally disabled)
      v_should_notify := COALESCE(v_prefs.push_enabled, true);
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

-- 1b. notify_on_calendar_event: skip members who have left the trip.
CREATE OR REPLACE FUNCTION public.notify_on_calendar_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_trip_name TEXT;
  v_member_ids UUID[];
  v_creator_name TEXT;
BEGIN
  -- Skip notifications for bulk imports to prevent DB timeouts
  IF NEW.source_type = 'bulk_import' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_trip_name FROM trips WHERE id = NEW.trip_id;

  SELECT COALESCE(
    display_name,
    first_name || ' ' || last_name,
    email
  ) INTO v_creator_name
  FROM profiles
  WHERE user_id = NEW.created_by;

  SELECT ARRAY_AGG(user_id) INTO v_member_ids
  FROM trip_members
  WHERE trip_id = NEW.trip_id AND user_id != NEW.created_by
    AND (status IS NULL OR status = 'active');

  IF v_member_ids IS NOT NULL AND array_length(v_member_ids, 1) > 0 THEN
    PERFORM send_notification(
      v_member_ids,
      NEW.trip_id::UUID,
      'calendar',
      '📅 New event: ' || NEW.title,
      COALESCE(v_creator_name, 'Someone') || ' added a new event' ||
        CASE WHEN NEW.start_time IS NOT NULL
          THEN ' on ' || to_char(NEW.start_time, 'Mon DD, YYYY at HH:MI AM')
          ELSE ''
        END ||
        CASE WHEN NEW.location IS NOT NULL
          THEN ' at ' || NEW.location
          ELSE ''
        END,
      jsonb_build_object(
        'event_id', NEW.id,
        'trip_id', NEW.trip_id,
        'start_time', NEW.start_time,
        'location', NEW.location,
        'action', 'event_created'
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. leave_trip_role: self-service counterpart to assign_user_to_role/
--    remove_user_from_role (both admin-only). Deletes only the caller's own
--    (trip_id, user_id, role_id) row — no elevated privilege beyond what the
--    existing "Trip admins assign roles" ALL policy on user_trip_roles
--    already permits for self (user_id = auth.uid()); this just gives it a
--    stable RPC contract matching what the client already calls.
CREATE OR REPLACE FUNCTION public.leave_trip_role(_trip_id text, _role_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'You must be logged in');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_trip_roles
    WHERE trip_id = _trip_id AND user_id = v_user_id AND role_id = _role_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'You are not assigned to this role');
  END IF;

  DELETE FROM public.user_trip_roles
  WHERE trip_id = _trip_id AND user_id = v_user_id AND role_id = _role_id;

  RETURN jsonb_build_object('success', true, 'message', 'Left the role successfully');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.leave_trip_role(text, uuid) TO authenticated;
