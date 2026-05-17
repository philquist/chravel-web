
-- 1. event_rsvps: revoke sensitive columns from authenticated/anon
REVOKE SELECT (user_email, dietary_restrictions, ticket_qr_code) ON public.event_rsvps FROM authenticated;
REVOKE SELECT (user_email, dietary_restrictions, ticket_qr_code) ON public.event_rsvps FROM anon;

-- 2. gmail_accounts: revoke OAuth tokens from authenticated/anon (service_role only)
REVOKE SELECT (access_token, refresh_token) ON public.gmail_accounts FROM authenticated;
REVOKE SELECT (access_token, refresh_token) ON public.gmail_accounts FROM anon;

-- 3. event-agendas bucket: require uploader's user_id as first folder
DROP POLICY IF EXISTS "Authenticated users can upload event agendas" ON storage.objects;
CREATE POLICY "Users can upload event agendas to their own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'event-agendas'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 4. trip-media bucket: remove trip-covers bypass; always require trip membership
DROP POLICY IF EXISTS "Trip members can upload trip media" ON storage.objects;
CREATE POLICY "Trip members can upload trip media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'trip-media'
  AND EXISTS (
    SELECT 1 FROM public.trip_members tm
    WHERE tm.trip_id = (storage.foldername(name))[1]
      AND tm.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "Trip members can view trip media" ON storage.objects;
CREATE POLICY "Trip members can view trip media"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'trip-media'
  AND EXISTS (
    SELECT 1 FROM public.trip_members tm
    WHERE tm.trip_id = (storage.foldername(name))[1]
      AND tm.user_id = auth.uid()
  )
);

-- 5. invite_links: require trip membership to view
DROP POLICY IF EXISTS "Authenticated users can view active invite links" ON public.invite_links;
CREATE POLICY "Trip members can view active invite links"
ON public.invite_links FOR SELECT TO authenticated
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM public.trip_members tm
    WHERE tm.trip_id = invite_links.trip_id
      AND tm.user_id = auth.uid()
  )
);

-- 6. realtime: gate trip_chat_messages topic subscriptions to trip members
CREATE POLICY "Trip members can subscribe to trip_chat_messages"
ON realtime.messages FOR SELECT TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'trip_chat_messages:%'
      THEN public.is_trip_member(
        auth.uid(),
        substring(realtime.topic() from length('trip_chat_messages:') + 1)
      )
    ELSE true
  END
);
