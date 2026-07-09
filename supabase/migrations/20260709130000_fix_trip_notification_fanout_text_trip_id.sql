-- ============================================================================
-- Fix create_notification_for_trip_members: p_trip_id must be TEXT, not UUID.
--
-- ROOT CAUSE (confirmed on live prod, project jmjiyekmxwsxkfnqwyaa):
--   public.trips.id and public.trip_members.trip_id are TEXT, but the canonical
--   fanout helper create_notification_for_trip_members declared p_trip_id UUID
--   (introduced in 20260512160000, carried through 20260610090000 and
--   20260610110000). Inside the body it compares:
--       SELECT ... FROM public.trips t       WHERE t.id       = p_trip_id
--       SELECT ... FROM public.trip_members  WHERE tm.trip_id = p_trip_id
--   Both are `text = uuid`, for which this database has NO operator:
--       ERROR 42883: operator does not exist: text = uuid
--   Every trigger that routes an INSERT through this helper therefore raises,
--   which rolls back the producing row. On prod the only live caller is
--   notify_on_broadcast (poll/calendar wrappers are self-contained; the task/
--   payment/pin canonical wrappers never applied because 20260512160000 aborted
--   at the absent trip_broadcasts table). So broadcasts currently fail to fan
--   out — and any future caller wired through the helper would fail the same way.
--
-- FIX:
--   1. DROP the old uuid-signature overload explicitly (exact arg list) so no
--      ambiguous uuid+text pair can survive Postgres function overloading.
--   2. Recreate the helper with p_trip_id TEXT. All trip-id comparisons are now
--      text = text. p_entity_id stays UUID (broadcast/poll/task ids are uuid).
--      notifications.trip_id is UUID, so the row insert casts p_trip_id::uuid
--      (callers guard non-uuid trip ids before reaching here — see below).
--      Body is otherwise IDENTICAL to 20260610110000 (mute gate, deterministic
--      idempotency key, ON CONFLICT ... WHERE partial-index predicate). The
--      idempotency key is unchanged: p_trip_id::TEXT was already text-serialized.
--   3. Recreate notify_on_broadcast to pass NEW.trip_id (TEXT) to the now-text
--      helper. The uuid parse remains ONLY as a validation gate that skips
--      fanout for demo/mock non-uuid trip ids (so the notifications.trip_id uuid
--      insert can never fail on a bad cast). No other live function references
--      the helper (verified via pg_get_functiondef scan on prod).
--
-- This is a type-correctness fix, not a fanout redesign: recipients, actor
-- exclusion, preference gating, per-trip mute, and dedup semantics are preserved.
-- No table columns change, so src/integrations/supabase/types.ts is unaffected.
-- ============================================================================

-- 1) Remove the broken uuid-signature overload (exact identity args).
DROP FUNCTION IF EXISTS public.create_notification_for_trip_members(
  uuid, uuid, text, text, uuid, text, text, text, text, text, jsonb, text
);

-- 2) Canonical fanout with p_trip_id TEXT (matches trips.id / trip_members.trip_id).
CREATE OR REPLACE FUNCTION public.create_notification_for_trip_members(
  p_trip_id TEXT,
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
    CONCAT_WS(':', p_trip_id, p_notification_type, p_entity_type, v_entity_id_text)
  );

  FOR v_member IN
    SELECT tm.user_id
    FROM public.trip_members tm
    WHERE tm.trip_id = p_trip_id
      AND tm.user_id IS NOT NULL
      AND NOT COALESCE(tm.notifications_muted, false)
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
        p_trip_id::uuid,
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
      -- Predicate is required for Postgres to infer the partial unique index
      -- notifications_user_type_fanout_event_key_uidx (fix for 42P10).
      ON CONFLICT (user_id, type, fanout_event_key)
        WHERE fanout_event_key IS NOT NULL
        DO NOTHING;

      IF FOUND THEN
        v_inserted_count := v_inserted_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_inserted_count;
END;
$$;

COMMENT ON FUNCTION public.create_notification_for_trip_members(
  text, uuid, text, text, uuid, text, text, text, text, text, jsonb, text
) IS
  'Canonical trip-member notification fanout. p_trip_id is TEXT to match '
  'trips.id / trip_members.trip_id (both TEXT). Actor exclusion, per-trip mute, '
  'preference gating, and per-recipient idempotency are enforced here.';

-- 3) Broadcast wrapper passes NEW.trip_id (TEXT) to the now-text helper.
--    The uuid parse remains ONLY as a validation gate: demo/mock broadcasts with
--    a non-uuid trip_id skip fanout so the notifications.trip_id (uuid) insert
--    can never fail on an invalid cast.
CREATE OR REPLACE FUNCTION public.notify_on_broadcast()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- broadcasts.trip_id is TEXT; demo/mock trips can carry non-UUID ids.
  -- A notification fanout must never abort the broadcast INSERT itself,
  -- so skip fanout (instead of raising) when trip_id is not a UUID.
  PERFORM NEW.trip_id::uuid;

  PERFORM public.create_notification_for_trip_members(
    NEW.trip_id,
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
EXCEPTION
  WHEN invalid_text_representation THEN
    -- Non-UUID (demo/mock) trip_id: skip fanout, never block the broadcast.
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_on_broadcast IS
  'Canonical broadcast notification fanout for public.broadcasts (message/created_by/priority columns; TEXT trip_id). Passes TEXT trip_id to create_notification_for_trip_members; skips fanout for non-UUID trip ids.';
