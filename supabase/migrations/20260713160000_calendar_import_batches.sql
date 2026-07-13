-- Durable calendar Smart Import batches + safe undo with edit-conflict detection.
-- Associates trip_events with an import batch so users can reverse a commit.
--
-- No-regressions check (chravel-no-regressions + chravel-supabase-rls):
-- - Additive schema only (new table + nullable import_batch_id). Does not change
--   trip loading, auth hydration, or payment state.
-- - RLS requires active trip_members OR trip creator (existence != access).
-- - undo RPC is SECURITY DEFINER but re-checks auth.uid() membership before
--   deleting; scoped to batch.trip_id only (no cross-trip deletion).

CREATE TABLE IF NOT EXISTS public.calendar_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_format TEXT NOT NULL,
  source_label TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN (
      'draft',
      'processing',
      'ready_for_review',
      'committing',
      'completed',
      'partially_completed',
      'failed',
      'cancelled',
      'reverted'
    )),
  events_imported INTEGER NOT NULL DEFAULT 0,
  events_skipped INTEGER NOT NULL DEFAULT 0,
  events_failed INTEGER NOT NULL DEFAULT 0,
  events_reverted INTEGER NOT NULL DEFAULT 0,
  events_conflicted INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  reverted_at TIMESTAMPTZ,
  CONSTRAINT calendar_import_batches_trip_idempotency_unique
    UNIQUE (trip_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS calendar_import_batches_trip_created_idx
  ON public.calendar_import_batches (trip_id, created_at DESC);

CREATE INDEX IF NOT EXISTS calendar_import_batches_created_by_idx
  ON public.calendar_import_batches (created_by, created_at DESC);

ALTER TABLE public.trip_events
  ADD COLUMN IF NOT EXISTS import_batch_id UUID
    REFERENCES public.calendar_import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS trip_events_import_batch_id_idx
  ON public.trip_events (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

ALTER TABLE public.calendar_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip members can view calendar import batches"
  ON public.calendar_import_batches;
CREATE POLICY "Trip members can view calendar import batches"
  ON public.calendar_import_batches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = calendar_import_batches.trip_id
        AND tm.user_id = (SELECT auth.uid())
        AND (tm.status IS NULL OR tm.status = 'active')
    )
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = calendar_import_batches.trip_id
        AND t.created_by = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Trip members can insert calendar import batches"
  ON public.calendar_import_batches;
CREATE POLICY "Trip members can insert calendar import batches"
  ON public.calendar_import_batches
  FOR INSERT
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.trip_members tm
        WHERE tm.trip_id = calendar_import_batches.trip_id
          AND tm.user_id = (SELECT auth.uid())
          AND (tm.status IS NULL OR tm.status = 'active')
      )
      OR EXISTS (
        SELECT 1 FROM public.trips t
        WHERE t.id = calendar_import_batches.trip_id
          AND t.created_by = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Trip members can update calendar import batches"
  ON public.calendar_import_batches;
CREATE POLICY "Trip members can update calendar import batches"
  ON public.calendar_import_batches
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = calendar_import_batches.trip_id
        AND tm.user_id = (SELECT auth.uid())
        AND (tm.status IS NULL OR tm.status = 'active')
    )
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = calendar_import_batches.trip_id
        AND t.created_by = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = calendar_import_batches.trip_id
        AND tm.user_id = (SELECT auth.uid())
        AND (tm.status IS NULL OR tm.status = 'active')
    )
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = calendar_import_batches.trip_id
        AND t.created_by = (SELECT auth.uid())
    )
  );

-- Safe undo: delete only events that still match their imported snapshot unless
-- p_force_delete_edited is true. Cross-trip access is denied by membership check.
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

  IF v_batch.status = 'reverted' THEN
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

  SELECT GREATEST(
    COALESCE(v_batch.events_imported, 0) - (v_reverted + v_conflicted),
    0
  ) INTO v_already_gone;

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

COMMENT ON TABLE public.calendar_import_batches IS
  'Durable Smart Import batch records for calendar event commits and undo.';
COMMENT ON FUNCTION public.undo_calendar_import_batch(UUID, BOOLEAN) IS
  'Reverts a calendar import batch. Skips events edited after import unless force flag is set.';
