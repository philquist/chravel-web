-- ============================================================================
-- Generic, trip-scoped in-app alert copy for notification fanout producers.
--
-- WHY:
--   Settings toggles (broadcasts, polls, payments, basecamp, etc.) correctly
--   gate fanout into public.notifications, but Alerts rendered raw entity-
--   specific bodies (street addresses, payment amounts, poll questions,
--   requester names). Push/email already prefer generic trip-scoped copy via
--   notificationContentBuilder; align DB-written title/message so the Alerts
--   panel matches that contract.
--
-- WHAT CHANGES:
--   Recreate notify_on_* wrappers to write generic title/body with trip name.
--   No schema/RLS/auth/payment-state changes. Preference keys and deep-link
--   tabs unchanged. Payment amounts remain in metadata only (not displayed).
--
-- REGRESSION CHECK:
--   Trip Not Found: N/A (no trip query/route changes)
--   Auth desync: N/A (no auth changes)
--   RLS leaks: N/A (no new tables/policies; CREATE OR REPLACE functions only)
--   Payment state drift: N/A (notify copy only; amounts stay in metadata)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Broadcast
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_broadcast()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_name TEXT;
BEGIN
  PERFORM NEW.trip_id::uuid;

  SELECT COALESCE(NULLIF(TRIM(t.name), ''), 'your trip')
    INTO v_trip_name
  FROM public.trips t
  WHERE t.id = NEW.trip_id;

  v_trip_name := COALESCE(v_trip_name, 'your trip');

  PERFORM public.create_notification_for_trip_members(
    NEW.trip_id,
    NEW.created_by,
    'broadcast',
    'broadcast',
    NEW.id,
    'broadcasts',
    COALESCE(NEW.priority, 'normal'),
    '/trip/' || NEW.trip_id || '?tab=broadcasts',
    'New broadcast in ' || v_trip_name,
    'A new broadcast was posted in your ' ||
      CASE WHEN v_trip_name = 'your trip' THEN 'trip' ELSE v_trip_name || ' trip' END || '.',
    jsonb_build_object('broadcast_id', NEW.id, 'tab', 'broadcasts'),
    'broadcast:' || NEW.id::text
  );
  RETURN NEW;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Poll created
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_poll_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_name TEXT;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(t.name), ''), 'your trip')
    INTO v_trip_name
  FROM public.trips t
  WHERE t.id = NEW.trip_id;

  v_trip_name := COALESCE(v_trip_name, 'your trip');

  PERFORM public.create_notification_for_trip_members(
    NEW.trip_id,
    NEW.created_by,
    'poll',
    'poll',
    NEW.id,
    'polls',
    'normal',
    '/trip/' || NEW.trip_id || '?tab=polls',
    'New poll in ' || v_trip_name,
    'A new poll was created in your ' ||
      CASE WHEN v_trip_name = 'your trip' THEN 'trip' ELSE v_trip_name || ' trip' END || '.',
    jsonb_build_object('poll_id', NEW.id, 'tab', 'polls'),
    'poll_created:' || NEW.id::text
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Task created
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_task_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_name TEXT;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(t.name), ''), 'your trip')
    INTO v_trip_name
  FROM public.trips t
  WHERE t.id = NEW.trip_id;

  v_trip_name := COALESCE(v_trip_name, 'your trip');

  PERFORM public.create_notification_for_trip_members(
    NEW.trip_id,
    NEW.creator_id,
    'task',
    'task',
    NEW.id,
    'tasks',
    'normal',
    '/trip/' || NEW.trip_id || '?tab=tasks',
    'New task in ' || v_trip_name,
    'A new task was added in your ' ||
      CASE WHEN v_trip_name = 'your trip' THEN 'trip' ELSE v_trip_name || ' trip' END || '.',
    jsonb_build_object('task_id', NEW.id, 'tab', 'tasks'),
    'task_created:' || NEW.id::text
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Calendar event added
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_calendar_event_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_name TEXT;
BEGIN
  IF NEW.source_type IN ('gmail_import', 'bulk_import', 'import') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(t.name), ''), 'your trip')
    INTO v_trip_name
  FROM public.trips t
  WHERE t.id = NEW.trip_id;

  v_trip_name := COALESCE(v_trip_name, 'your trip');

  PERFORM public.create_notification_for_trip_members(
    NEW.trip_id,
    NEW.created_by,
    'calendar',
    'calendar_event',
    NEW.id,
    'calendar_events',
    'normal',
    '/trip/' || NEW.trip_id || '?tab=calendar',
    'New calendar event in ' || v_trip_name,
    'A calendar event was added to your ' ||
      CASE WHEN v_trip_name = 'your trip' THEN 'trip' ELSE v_trip_name || ' trip' END || '.',
    jsonb_build_object('event_id', NEW.id, 'tab', 'calendar', 'start_time', NEW.start_time),
    'calendar_added:' || NEW.id::text
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Basecamp added / updated (no street address in body)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_basecamp_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title TEXT;
  v_body  TEXT;
  v_key   TEXT;
  v_trip_name TEXT;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(t.name), ''), 'your trip')
    INTO v_trip_name
  FROM public.trips t
  WHERE t.id = NEW.trip_id;

  v_trip_name := COALESCE(v_trip_name, 'your trip');

  IF TG_OP = 'INSERT' THEN
    v_title := 'Basecamp added in ' || v_trip_name;
    v_body  := 'A basecamp was added to your ' ||
      CASE WHEN v_trip_name = 'your trip' THEN 'trip' ELSE v_trip_name || ' trip' END || '.';
    v_key   := 'basecamp_added:' || NEW.id::text;
  ELSE
    IF NEW.address IS NOT DISTINCT FROM OLD.address
       AND NEW.place_name IS NOT DISTINCT FROM OLD.place_name
       AND NEW.lat IS NOT DISTINCT FROM OLD.lat
       AND NEW.lng IS NOT DISTINCT FROM OLD.lng THEN
      RETURN NEW;
    END IF;
    v_title := 'Basecamp updated in ' || v_trip_name;
    v_body  := 'The basecamp was updated in your ' ||
      CASE WHEN v_trip_name = 'your trip' THEN 'trip' ELSE v_trip_name || ' trip' END || '.';
    v_key   := 'basecamp_updated:' || NEW.id::text || ':' ||
               EXTRACT(EPOCH FROM COALESCE(NEW.updated_at, NOW()))::text;
  END IF;

  PERFORM public.create_notification_for_trip_members(
    NEW.trip_id,
    NEW.created_by,
    'basecamp',
    'basecamp',
    NEW.id,
    'basecamp_updates',
    'normal',
    '/trip/' || NEW.trip_id || '?tab=places',
    v_title,
    v_body,
    jsonb_build_object('basecamp_id', NEW.id, 'tab', 'places'),
    v_key
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Payment request (no amount / description in body)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_name TEXT;
BEGIN
  IF NEW.trip_id IS NULL OR NEW.trip_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(t.name), ''), 'your trip')
    INTO v_trip_name
  FROM public.trips t
  WHERE t.id = NEW.trip_id::text;

  v_trip_name := COALESCE(v_trip_name, 'your trip');

  PERFORM public.create_notification_for_trip_members(
    NEW.trip_id::text,
    NEW.created_by,
    'payment',
    'payment',
    NEW.id,
    'payments',
    'high',
    '/trip/' || NEW.trip_id::text || '?tab=payments',
    'New payment request in ' || v_trip_name,
    'A new payment request was added to your ' ||
      CASE WHEN v_trip_name = 'your trip' THEN 'trip' ELSE v_trip_name || ' trip' END || '.',
    jsonb_build_object(
      'payment_id', NEW.id,
      'amount', NEW.amount,
      'currency', NEW.currency,
      'tab', 'payments'
    ),
    'payment:' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Pin created (preference = broadcasts; deep-link tab = chat)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_pin_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id TEXT;
  v_trip_name TEXT;
BEGIN
  SELECT m.trip_id::text INTO v_trip_id
  FROM public.trip_chat_messages m
  WHERE m.id = NEW.message_id;

  IF v_trip_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(t.name), ''), 'your trip')
    INTO v_trip_name
  FROM public.trips t
  WHERE t.id = v_trip_id;

  v_trip_name := COALESCE(v_trip_name, 'your trip');

  PERFORM public.create_notification_for_trip_members(
    v_trip_id,
    NEW.pinned_by,
    'pin',
    'pin',
    NEW.id,
    'broadcasts',
    'normal',
    '/trip/' || v_trip_id || '?tab=chat&filter=pinned',
    'Message pinned in ' || v_trip_name,
    'A message was pinned in your ' ||
      CASE WHEN v_trip_name = 'your trip' THEN 'trip' ELSE v_trip_name || ' trip' END || '.',
    jsonb_build_object(
      'pin_id', NEW.id,
      'message_id', NEW.message_id,
      'tab', 'chat'
    ),
    'pin:' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Task assignment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id TEXT;
  v_trip_name TEXT;
BEGIN
  SELECT t.trip_id::text INTO v_trip_id
  FROM public.trip_tasks t
  WHERE t.id = NEW.task_id;

  IF v_trip_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(tr.name), ''), 'your trip')
    INTO v_trip_name
  FROM public.trips tr
  WHERE tr.id = v_trip_id;

  v_trip_name := COALESCE(v_trip_name, 'your trip');

  PERFORM public.create_notification_for_trip_members(
    v_trip_id,
    NEW.user_id,
    'task',
    'task',
    NEW.task_id,
    'tasks',
    'normal',
    '/trip/' || v_trip_id || '?tab=tasks',
    'Task assigned in ' || v_trip_name,
    'A task was assigned in your ' ||
      CASE WHEN v_trip_name = 'your trip' THEN 'trip' ELSE v_trip_name || ' trip' END || '.',
    jsonb_build_object(
      'task_id', NEW.task_id,
      'assignee_user_id', NEW.user_id,
      'tab', 'tasks'
    ),
    'task_assignment:' || NEW.task_id::text || ':' || COALESCE(NEW.user_id::text, 'none')
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Member joined (no joiner display name)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_member_joined()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_trip_name TEXT;
  v_member RECORD;
  v_event_key TEXT;
  v_deep_link TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.status IS NOT NULL AND NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(name), ''), 'your trip')
    INTO v_trip_name
  FROM trips
  WHERE id = NEW.trip_id;

  v_trip_name := COALESCE(v_trip_name, 'your trip');
  v_title := 'New member in ' || v_trip_name;
  v_body := 'Someone joined your ' ||
    CASE WHEN v_trip_name = 'your trip' THEN 'trip' ELSE v_trip_name || ' trip' END || '.';

  v_event_key := 'member_joined:' || NEW.trip_id || ':' || NEW.user_id::text;
  v_deep_link := '/trip/' || NEW.trip_id || '?tab=collaborators';

  FOR v_member IN
    SELECT tm.user_id
    FROM trip_members tm
    WHERE tm.trip_id = NEW.trip_id
      AND tm.user_id IS NOT NULL
      AND tm.user_id <> NEW.user_id
      AND (tm.status IS NULL OR tm.status = 'active')
      AND NOT COALESCE(tm.notifications_muted, false)
  LOOP
    IF public.should_send_notification(v_member.user_id, 'join_requests') THEN
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
        v_title,
        v_body,
        'member_joined',
        NEW.trip_id,
        false,
        true,
        jsonb_build_object(
          'trip_id', NEW.trip_id,
          'trip_name', v_trip_name,
          'joined_user_id', NEW.user_id,
          'actor_user_id', NEW.user_id,
          'entity_type', 'trip_member',
          'entity_id', NEW.id,
          'tab', 'collaborators',
          'deep_link', v_deep_link,
          'fanout_event_key', v_event_key || ':' || v_member.user_id::text
        )
      )
      ON CONFLICT (user_id, type, fanout_event_key)
        WHERE fanout_event_key IS NOT NULL
        DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.notify_on_broadcast() IS
  'Broadcast fanout with generic trip-scoped alert copy (no message snippet).';
COMMENT ON FUNCTION public.notify_on_poll_created() IS
  'Poll fanout with generic trip-scoped alert copy (no question text).';
COMMENT ON FUNCTION public.notify_on_task_created() IS
  'Task-created fanout with generic trip-scoped alert copy (no task title).';
COMMENT ON FUNCTION public.notify_on_calendar_event_added() IS
  'Calendar fanout with generic trip-scoped alert copy (no event title).';
COMMENT ON FUNCTION public.notify_on_basecamp_change() IS
  'Basecamp fanout with generic trip-scoped alert copy (no address/place name).';
COMMENT ON FUNCTION public.notify_on_payment() IS
  'Payment fanout with generic trip-scoped alert copy (no amount/description).';
COMMENT ON FUNCTION public.notify_on_pin_created() IS
  'Pin fanout gated by broadcasts preference; deep-links to chat with tab=chat.';
COMMENT ON FUNCTION public.notify_on_member_joined() IS
  'Member-joined fanout with generic trip-scoped alert copy (no joiner name).';
