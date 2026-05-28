DROP POLICY IF EXISTS "Trip members can upload covers" ON storage.objects;
CREATE POLICY "Trip members can upload covers"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trip-covers'
  AND EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = (storage.foldername(objects.name))[1]
      AND (
        t.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.trip_admins ta WHERE ta.trip_id = t.id AND ta.user_id = auth.uid())
        OR (
          t.trip_type = ANY (ARRAY['consumer'::text, 'pro'::text])
          AND EXISTS (SELECT 1 FROM public.trip_members tm WHERE tm.trip_id = t.id AND tm.user_id = auth.uid())
        )
      )
  )
);

CREATE OR REPLACE FUNCTION public.can_access_channel(_user_id uuid, _channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.trip_channels tc
    INNER JOIN public.channel_role_access cra ON cra.channel_id = tc.id
    INNER JOIN public.user_trip_roles utr
      ON utr.trip_id = tc.trip_id
      AND utr.role_id = cra.role_id
      AND utr.user_id = _user_id
      AND utr.is_primary = true
    WHERE tc.id = _channel_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.trip_channels tc
    INNER JOIN public.trip_members tm
      ON tm.trip_id = tc.trip_id
      AND tm.user_id = _user_id
    WHERE tc.id = _channel_id
      AND tc.is_private = false
  )
  OR EXISTS (
    SELECT 1
    FROM public.trip_channels tc
    INNER JOIN public.trips t ON t.id = tc.trip_id
    WHERE tc.id = _channel_id
      AND (
        t.created_by = _user_id
        OR EXISTS (SELECT 1 FROM public.trip_admins ta WHERE ta.trip_id = tc.trip_id AND ta.user_id = _user_id)
      )
  );
$function$;

REVOKE SELECT ON public.gmail_accounts FROM authenticated;
GRANT SELECT (
  id, user_id, email, scopes, is_active, token_expires_at, created_at, updated_at, last_sync_at
) ON public.gmail_accounts TO authenticated;
