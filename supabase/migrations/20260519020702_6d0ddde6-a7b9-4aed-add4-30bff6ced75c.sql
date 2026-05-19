-- Multi-base-camp support: shared trip-level + private per-user.
-- Additive: legacy trips.basecamp_* stays intact for backward compatibility.

-- ───────────────────────── Shared trip base camps ─────────────────────────
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

CREATE INDEX IF NOT EXISTS trip_base_camps_trip_idx
  ON public.trip_base_camps(trip_id);
CREATE INDEX IF NOT EXISTS trip_base_camps_trip_order_idx
  ON public.trip_base_camps(trip_id, order_index);
CREATE INDEX IF NOT EXISTS trip_base_camps_trip_date_idx
  ON public.trip_base_camps(trip_id, start_date, end_date);

ALTER TABLE public.trip_base_camps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip members can view trip base camps" ON public.trip_base_camps;
CREATE POLICY "Trip members can view trip base camps"
  ON public.trip_base_camps FOR SELECT
  USING (public.is_trip_member((SELECT auth.uid()), trip_id));

DROP POLICY IF EXISTS "Trip editors can insert trip base camps" ON public.trip_base_camps;
CREATE POLICY "Trip editors can insert trip base camps"
  ON public.trip_base_camps FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = created_by AND (
      EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.created_by = (SELECT auth.uid()))
      OR public.is_trip_admin((SELECT auth.uid()), trip_id)
    )
  );

DROP POLICY IF EXISTS "Trip editors can update trip base camps" ON public.trip_base_camps;
CREATE POLICY "Trip editors can update trip base camps"
  ON public.trip_base_camps FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.created_by = (SELECT auth.uid()))
    OR public.is_trip_admin((SELECT auth.uid()), trip_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.created_by = (SELECT auth.uid()))
    OR public.is_trip_admin((SELECT auth.uid()), trip_id)
  );

DROP POLICY IF EXISTS "Trip editors can delete trip base camps" ON public.trip_base_camps;
CREATE POLICY "Trip editors can delete trip base camps"
  ON public.trip_base_camps FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.created_by = (SELECT auth.uid()))
    OR public.is_trip_admin((SELECT auth.uid()), trip_id)
  );

-- ───────────────────────── Private personal base camps ─────────────────────────
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

CREATE INDEX IF NOT EXISTS trip_personal_base_camps_trip_user_idx
  ON public.trip_personal_base_camps(trip_id, user_id, order_index);
CREATE INDEX IF NOT EXISTS trip_personal_base_camps_trip_date_idx
  ON public.trip_personal_base_camps(trip_id, user_id, start_date, end_date);

ALTER TABLE public.trip_personal_base_camps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own personal base camps" ON public.trip_personal_base_camps;
CREATE POLICY "Users manage own personal base camps"
  ON public.trip_personal_base_camps FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ───────────────────────── Updated-at triggers ─────────────────────────
DROP TRIGGER IF EXISTS trigger_touch_trip_base_camps_updated_at ON public.trip_base_camps;
CREATE TRIGGER trigger_touch_trip_base_camps_updated_at
  BEFORE UPDATE ON public.trip_base_camps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_touch_trip_personal_base_camps_updated_at ON public.trip_personal_base_camps;
CREATE TRIGGER trigger_touch_trip_personal_base_camps_updated_at
  BEFORE UPDATE ON public.trip_personal_base_camps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ───────────────────────── Backfill legacy singular trip basecamp ─────────────────────────
INSERT INTO public.trip_base_camps (
  trip_id, created_by, label, place_name, address, lat, lng, order_index
)
SELECT
  t.id,
  t.created_by,
  t.basecamp_name,
  t.basecamp_name,
  t.basecamp_address,
  t.basecamp_latitude,
  t.basecamp_longitude,
  0
FROM public.trips t
WHERE t.basecamp_address IS NOT NULL
  AND t.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.trip_base_camps bc WHERE bc.trip_id = t.id
  );
