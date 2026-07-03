
CREATE TABLE IF NOT EXISTS public.ai_cover_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id text NOT NULL,
  period_month date NOT NULL DEFAULT date_trunc('month', now())::date,
  model text NOT NULL DEFAULT 'openai/gpt-image-2',
  cost_estimate_cents integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_cover_generations_user_month_idx
  ON public.ai_cover_generations (user_id, period_month);
CREATE INDEX IF NOT EXISTS ai_cover_generations_trip_idx
  ON public.ai_cover_generations (trip_id);

GRANT SELECT ON public.ai_cover_generations TO authenticated;
GRANT ALL ON public.ai_cover_generations TO service_role;

ALTER TABLE public.ai_cover_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own AI cover generations" ON public.ai_cover_generations;
CREATE POLICY "Users read own AI cover generations"
  ON public.ai_cover_generations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.can_edit_trip_cover(_trip_id text, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    LEFT JOIN public.trip_members tm
      ON tm.trip_id = t.id
     AND tm.user_id = _user_id
    LEFT JOIN public.trip_admins ta
      ON ta.trip_id = t.id
     AND ta.user_id = _user_id
    WHERE t.id = _trip_id
      AND (
        (t.trip_type = 'consumer' AND tm.user_id IS NOT NULL)
        OR (t.trip_type IN ('pro', 'event') AND (t.created_by = _user_id OR ta.user_id IS NOT NULL))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_trip_cover(text, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Trip members can update cover image" ON public.trips;
DROP POLICY IF EXISTS "Trip cover editors can update cover image" ON public.trips;

CREATE POLICY "Trip cover editors can update cover image"
  ON public.trips FOR UPDATE
  TO authenticated
  USING (public.can_edit_trip_cover(id, auth.uid()))
  WITH CHECK (public.can_edit_trip_cover(id, auth.uid()));

DROP POLICY IF EXISTS "Trip members can upload covers" ON storage.objects;
DROP POLICY IF EXISTS "Trip members can update covers" ON storage.objects;
DROP POLICY IF EXISTS "Trip members can delete covers" ON storage.objects;
DROP POLICY IF EXISTS "trip-covers: members can insert" ON storage.objects;
DROP POLICY IF EXISTS "trip-covers: members can update" ON storage.objects;
DROP POLICY IF EXISTS "trip-covers: members can delete" ON storage.objects;
DROP POLICY IF EXISTS "trip-covers: editors can insert" ON storage.objects;
DROP POLICY IF EXISTS "trip-covers: editors can update" ON storage.objects;
DROP POLICY IF EXISTS "trip-covers: editors can delete" ON storage.objects;

CREATE POLICY "trip-covers: editors can insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'trip-covers'
    AND public.can_edit_trip_cover((storage.foldername(name))[1], auth.uid())
  );

CREATE POLICY "trip-covers: editors can update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'trip-covers'
    AND public.can_edit_trip_cover((storage.foldername(name))[1], auth.uid())
  );

CREATE POLICY "trip-covers: editors can delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'trip-covers'
    AND public.can_edit_trip_cover((storage.foldername(name))[1], auth.uid())
  );

INSERT INTO public.feature_flags (key, enabled, description)
VALUES (
  'ai_cover_generation_enabled',
  true,
  'Enables AI-generated trip cover photos for Frequent Chraveler users (10/month cap).'
)
ON CONFLICT (key) DO NOTHING;
