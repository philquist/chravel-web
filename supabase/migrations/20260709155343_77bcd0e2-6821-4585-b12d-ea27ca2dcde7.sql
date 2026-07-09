-- ============================================================================
-- Fill notification-fanout gaps for polls, tasks, calendar events, basecamp
-- so preference toggles in Settings actually surface rows in the Alerts panel.
-- Broadcasts / mentions / task-assignment / payment / trip-invite / member-joined
-- fanouts already exist and are untouched.
-- ============================================================================

-- 1) Poll created
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
    '/trip/' || NEW.trip_id || '?tab=polls',
    'New poll',
    LEFT(COALESCE(NEW.question, ''), 140),
    jsonb_build_object('poll_id', NEW.id, 'tab', 'polls'),
    'poll_created:' || NEW.id::text
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_poll_created ON public.trip_polls;
CREATE TRIGGER trigger_notify_poll_created
  AFTER INSERT ON public.trip_polls
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_poll_created();

-- 2) Task created (assignment fanout is a separate existing trigger)
CREATE OR REPLACE FUNCTION public.notify_on_task_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_notification_for_trip_members(
    NEW.trip_id,
    NEW.creator_id,
    'task',
    'task',
    NEW.id,
    'tasks',
    'normal',
    '/trip/' || NEW.trip_id || '?tab=tasks',
    'New task',
    LEFT(COALESCE(NEW.title, ''), 140),
    jsonb_build_object('task_id', NEW.id, 'tab', 'tasks'),
    'task_created:' || NEW.id::text
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_task_created ON public.trip_tasks;
CREATE TRIGGER trigger_notify_task_created
  AFTER INSERT ON public.trip_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_task_created();

-- 3) Calendar event added (skip bulk-import inserts; those have their own path)
CREATE OR REPLACE FUNCTION public.notify_on_calendar_event_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source_type IN ('gmail_import', 'bulk_import', 'import') THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_notification_for_trip_members(
    NEW.trip_id,
    NEW.created_by,
    'calendar',
    'calendar_event',
    NEW.id,
    'calendar_events',
    'normal',
    '/trip/' || NEW.trip_id || '?tab=calendar',
    'New calendar event',
    LEFT(COALESCE(NEW.title, ''), 140),
    jsonb_build_object('event_id', NEW.id, 'tab', 'calendar', 'start_time', NEW.start_time),
    'calendar_added:' || NEW.id::text
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_calendar_event_added ON public.trip_events;
CREATE TRIGGER trigger_notify_calendar_event_added
  AFTER INSERT ON public.trip_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_calendar_event_added();

-- 4) Basecamp changed (insert or address-material update on trip_base_camps)
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
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_title := 'Basecamp added';
    v_body  := COALESCE(NEW.place_name, NEW.address, 'Trip basecamp added');
    v_key   := 'basecamp_added:' || NEW.id::text;
  ELSE
    IF NEW.address IS NOT DISTINCT FROM OLD.address
       AND NEW.place_name IS NOT DISTINCT FROM OLD.place_name
       AND NEW.lat IS NOT DISTINCT FROM OLD.lat
       AND NEW.lng IS NOT DISTINCT FROM OLD.lng THEN
      RETURN NEW;
    END IF;
    v_title := 'Basecamp updated';
    v_body  := COALESCE(NEW.place_name, NEW.address, 'Trip basecamp updated');
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
    LEFT(v_body, 140),
    jsonb_build_object('basecamp_id', NEW.id, 'tab', 'places'),
    v_key
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_basecamp_change ON public.trip_base_camps;
CREATE TRIGGER trigger_notify_basecamp_change
  AFTER INSERT OR UPDATE ON public.trip_base_camps
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_basecamp_change();

COMMENT ON FUNCTION public.notify_on_poll_created() IS
  'In-app notification fanout for trip_polls INSERT. Gated by should_send_notification(user, ''polls'').';
COMMENT ON FUNCTION public.notify_on_task_created() IS
  'In-app notification fanout for trip_tasks INSERT. Assignment fanout is a separate existing trigger.';
COMMENT ON FUNCTION public.notify_on_calendar_event_added() IS
  'In-app notification fanout for trip_events INSERT. Skips bulk-import source_types.';
COMMENT ON FUNCTION public.notify_on_basecamp_change() IS
  'In-app notification fanout for trip_base_camps INSERT/UPDATE (address/place/lat/lng material changes).';
