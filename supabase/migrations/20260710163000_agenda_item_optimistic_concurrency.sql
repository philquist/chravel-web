-- B2: event_agenda_items collaborative editing was silent last-write-wins.
--
-- useEventAgenda.updateSession did a blind UPDATE with no version guard, so two event
-- organizers editing the same session concurrently would silently overwrite each other
-- (tasks/polls/calendar already use versioned RPCs). Add an optimistic-concurrency
-- `version` column and an update_agenda_item_with_version RPC that mirrors
-- update_event_with_version: row lock, active-admin authz, version check, version bump.

ALTER TABLE public.event_agenda_items
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.update_agenda_item_with_version(
  p_item_id uuid,
  p_current_version integer,
  p_title text,
  p_description text,
  p_session_date date,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_location text,
  p_speakers text[]
)
RETURNS SETOF public.event_agenda_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actual_version integer;
  v_event_id text;
BEGIN
  -- Lock the row and read its version + owning event.
  SELECT version, event_id
    INTO v_actual_version, v_event_id
  FROM public.event_agenda_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agenda item not found' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization mirrors the agenda UPDATE RLS: active event admin OR a trip admin.
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = v_event_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
        AND (tm.status IS NULL OR tm.status = 'active')
    )
    OR EXISTS (
      SELECT 1 FROM public.trip_admins ta
      WHERE ta.trip_id = v_event_id
        AND ta.user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: only an event admin can edit the agenda'
      USING ERRCODE = '42501';
  END IF;

  -- Optimistic concurrency (treat NULL as version 1 for any legacy rows).
  IF COALESCE(v_actual_version, 1) <> COALESCE(p_current_version, 1) THEN
    RAISE EXCEPTION 'Agenda item was modified by another user (expected version %, found %)',
      p_current_version, v_actual_version
      USING ERRCODE = 'P0001';
  END IF;

  -- Full-field replacement mirrors the previous blind UPDATE (which set exactly these
  -- columns); `track` is intentionally left untouched, as the client never sent it.
  RETURN QUERY
  UPDATE public.event_agenda_items
  SET title = p_title,
      description = p_description,
      session_date = p_session_date,
      start_time = p_start_time,
      end_time = p_end_time,
      location = p_location,
      speakers = p_speakers,
      version = COALESCE(version, 1) + 1,
      updated_at = now()
  WHERE id = p_item_id
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_agenda_item_with_version(
  uuid, integer, text, text, date, timestamptz, timestamptz, text, text[]
) TO authenticated;
