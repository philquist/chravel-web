
-- 1. Restrict sensitive columns on event_rsvps from client access
REVOKE SELECT (user_email, dietary_restrictions) ON public.event_rsvps FROM authenticated, anon;

-- 2. Restrict OAuth tokens on gmail_accounts from client access
REVOKE SELECT (access_token, refresh_token) ON public.gmail_accounts FROM authenticated, anon;

-- 3. Restrict trips UPDATE: drop overly-permissive policy. The narrower
--    "Trip members can update cover image" policy (creators + admins +
--    consumer/pro members) remains and governs trip-detail updates.
DROP POLICY IF EXISTS "Trip members can update trip details" ON public.trips;

-- 4. trip_embeddings: only service_role may write. Remove member write policies
--    to prevent vector store poisoning. SELECT for trip members remains.
DROP POLICY IF EXISTS "Trip members can insert embeddings" ON public.trip_embeddings;
DROP POLICY IF EXISTS "Trip members can update embeddings" ON public.trip_embeddings;
DROP POLICY IF EXISTS "Trip members can delete embeddings" ON public.trip_embeddings;

-- 5. Fix trip-covers storage policies: use objects.name (not t.name) for path.
DROP POLICY IF EXISTS "Trip members can delete covers" ON storage.objects;
DROP POLICY IF EXISTS "Trip members can update covers" ON storage.objects;

CREATE POLICY "Trip members can delete covers" ON storage.objects
FOR DELETE USING (
  bucket_id = 'trip-covers'
  AND EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = (storage.foldername(storage.objects.name))[1]
      AND (
        t.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.trip_admins ta WHERE ta.trip_id = t.id AND ta.user_id = auth.uid())
        OR (t.trip_type = ANY (ARRAY['consumer','pro']) AND EXISTS (
          SELECT 1 FROM public.trip_members tm WHERE tm.trip_id = t.id AND tm.user_id = auth.uid()
        ))
      )
  )
);

CREATE POLICY "Trip members can update covers" ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'trip-covers'
  AND EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = (storage.foldername(storage.objects.name))[1]
      AND (
        t.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.trip_admins ta WHERE ta.trip_id = t.id AND ta.user_id = auth.uid())
        OR (t.trip_type = ANY (ARRAY['consumer','pro']) AND EXISTS (
          SELECT 1 FROM public.trip_members tm WHERE tm.trip_id = t.id AND tm.user_id = auth.uid()
        ))
      )
  )
)
WITH CHECK (
  bucket_id = 'trip-covers'
  AND EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = (storage.foldername(storage.objects.name))[1]
      AND (
        t.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.trip_admins ta WHERE ta.trip_id = t.id AND ta.user_id = auth.uid())
        OR (t.trip_type = ANY (ARRAY['consumer','pro']) AND EXISTS (
          SELECT 1 FROM public.trip_members tm WHERE tm.trip_id = t.id AND tm.user_id = auth.uid()
        ))
      )
  )
);

-- 6. advertiser-assets INSERT: enforce path ownership (folder = auth.uid()).
DROP POLICY IF EXISTS "Advertisers can upload their own assets" ON storage.objects;
CREATE POLICY "Advertisers can upload their own assets" ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'advertiser-assets'
  AND auth.uid() IN (SELECT user_id FROM public.advertisers)
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Also align DELETE/UPDATE policies to be path-scoped (defense in depth).
DROP POLICY IF EXISTS "Advertisers can delete their own assets" ON storage.objects;
CREATE POLICY "Advertisers can delete their own assets" ON storage.objects
FOR DELETE USING (
  bucket_id = 'advertiser-assets'
  AND auth.uid() IN (SELECT user_id FROM public.advertisers)
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Advertisers can update their own assets" ON storage.objects;
CREATE POLICY "Advertisers can update their own assets" ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'advertiser-assets'
  AND auth.uid() IN (SELECT user_id FROM public.advertisers)
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'advertiser-assets'
  AND auth.uid() IN (SELECT user_id FROM public.advertisers)
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 7. Convert SECURITY DEFINER-style views to security_invoker so RLS applies
--    based on the querying user, not the view owner.
ALTER VIEW public.recommendation_items_public SET (security_invoker = true);
ALTER VIEW public.campaigns_public SET (security_invoker = true);
