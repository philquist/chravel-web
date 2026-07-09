-- member_joined producer: notify EXISTING trip members when someone new joins.
--
-- The `member_joined` type + `join_requests` category were already modelled end
-- to end (TYPE_TO_CATEGORY_MAP, notificationContentBuilder, frontend categoryMap
-- -> deepLinkTab 'collaborators'), but nothing ever emitted the event. This adds
-- an AFTER INSERT trigger on public.trip_members.
--
-- Design notes:
--   * Self-contained fanout (does NOT call create_notification_for_trip_members),
--     because that helper takes p_trip_id UUID while trip_members.trip_id is TEXT
--     (trips.id is TEXT) — `text = uuid` has no operator in this DB and would
--     error. This mirrors the proven notify_on_chat_message() pattern, which
--     iterates trip_members on the TEXT trip_id directly.
--   * Actor exclusion: the joiner (NEW.user_id) is never notified about their
--     own join.
--   * Only fires for active memberships (status active/NULL); pending/left rows
--     produce nothing. The initial creator self-insert notifies nobody because
--     there are no other members yet.
--   * Idempotency: fanout_event_key 'member_joined:<trip>:<joiner>:<recipient>'
--     + the partial unique index on (user_id, type, fanout_event_key) dedupes
--     retries and re-inserts.
--   * Gated per-recipient by should_send_notification(user, 'join_requests') and
--     the per-trip mute flag.

-- Idempotency scaffolding (defensive: normally added by
-- 20260512160000_canonical_trip_notification_fanout.sql).
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS fanout_event_key TEXT
  GENERATED ALWAYS AS ((metadata->>'fanout_event_key')) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_type_fanout_event_key_uidx
  ON public.notifications (user_id, type, fanout_event_key)
  WHERE fanout_event_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_on_member_joined()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_trip_name TEXT;
  v_joiner_name TEXT;
  v_member RECORD;
  v_event_key TEXT;
  v_deep_link TEXT;
BEGIN
  -- Only announce genuinely active memberships.
  IF NEW.status IS NOT NULL AND NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_trip_name FROM trips WHERE id = NEW.trip_id;

  SELECT COALESCE(display_name, NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''), 'A new member')
    INTO v_joiner_name
  FROM profiles
  WHERE user_id = NEW.user_id;
  v_joiner_name := COALESCE(v_joiner_name, 'A new member');

  v_event_key := 'member_joined:' || NEW.trip_id || ':' || NEW.user_id::text;
  v_deep_link := '/trip/' || NEW.trip_id || '?tab=collaborators';

  -- Notify each other active member (exclude the joiner) that respects the
  -- join_requests preference and has not muted this trip.
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
        v_joiner_name || ' joined ' || COALESCE(v_trip_name, 'your trip'),
        v_joiner_name || ' is now a member of the trip.',
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

DROP TRIGGER IF EXISTS trigger_notify_member_joined ON public.trip_members;
CREATE TRIGGER trigger_notify_member_joined
  AFTER INSERT ON public.trip_members
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_member_joined();
