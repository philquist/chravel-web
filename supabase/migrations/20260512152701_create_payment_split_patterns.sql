-- Create payment_split_patterns: ML-style frequency table for suggesting
-- expense-split participants based on a user's prior splits on the same trip.
-- Schema matches the inserts/selects in src/services/chatAnalysisService.ts.

CREATE TABLE IF NOT EXISTS public.payment_split_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  frequency INTEGER NOT NULL DEFAULT 1,
  last_split_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_split_patterns_unique UNIQUE (trip_id, user_id, participant_id)
);

CREATE INDEX IF NOT EXISTS payment_split_patterns_trip_user_idx
  ON public.payment_split_patterns (trip_id, user_id, frequency DESC);

ALTER TABLE public.payment_split_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own split patterns" ON public.payment_split_patterns;
CREATE POLICY "Users can read their own split patterns"
  ON public.payment_split_patterns FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own split patterns" ON public.payment_split_patterns;
CREATE POLICY "Users can insert their own split patterns"
  ON public.payment_split_patterns FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND public.is_trip_member((SELECT auth.uid()), trip_id)
  );

DROP POLICY IF EXISTS "Users can update their own split patterns" ON public.payment_split_patterns;
CREATE POLICY "Users can update their own split patterns"
  ON public.payment_split_patterns FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own split patterns" ON public.payment_split_patterns;
CREATE POLICY "Users can delete their own split patterns"
  ON public.payment_split_patterns FOR DELETE
  USING ((SELECT auth.uid()) = user_id);
