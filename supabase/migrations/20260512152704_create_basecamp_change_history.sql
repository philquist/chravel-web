-- Create basecamp_change_history: audit log of changes to a trip's basecamp
-- (shared trip basecamp or a member's personal basecamp). Read-only from the
-- client; writes happen via the basecamp_change_history trigger (added below)
-- on updates to trips.basecamp_* / trip_personal_basecamps.

CREATE TABLE IF NOT EXISTS public.basecamp_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  basecamp_type TEXT NOT NULL CHECK (basecamp_type IN ('trip', 'personal')),
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  previous_name TEXT,
  previous_address TEXT,
  previous_latitude DOUBLE PRECISION,
  previous_longitude DOUBLE PRECISION,
  new_name TEXT,
  new_address TEXT,
  new_latitude DOUBLE PRECISION,
  new_longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS basecamp_change_history_trip_idx
  ON public.basecamp_change_history (trip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS basecamp_change_history_user_idx
  ON public.basecamp_change_history (user_id);

ALTER TABLE public.basecamp_change_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip members can view basecamp change history" ON public.basecamp_change_history;
CREATE POLICY "Trip members can view basecamp change history"
  ON public.basecamp_change_history FOR SELECT
  USING (public.is_trip_member((SELECT auth.uid()), trip_id));

DROP POLICY IF EXISTS "Trip members can record basecamp changes" ON public.basecamp_change_history;
CREATE POLICY "Trip members can record basecamp changes"
  ON public.basecamp_change_history FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND public.is_trip_member((SELECT auth.uid()), trip_id)
  );
