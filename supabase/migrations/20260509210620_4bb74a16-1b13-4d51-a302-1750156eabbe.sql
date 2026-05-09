-- Fix trip cover photo write authorization so creators/admins do not depend on trip_members timing.
-- Canonical model:
--   bucket: trip-covers
--   path: <tripId>/<cache-safe-filename>
--   field: public.trips.cover_image_url
--   consumer/pro: creator, trip_admin, or active member can manage covers
--   event: creator or trip_admin can manage covers

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trip-covers',
  'trip-covers',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Anyone can view trip covers" ON storage.objects;
DROP POLICY IF EXISTS "Trip members can upload covers" ON storage.objects;
DROP POLICY IF EXISTS "Trip members can update covers" ON storage.objects;
DROP POLICY IF EXISTS "Trip members can delete covers" ON storage.objects;
DROP POLICY IF EXISTS "trip-covers: members can insert" ON storage.objects;
DROP POLICY IF EXISTS "trip-covers: members can update" ON storage.objects;
DROP POLICY IF EXISTS "trip-covers: members can delete" ON storage.objects;
DROP POLICY IF EXISTS "Trip members can upload trip covers" ON storage.objects;

CREATE POLICY "Anyone can view trip covers"
ON storage.objects
FOR SELECT
USING (bucket_id = 'trip-covers');

DO $$
DECLARE
  member_exists_sql text;
  storage_auth_sql text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'trip_members'
      AND column_name = 'status'
  ) THEN
    member_exists_sql := '
      EXISTS (
        SELECT 1
        FROM public.trip_members tm
        WHERE tm.trip_id = t.id
          AND tm.user_id = auth.uid()
          AND (tm.status IS NULL OR tm.status = ''active'')
      )';
  ELSE
    member_exists_sql := '
      EXISTS (
        SELECT 1
        FROM public.trip_members tm
        WHERE tm.trip_id = t.id
          AND tm.user_id = auth.uid()
      )';
  END IF;

  storage_auth_sql := format('
    EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND (
          t.created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.trip_admins ta
            WHERE ta.trip_id = t.id
              AND ta.user_id = auth.uid()
          )
          OR (
            t.trip_type IN (''consumer'', ''pro'')
            AND %s
          )
        )
    )', member_exists_sql);

  EXECUTE format('
    CREATE POLICY "Trip members can upload covers"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = ''trip-covers'' AND %s)
  ', storage_auth_sql);

  EXECUTE format('
    CREATE POLICY "Trip members can update covers"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = ''trip-covers'' AND %s)
    WITH CHECK (bucket_id = ''trip-covers'' AND %s)
  ', storage_auth_sql, storage_auth_sql);

  EXECUTE format('
    CREATE POLICY "Trip members can delete covers"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = ''trip-covers'' AND %s)
  ', storage_auth_sql);
END $$;

DROP POLICY IF EXISTS "Trip members can update cover image" ON public.trips;

DO $$
DECLARE
  member_exists_sql text;
  trip_auth_sql text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'trip_members'
      AND column_name = 'status'
  ) THEN
    member_exists_sql := '
      EXISTS (
        SELECT 1
        FROM public.trip_members tm
        WHERE tm.trip_id = trips.id
          AND tm.user_id = auth.uid()
          AND (tm.status IS NULL OR tm.status = ''active'')
      )';
  ELSE
    member_exists_sql := '
      EXISTS (
        SELECT 1
        FROM public.trip_members tm
        WHERE tm.trip_id = trips.id
          AND tm.user_id = auth.uid()
      )';
  END IF;

  trip_auth_sql := format('
    auth.uid() IS NOT NULL
    AND (
      trips.created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.trip_admins ta
        WHERE ta.trip_id = trips.id
          AND ta.user_id = auth.uid()
      )
      OR (
        trips.trip_type IN (''consumer'', ''pro'')
        AND %s
      )
    )', member_exists_sql);

  EXECUTE format('
    CREATE POLICY "Trip members can update cover image"
    ON public.trips
    FOR UPDATE
    TO authenticated
    USING (%s)
    WITH CHECK (%s)
  ', trip_auth_sql, trip_auth_sql);
END $$;