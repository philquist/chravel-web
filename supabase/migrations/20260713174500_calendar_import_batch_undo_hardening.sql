-- Harden calendar import batch undo after PR #820 review:
-- 1) Undo short-circuits only when no linked trip_events remain
-- 2) Drop client UPDATE policy; finalize via SECURITY DEFINER RPC
-- 3) Prevent client status poisoning that blocks undo

-- No-regressions: additive RPC + policy tighten only. Does not change trip
-- loading, auth hydration, or payment state. Membership still required.

CREATE OR REPLACE FUNCTION public.undo_calendar_import_batch(
  p_batch_id UUID,
  p_force_delete_edited BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch public.calendar_import_batches%ROWTYPE;
  v_reverted INTEGER := 0;
  v_conflicted INTEGER := 0;
  v_already_gone INTEGER := 0;
  v_remaining INTEGER := 0;
  v_event RECORD;
  v_snapshot JSONB;
  v_matches BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_batch
  FROM public.calendar_import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import batch not found';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = v_batch.trip_id
        AND tm.user_id = v_uid
        AND (tm.status IS NULL OR tm.status = 'active')
    )
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = v_batch.trip_id
        AND t.created_by = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to undo this import';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_remaining
  FROM public.trip_events
  WHERE import_batch_id = p_batch_id
    AND trip_id = v_batch.trip_id;

  -- Only treat as repeat-safe no-op when status is reverted AND no events remain.
  IF v_batch.status = 'reverted' AND v_remaining = 0 THEN
    RETURN jsonb_build_object(
      'batch_id', v_batch.id,
      'status', 'reverted',
      'reverted', COALESCE(v_batch.events_reverted, 0),
      'conflicted', COALESCE(v_batch.events_conflicted, 0),
      'already_gone', 0,
      'repeat_safe', true
    );
  END IF;

  FOR v_event IN
    SELECT id, title, start_time, end_time, location, description, source_data
    FROM public.trip_events
    WHERE import_batch_id = p_batch_id
      AND trip_id = v_batch.trip_id
  LOOP
    v_snapshot := COALESCE(v_event.source_data -> 'import_snapshot', '{}'::jsonb);
    v_matches :=
      COALESCE(v_event.title, '') = COALESCE(v_snapshot ->> 'title', v_event.title, '')
      AND COALESCE(v_event.start_time::text, '') = COALESCE(v_snapshot ->> 'start_time', v_event.start_time::text, '')
      AND COALESCE(v_event.end_time::text, '') = COALESCE(v_snapshot ->> 'end_time', COALESCE(v_event.end_time::text, ''))
      AND COALESCE(v_event.location, '') = COALESCE(v_snapshot ->> 'location', COALESCE(v_event.location, ''));

    IF v_matches OR p_force_delete_edited THEN
      DELETE FROM public.trip_events
      WHERE id = v_event.id
        AND trip_id = v_batch.trip_id;
      v_reverted := v_reverted + 1;
    ELSE
      v_conflicted := v_conflicted + 1;
    END IF;
  END LOOP;

  v_already_gone := GREATEST(v_remaining - (v_reverted + v_conflicted), 0);

  UPDATE public.calendar_import_batches
  SET
    status = 'reverted',
    events_reverted = v_reverted,
    events_conflicted = v_conflicted,
    reverted_at = now()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'status', 'reverted',
    'reverted', v_reverted,
    'conflicted', v_conflicted,
    'already_gone', v_already_gone,
    'repeat_safe', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.undo_calendar_import_batch(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.undo_calendar_import_batch(UUID, BOOLEAN) TO authenticated;

-- Finalize counters/status only via SECURITY DEFINER RPC (not client UPDATE).
CREATE OR REPLACE FUNCTION public.finalize_calendar_import_batch(
  p_batch_id UUID,
  p_imported INTEGER,
  p_skipped INTEGER,
  p_failed INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch public.calendar_import_batches%ROWTYPE;
  v_status TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_batch
  FROM public.calendar_import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import batch not found';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = v_batch.trip_id
        AND tm.user_id = v_uid
        AND (tm.status IS NULL OR tm.status = 'active')
    )
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = v_batch.trip_id
        AND t.created_by = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to finalize this import';
  END IF;

  IF v_batch.status = 'reverted' THEN
    RAISE EXCEPTION 'Cannot finalize a reverted import batch';
  END IF;

  IF COALESCE(p_imported, 0) > 0 AND COALESCE(p_failed, 0) > 0 THEN
    v_status := 'partially_completed';
  ELSIF COALESCE(p_imported, 0) > 0 THEN
    v_status := 'completed';
  ELSIF COALESCE(p_failed, 0) > 0 THEN
    v_status := 'failed';
  ELSE
    v_status := 'completed';
  END IF;

  UPDATE public.calendar_import_batches
  SET
    status = v_status,
    events_imported = COALESCE(p_imported, 0),
    events_skipped = COALESCE(p_skipped, 0),
    events_failed = COALESCE(p_failed, 0),
    completed_at = now()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'status', v_status,
    'imported', COALESCE(p_imported, 0),
    'skipped', COALESCE(p_skipped, 0),
    'failed', COALESCE(p_failed, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_calendar_import_batch(UUID, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_calendar_import_batch(UUID, INTEGER, INTEGER, INTEGER) TO authenticated;

-- Clients may SELECT/INSERT batches; terminal status transitions go through RPCs only.
DROP POLICY IF EXISTS "Trip members can update calendar import batches"
  ON public.calendar_import_batches;

COMMENT ON FUNCTION public.finalize_calendar_import_batch(UUID, INTEGER, INTEGER, INTEGER) IS
  'Finalizes calendar import batch counters/status. Client UPDATE on calendar_import_batches is disallowed.';
COMMENT ON FUNCTION public.undo_calendar_import_batch(UUID, BOOLEAN) IS
  'Reverts a calendar import batch. Short-circuits only when already reverted and no linked events remain.';
