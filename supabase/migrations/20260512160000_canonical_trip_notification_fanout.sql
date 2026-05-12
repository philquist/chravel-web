-- Canonical trip-member notification fanout
-- Consolidates actor exclusion, membership validation, user preference gating, and idempotency.

-- 1) Idempotency key materialized column + unique index (safe for retries / duplicate event delivery)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS fanout_event_key TEXT
  GENERATED ALWAYS AS ((metadata->>'fanout_event_key')) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_type_fanout_event_key_uidx
  ON public.notifications (user_id, type, fanout_event_key)
  WHERE fanout_event_key IS NOT NULL;

-- 2) Canonical fanout function
CREATE OR REPLACE FUNCTION public.create_notification_for_trip_members(
  p_trip_id UUID,
  p_actor_user_id UUID,
  p_notification_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_preference_key TEXT,
  p_priority TEXT DEFAULT 'normal',
  p_deep_link TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_event_key TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_trip_name TEXT;
  v_inserted_count INTEGER := 0;
  v_event_key TEXT;
  v_effective_event_key TEXT;
  v_entity_id_text TEXT := COALESCE(p_entity_id::TEXT, 'none');
BEGIN
  IF p_trip_id IS NULL THEN
    RAISE EXCEPTION 'create_notification_for_trip_members requires p_trip_id';
  END IF;

  SELECT t.name INTO v_trip_name
  FROM public.trips t
  WHERE t.id = p_trip_id;

  -- Strong, deterministic idempotency key usable across trigger/webhook retries
  v_effective_event_key := COALESCE(
    p_event_key,
    CONCAT_WS(':', p_trip_id::TEXT, p_notification_type, p_entity_type, v_entity_id_text)
  );

  FOR v_member IN
    SELECT tm.user_id
    FROM public.trip_members tm
    WHERE tm.trip_id = p_trip_id
      AND tm.user_id IS NOT NULL
      AND (p_actor_user_id IS NULL OR tm.user_id <> p_actor_user_id)
  LOOP
    -- Single-source membership + preference gate
    IF public.should_send_notification(v_member.user_id, p_preference_key) THEN
      v_event_key := CONCAT(v_effective_event_key, ':', v_member.user_id::TEXT);

      INSERT INTO public.notifications (
        user_id,
        trip_id,
        type,
        title,
        message,
        metadata,
        is_read,
        is_visible
      )
      VALUES (
        v_member.user_id,
        p_trip_id,
        p_notification_type,
        COALESCE(p_title, 'Trip update in ' || COALESCE(v_trip_name, 'your trip')),
        COALESCE(p_message, 'There is a new update.'),
        COALESCE(p_metadata, '{}'::jsonb)
          || jsonb_build_object(
            'trip_id', p_trip_id,
            'trip_name', v_trip_name,
            'actor_user_id', p_actor_user_id,
            'entity_type', p_entity_type,
            'entity_id', p_entity_id,
            'priority', COALESCE(p_priority, 'normal'),
            'deep_link', p_deep_link,
            'fanout_event_key', v_event_key
          ),
        false,
        true
      )
      ON CONFLICT (user_id, type, fanout_event_key) DO NOTHING;

      IF FOUND THEN
        v_inserted_count := v_inserted_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_inserted_count;
END;
$$;

-- 3) Category-specific trigger wrappers routed through canonical fanout

CREATE OR REPLACE FUNCTION public.notify_on_broadcast()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_notification_for_trip_members(
    NEW.trip_id,
    NEW.created_by,
    'broadcast',
    'broadcast',
    NEW.id,
    'broadcasts',
    COALESCE(NEW.priority, 'normal'),
    '/trip/' || NEW.trip_id::text || '?tab=broadcasts',
    COALESCE(NEW.title, 'New broadcast'),
    LEFT(COALESCE(NEW.content, ''), 140),
    jsonb_build_object('broadcast_id', NEW.id),
    'broadcast:' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_notification_for_trip_members(
    NEW.trip_id,
    NEW.user_id,
    'chat',
    'chat_message',
    NEW.id,
    'chat',
    'normal',
    '/trip/' || NEW.trip_id::text || '?tab=chat',
    COALESCE(NEW.author_name, 'Someone') || ' sent a message',
    LEFT(COALESCE(NEW.content, ''), 140),
    jsonb_build_object('message_id', NEW.id),
    'chat_message:' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_calendar_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_notification_for_trip_members(
    NEW.trip_id,
    NEW.created_by,
    'calendar',
    'calendar_event',
    NEW.id,
    'calendar',
    'normal',
    '/trip/' || NEW.trip_id::text || '?tab=calendar',
    'New calendar event',
    COALESCE(NEW.title, 'Calendar updated'),
    jsonb_build_object('event_id', NEW.id),
    'calendar_event:' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_poll_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_notification_for_trip_members(
    NEW.trip_id,
    NEW.created_by,
    'poll',
    'poll',
    NEW.id,
    'polls',
    'normal',
    '/trip/' || NEW.trip_id::text || '?tab=polls',
    'New poll created',
    COALESCE(NEW.question, 'A new poll was posted'),
    jsonb_build_object('poll_id', NEW.id),
    'poll:' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id UUID;
BEGIN
  SELECT t.trip_id INTO v_trip_id
  FROM public.trip_tasks t
  WHERE t.id = NEW.task_id;

  IF v_trip_id IS NOT NULL THEN
    PERFORM public.create_notification_for_trip_members(
      v_trip_id,
      NEW.user_id,
      'task',
      'task',
      NEW.task_id,
      'tasks',
      'normal',
      '/trip/' || v_trip_id::text || '?tab=tasks',
      'Task assigned',
      'A new task assignment was added',
      jsonb_build_object('task_id', NEW.task_id, 'assignee_user_id', NEW.user_id),
      'task_assignment:' || NEW.task_id::text || ':' || COALESCE(NEW.user_id::text, 'none')
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_notification_for_trip_members(
    NEW.trip_id,
    NEW.payer_id,
    'payment',
    'payment',
    NEW.id,
    'payments',
    'high',
    '/trip/' || NEW.trip_id::text || '?tab=payments',
    'New payment activity',
    COALESCE(NEW.title, 'Payment update'),
    jsonb_build_object('payment_id', NEW.id),
    'payment:' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

-- Optional pin support (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pinned_messages'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.notify_on_pin_created()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      DECLARE
        v_trip_id UUID;
      BEGIN
        SELECT m.trip_id INTO v_trip_id FROM public.trip_chat_messages m WHERE m.id = NEW.message_id;
        IF v_trip_id IS NOT NULL THEN
          PERFORM public.create_notification_for_trip_members(
            v_trip_id,
            NEW.pinned_by,
            'pin',
            'pin',
            NEW.id,
            'chat',
            'normal',
            '/trip/' || v_trip_id::text || '?tab=chat&filter=pinned',
            'Message pinned',
            'A message was pinned in chat',
            jsonb_build_object('pin_id', NEW.id, 'message_id', NEW.message_id),
            'pin:' || NEW.id::text
          );
        END IF;
        RETURN NEW;
      END;
      $$;
    $fn$;
  END IF;
END $$;


-- 3b) Ensure all category triggers route through canonical wrappers
DROP TRIGGER IF EXISTS trigger_notify_broadcast ON public.trip_broadcasts;
CREATE TRIGGER trigger_notify_broadcast
  AFTER INSERT ON public.trip_broadcasts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_broadcast();

DROP TRIGGER IF EXISTS trigger_notify_chat_message ON public.trip_chat_messages;
CREATE TRIGGER trigger_notify_chat_message
  AFTER INSERT ON public.trip_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_chat_message();

DROP TRIGGER IF EXISTS trigger_notify_calendar_event ON public.calendar_events;
CREATE TRIGGER trigger_notify_calendar_event
  AFTER INSERT ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_calendar_event();

DROP TRIGGER IF EXISTS trigger_notify_payment ON public.trip_payments;
CREATE TRIGGER trigger_notify_payment
  AFTER INSERT ON public.trip_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_payment();

DROP TRIGGER IF EXISTS trigger_notify_task ON public.task_assignments;
CREATE TRIGGER trigger_notify_task
  AFTER INSERT ON public.task_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_task_assignment();

DROP TRIGGER IF EXISTS trigger_notify_poll_created ON public.trip_polls;
CREATE TRIGGER trigger_notify_poll_created
  AFTER INSERT ON public.trip_polls
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_poll_created();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pinned_messages'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trigger_notify_pin_created ON public.pinned_messages';
    EXECUTE 'CREATE TRIGGER trigger_notify_pin_created AFTER INSERT ON public.pinned_messages FOR EACH ROW EXECUTE FUNCTION public.notify_on_pin_created()';
  END IF;
END $$;

-- 4) Deterministic verification queries (run manually in SQL editor)
-- These checks validate each category path is routed through create_notification_for_trip_members
-- and that idempotency keys prevent duplicate fanout rows.
--
-- Pattern (use one category/event key at a time):
-- 1) Fire the underlying event once.
-- 2) Re-fire the same INSERT payload (or replay webhook) to simulate duplicate delivery.
-- 3) Validate actual recipients == expected recipients and duplicates == 0.
--
-- Expected recipients for one event:
--   SELECT count(*)
--   FROM public.trip_members tm
--   WHERE tm.trip_id = :trip_id
--     AND tm.user_id <> :actor_user_id
--     AND public.should_send_notification(tm.user_id, :preference_key);
--
-- Broadcast path (entity_type=broadcast)
-- SELECT
--   count(*) FILTER (WHERE metadata->>'entity_type' = 'broadcast') AS actual_rows,
--   count(*) FILTER (WHERE metadata->>'entity_type' = 'broadcast')
--     - count(DISTINCT user_id) FILTER (WHERE metadata->>'entity_type' = 'broadcast') AS duplicate_rows
-- FROM public.notifications
-- WHERE trip_id = :trip_id
--   AND metadata->>'fanout_event_key' LIKE 'broadcast:%';
--
-- Pin path (entity_type=pin)
-- SELECT count(*) AS pin_rows
-- FROM public.notifications
-- WHERE trip_id = :trip_id
--   AND metadata->>'entity_type' = 'pin'
--   AND metadata->>'fanout_event_key' LIKE 'pin:%';
--
-- Calendar path (entity_type=calendar_event)
-- SELECT count(*) AS calendar_rows
-- FROM public.notifications
-- WHERE trip_id = :trip_id
--   AND metadata->>'entity_type' = 'calendar_event'
--   AND metadata->>'fanout_event_key' LIKE 'calendar_event:%';
--
-- Payment path (entity_type=payment)
-- SELECT count(*) AS payment_rows
-- FROM public.notifications
-- WHERE trip_id = :trip_id
--   AND metadata->>'entity_type' = 'payment'
--   AND metadata->>'fanout_event_key' LIKE 'payment:%';
--
-- Task path (entity_type=task)
-- SELECT count(*) AS task_rows
-- FROM public.notifications
-- WHERE trip_id = :trip_id
--   AND metadata->>'entity_type' = 'task'
--   AND metadata->>'fanout_event_key' LIKE 'task_assignment:%';
--
-- Poll path (entity_type=poll)
-- SELECT count(*) AS poll_rows
-- FROM public.notifications
-- WHERE trip_id = :trip_id
--   AND metadata->>'entity_type' = 'poll'
--   AND metadata->>'fanout_event_key' LIKE 'poll:%';
--
-- Chat path (entity_type=chat_message)
-- SELECT count(*) AS chat_rows
-- FROM public.notifications
-- WHERE trip_id = :trip_id
--   AND metadata->>'entity_type' = 'chat_message'
--   AND metadata->>'fanout_event_key' LIKE 'chat_message:%';
