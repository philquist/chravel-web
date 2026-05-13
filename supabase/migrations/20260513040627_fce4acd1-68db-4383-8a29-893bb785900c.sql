
-- Security hardening migration

-- 1. trip-media bucket: restrict DELETE/UPDATE to trip members based on path
DROP POLICY IF EXISTS "Users can delete their own trip media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own trip media" ON storage.objects;

CREATE POLICY "Trip members can delete trip media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'trip-media'
  AND EXISTS (
    SELECT 1 FROM public.trip_members tm
    WHERE tm.trip_id = (storage.foldername(name))[1]
      AND tm.user_id = auth.uid()
  )
);

CREATE POLICY "Trip members can update trip media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'trip-media'
  AND EXISTS (
    SELECT 1 FROM public.trip_members tm
    WHERE tm.trip_id = (storage.foldername(name))[1]
      AND tm.user_id = auth.uid()
  )
);

-- Also tighten the overly-broad upload policy
DROP POLICY IF EXISTS "Authenticated users can upload trip media" ON storage.objects;
CREATE POLICY "Trip members can upload trip media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'trip-media'
  AND (
    (storage.foldername(name))[1] = 'trip-covers'
    OR EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = (storage.foldername(name))[1]
        AND tm.user_id = auth.uid()
    )
  )
);

-- 2. advertiser-assets: drop overly broad upload policy
DROP POLICY IF EXISTS "Authenticated users can upload advertiser assets" ON storage.objects;

-- 3. notification_deliveries: explicit service-role-only policies
DROP POLICY IF EXISTS "service_role_all_notification_deliveries" ON public.notification_deliveries;
CREATE POLICY "service_role_all_notification_deliveries"
ON public.notification_deliveries FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 4. security_audit_log: explicit service-role-only SELECT
DROP POLICY IF EXISTS "service_role_select_audit_logs" ON public.security_audit_log;
CREATE POLICY "service_role_select_audit_logs"
ON public.security_audit_log FOR SELECT TO service_role
USING (true);

-- 5. trip_join_requests: remove member-wide visibility (admins-only policy already exists)
DROP POLICY IF EXISTS "Trip members can view join requests" ON public.trip_join_requests;

-- 6. trip_embeddings: tighten writes to trip members or service role
DROP POLICY IF EXISTS "System can manage embeddings" ON public.trip_embeddings;
CREATE POLICY "Trip members can insert embeddings"
ON public.trip_embeddings FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trip_members tm
    WHERE tm.trip_id = trip_embeddings.trip_id
      AND tm.user_id = auth.uid()
  )
);
CREATE POLICY "Trip members can update embeddings"
ON public.trip_embeddings FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trip_members tm
    WHERE tm.trip_id = trip_embeddings.trip_id
      AND tm.user_id = auth.uid()
  )
);
CREATE POLICY "Trip members can delete embeddings"
ON public.trip_embeddings FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trip_members tm
    WHERE tm.trip_id = trip_embeddings.trip_id
      AND tm.user_id = auth.uid()
  )
);
CREATE POLICY "Service role manages embeddings"
ON public.trip_embeddings FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 7. organization_invites: require authentication to view by token
DROP POLICY IF EXISTS "Anyone can view pending invites by token" ON public.organization_invites;
CREATE POLICY "Authenticated users can view pending invites"
ON public.organization_invites FOR SELECT TO authenticated
USING (status = 'pending' AND expires_at > now());

-- 8. gmail_accounts: revoke direct token column access from authenticated role
-- Tokens remain readable via service_role (edge functions); client cannot SELECT them.
REVOKE SELECT (access_token, refresh_token) ON public.gmail_accounts FROM authenticated;
REVOKE SELECT (access_token, refresh_token) ON public.gmail_accounts FROM anon;

-- 9. event_rsvps: hide email and dietary_restrictions columns from clients
-- Members can still see who RSVP'd (row visibility unchanged); PII stays server-side.
REVOKE SELECT (user_email, dietary_restrictions) ON public.event_rsvps FROM authenticated;
REVOKE SELECT (user_email, dietary_restrictions) ON public.event_rsvps FROM anon;
