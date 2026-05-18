-- Multi-base-camp support for shared trip and private personal accommodations.
-- Additive migration: legacy trips.basecamp_* stays intact for backward compatibility.

CREATE TABLE IF NOT EXISTS public.trip_base_camps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT,
  place_name TEXT,
  address TEXT NOT NULL,
  google_place_id TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  city TEXT,
  region TEXT,
  country TEXT,
  start_date DATE,
  end_date DATE,
  order_index INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_base_camps_trip_idx ON public.trip_base_camps(trip_id);
CREATE INDEX IF NOT EXISTS trip_base_camps_trip_order_idx ON public.trip_base_camps(trip_id, order_index);
CREATE INDEX IF NOT EXISTS trip_base_camps_trip_date_idx ON public.trip_base_camps(trip_id, start_date, end_date);

ALTER TABLE public.trip_base_camps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip members can view trip base camps" ON public.trip_base_camps;
CREATE POLICY "Trip members can view trip base camps"
  ON public.trip_base_camps FOR SELECT
  USING (public.is_trip_member((SELECT auth.uid()), trip_id));

DROP POLICY IF EXISTS "Trip editors can mutate trip base camps" ON public.trip_base_camps;
CREATE POLICY "Trip editors can mutate trip base camps"
  ON public.trip_base_camps FOR ALL
  USING (public.can_manage_trip_content((SELECT auth.uid()), trip_id))
  WITH CHECK (public.can_manage_trip_content((SELECT auth.uid()), trip_id));

CREATE TABLE IF NOT EXISTS public.trip_personal_base_camps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT,
  place_name TEXT,
  address TEXT NOT NULL,
  google_place_id TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  city TEXT,
  region TEXT,
  country TEXT,
  start_date DATE,
  end_date DATE,
  order_index INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_personal_base_camps_trip_user_idx ON public.trip_personal_base_camps(trip_id, user_id, order_index);
CREATE INDEX IF NOT EXISTS trip_personal_base_camps_trip_date_idx ON public.trip_personal_base_camps(trip_id, user_id, start_date, end_date);

ALTER TABLE public.trip_personal_base_camps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own personal base camps" ON public.trip_personal_base_camps;
CREATE POLICY "Users can view own personal base camps"
  ON public.trip_personal_base_camps FOR SELECT
  USING ((SELECT auth.uid()) = user_id AND public.is_trip_member((SELECT auth.uid()), trip_id));

DROP POLICY IF EXISTS "Users can mutate own personal base camps" ON public.trip_personal_base_camps;
CREATE POLICY "Users can mutate own personal base camps"
  ON public.trip_personal_base_camps FOR ALL
  USING ((SELECT auth.uid()) = user_id AND public.is_trip_member((SELECT auth.uid()), trip_id))
  WITH CHECK ((SELECT auth.uid()) = user_id AND public.is_trip_member((SELECT auth.uid()), trip_id));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_touch_trip_base_camps_updated_at ON public.trip_base_camps;
CREATE TRIGGER trigger_touch_trip_base_camps_updated_at
  BEFORE UPDATE ON public.trip_base_camps
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trigger_touch_trip_personal_base_camps_updated_at ON public.trip_personal_base_camps;
CREATE TRIGGER trigger_touch_trip_personal_base_camps_updated_at
  BEFORE UPDATE ON public.trip_personal_base_camps
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Backfill legacy singular trip basecamp into the new ordered list if present.
INSERT INTO public.trip_base_camps (
  trip_id, created_by, label, place_name, address, lat, lng, order_index
)
SELECT t.id, t.created_by, t.basecamp_name, t.basecamp_name, t.basecamp_address, t.basecamp_latitude, t.basecamp_longitude, 0
FROM public.trips t
WHERE t.basecamp_address IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.trip_base_camps bc WHERE bc.trip_id = t.id
  );
