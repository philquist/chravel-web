ALTER TABLE public.gmail_import_jobs
ADD COLUMN IF NOT EXISTS checkpoint_phase TEXT NOT NULL DEFAULT 'source_fetched'
  CHECK (checkpoint_phase IN ('source_fetched', 'artifacts_stored', 'applied_reviewed')),
ADD COLUMN IF NOT EXISTS source_fetched_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS artifacts_stored_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS applied_reviewed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.gmail_import_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.gmail_import_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  artifact_fingerprint TEXT NOT NULL,
  artifact_payload JSONB NOT NULL,
  source_subject TEXT,
  source_from TEXT,
  source_sent_date DATE,
  apply_status TEXT NOT NULL DEFAULT 'pending' CHECK (apply_status IN ('pending', 'applied', 'error')),
  apply_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, gmail_message_id, artifact_fingerprint)
);

ALTER TABLE public.gmail_import_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own import artifacts" ON public.gmail_import_artifacts FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.gmail_import_jobs WHERE id = public.gmail_import_artifacts.job_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can manage their own import artifacts" ON public.gmail_import_artifacts FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.gmail_import_jobs WHERE id = public.gmail_import_artifacts.job_id AND user_id = auth.uid()
  )
);
