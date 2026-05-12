-- Create trip_places: user-saved points of interest associated with a trip
-- (basecamp, restaurants, attractions). Backing table for the concierge
-- context aggregator's "saved places" lookup in tripContextAggregator.ts.

CREATE TABLE IF NOT EXISTS public.trip_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL,
  added_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  category TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_places_trip_idx ON public.trip_places (trip_id);
CREATE INDEX IF NOT EXISTS trip_places_added_by_idx ON public.trip_places (added_by);

ALTER TABLE public.trip_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip members can view trip places" ON public.trip_places;
CREATE POLICY "Trip members can view trip places"
  ON public.trip_places FOR SELECT
  USING (public.is_trip_member((SELECT auth.uid()), trip_id));

DROP POLICY IF EXISTS "Trip members can add trip places" ON public.trip_places;
CREATE POLICY "Trip members can add trip places"
  ON public.trip_places FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = added_by
    AND public.is_trip_member((SELECT auth.uid()), trip_id)
  );

DROP POLICY IF EXISTS "Adders can update their trip places" ON public.trip_places;
CREATE POLICY "Adders can update their trip places"
  ON public.trip_places FOR UPDATE
  USING ((SELECT auth.uid()) = added_by)
  WITH CHECK ((SELECT auth.uid()) = added_by);

DROP POLICY IF EXISTS "Adders can delete their trip places" ON public.trip_places;
CREATE POLICY "Adders can delete their trip places"
  ON public.trip_places FOR DELETE
  USING ((SELECT auth.uid()) = added_by);
