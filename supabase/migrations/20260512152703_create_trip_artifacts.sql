-- Create trip_artifacts: imported documents and parsed reservations from
-- Gmail/PDF/manual upload. Schema matches the inserts in
-- supabase/functions/artifact-ingest/index.ts and the selects in
-- supabase/functions/export-trip/data.ts + src/services/tripExportDataService.ts.

CREATE TABLE IF NOT EXISTS public.trip_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'upload',
  mime_type TEXT,
  file_name TEXT,
  file_url TEXT,
  file_size_bytes BIGINT,
  artifact_type TEXT NOT NULL DEFAULT 'unknown',
  artifact_type_confidence NUMERIC(4, 3) NOT NULL DEFAULT 0,
  classification_method TEXT,
  extracted_text TEXT,
  extracted_entities JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_summary TEXT,
  embedding_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  embedding_input_modality TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_artifacts_trip_idx ON public.trip_artifacts (trip_id);
CREATE INDEX IF NOT EXISTS trip_artifacts_creator_idx ON public.trip_artifacts (creator_id);
CREATE INDEX IF NOT EXISTS trip_artifacts_embedding_status_idx
  ON public.trip_artifacts (embedding_status);
CREATE INDEX IF NOT EXISTS trip_artifacts_smart_import_candidate_idx
  ON public.trip_artifacts ((metadata->>'smart_import_candidate_id'))
  WHERE metadata ? 'smart_import_candidate_id';

ALTER TABLE public.trip_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip members can view artifacts" ON public.trip_artifacts;
CREATE POLICY "Trip members can view artifacts"
  ON public.trip_artifacts FOR SELECT
  USING (public.is_trip_member((SELECT auth.uid()), trip_id));

DROP POLICY IF EXISTS "Trip members can insert artifacts" ON public.trip_artifacts;
CREATE POLICY "Trip members can insert artifacts"
  ON public.trip_artifacts FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = creator_id
    AND public.is_trip_member((SELECT auth.uid()), trip_id)
  );

DROP POLICY IF EXISTS "Creators can update their artifacts" ON public.trip_artifacts;
CREATE POLICY "Creators can update their artifacts"
  ON public.trip_artifacts FOR UPDATE
  USING ((SELECT auth.uid()) = creator_id)
  WITH CHECK ((SELECT auth.uid()) = creator_id);

DROP POLICY IF EXISTS "Creators can delete their artifacts" ON public.trip_artifacts;
CREATE POLICY "Creators can delete their artifacts"
  ON public.trip_artifacts FOR DELETE
  USING ((SELECT auth.uid()) = creator_id);
