-- Fix trip-cover write policies so trip creators can upload immediately after trip creation.
-- Root cause: prior policy joined trip_members before checking creator/admin permissions,
-- which blocked first-write uploads when membership projection lagged.

DROP POLICY IF EXISTS "Trip members can upload covers" ON storage.objects;
DROP POLICY IF EXISTS "Trip members can update covers" ON storage.objects;
DROP POLICY IF EXISTS "Trip members can delete covers" ON storage.objects;
DROP POLICY IF EXISTS "Trip members can update cover image" ON public.trips;

DO $$
DECLARE
  active_member_clause TEXT;
  upload_auth_clause TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'trip_members'
      AND column_name = 'status'
  ) THEN
    active_member_clause := 'EXISTS (SELECT 1 FROM public.trip_members tm WHERE tm.trip_id = t.id AND tm.user_id = auth.uid() AND (tm.status IS NULL OR tm.status = ''active''))';
  ELSE
    active_member_clause := 'EXISTS (SELECT 1 FROM public.trip_members tm WHERE tm.trip_id = t.id AND tm.user_id = auth.uid())';
  END IF;

  upload_auth_clause := format(
    'EXISTS (
      SELECT 1
      FROM public.trips t
      LEFT JOIN public.trip_admins ta ON ta.trip_id = t.id AND ta.user_id = auth.uid()
      WHERE t.id::text = (storage.foldername(name))[1]
        AND (
          t.created_by = auth.uid()
          OR ta.user_id IS NOT NULL
          OR (
            t.trip_type IN (''consumer'', ''pro'')
            AND %s
          )
        )
    )',
    active_member_clause
  );

  EXECUTE format('
    CREATE POLICY "Trip members can upload covers"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = ''trip-covers'' AND %s)
  ', upload_auth_clause);

  EXECUTE format('
    CREATE POLICY "Trip members can update covers"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = ''trip-covers'' AND %s)
  ', upload_auth_clause);

  EXECUTE format('
    CREATE POLICY "Trip members can delete covers"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = ''trip-covers'' AND %s)
  ', upload_auth_clause);
END $$;

DO $$
DECLARE
  active_member_clause TEXT;
  update_auth_clause TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'trip_members'
      AND column_name = 'status'
  ) THEN
    active_member_clause := 'EXISTS (SELECT 1 FROM public.trip_members tm WHERE tm.trip_id = trips.id AND tm.user_id = auth.uid() AND (tm.status IS NULL OR tm.status = ''active''))';
  ELSE
    active_member_clause := 'EXISTS (SELECT 1 FROM public.trip_members tm WHERE tm.trip_id = trips.id AND tm.user_id = auth.uid())';
  END IF;

  update_auth_clause := format(
    '(trips.created_by = auth.uid()) OR EXISTS (SELECT 1 FROM public.trip_admins ta WHERE ta.trip_id = trips.id AND ta.user_id = auth.uid()) OR ((trips.trip_type IN (''consumer'', ''pro'')) AND %s)',
    active_member_clause
  );

  EXECUTE format('
    CREATE POLICY "Trip members can update cover image"
    ON public.trips FOR UPDATE
    TO authenticated
    USING (%s)
    WITH CHECK (%s)
  ', update_auth_clause, update_auth_clause);
END $$;
