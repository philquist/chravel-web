
-- =========================================================
-- 1) Membership-checked INSERT policies
-- =========================================================

-- trip_files
DROP POLICY IF EXISTS "Owners can insert trip_files" ON public.trip_files;
CREATE POLICY "Owners can insert trip_files"
ON public.trip_files
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = uploaded_by
  AND public.is_trip_member(auth.uid(), trip_id)
);

-- trip_polls
DROP POLICY IF EXISTS "Owners can insert trip_polls" ON public.trip_polls;
CREATE POLICY "Owners can insert trip_polls"
ON public.trip_polls
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND public.is_trip_member(auth.uid(), trip_id)
);

-- trip_links
DROP POLICY IF EXISTS "Owners can insert trip_links" ON public.trip_links;
CREATE POLICY "Owners can insert trip_links"
ON public.trip_links
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = added_by
  AND public.is_trip_member(auth.uid(), trip_id)
);

-- trip_receipts
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='trip_receipts' AND cmd='INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.trip_receipts', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "Members can insert trip_receipts"
ON public.trip_receipts
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.is_trip_member(auth.uid(), trip_id)
);

-- =========================================================
-- 2) gmail_accounts: hide raw OAuth tokens from authenticated
-- =========================================================
REVOKE SELECT (access_token, refresh_token) ON public.gmail_accounts FROM authenticated;
REVOKE SELECT (access_token, refresh_token) ON public.gmail_accounts FROM anon;

-- =========================================================
-- 3) invite_links: only authenticated users can read
-- =========================================================
DROP POLICY IF EXISTS "Anyone can view active invite links" ON public.invite_links;
CREATE POLICY "Authenticated users can view active invite links"
ON public.invite_links
FOR SELECT
TO authenticated
USING (is_active = true);

-- =========================================================
-- 4) event_rsvps: members see only their own row; admins see all
-- =========================================================
DROP POLICY IF EXISTS "Event members can view RSVPs for their events" ON public.event_rsvps;

CREATE POLICY "Users can view their own RSVP"
ON public.event_rsvps
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Trip admins can view all RSVPs for their event"
ON public.event_rsvps
FOR SELECT
TO authenticated
USING (public.is_trip_admin(auth.uid(), event_id));

-- =========================================================
-- 5) organization_invites: restrict pending-invite enumeration
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can view pending invites" ON public.organization_invites;

CREATE POLICY "Invitees can view their own pending invites"
ON public.organization_invites
FOR SELECT
TO authenticated
USING (
  status = 'pending'
  AND expires_at > now()
  AND lower(email) = lower((SELECT au.email FROM auth.users au WHERE au.id = auth.uid()))
);

-- =========================================================
-- 6) trip_invites: only members of the trip can list active invites
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can view active invites by code" ON public.trip_invites;

CREATE POLICY "Trip members can view active invites"
ON public.trip_invites
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND public.is_trip_member(auth.uid(), trip_id)
);

-- =========================================================
-- 7) Realtime authorization scoping
-- =========================================================
DROP POLICY IF EXISTS "Notifications realtime: owner only" ON realtime.messages;
CREATE POLICY "Notifications realtime: owner only"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() LIKE 'notifications:%'
    AND realtime.topic() = 'notifications:' || auth.uid()::text)
  OR realtime.topic() NOT LIKE 'notifications:%'
);

DROP POLICY IF EXISTS "Join requests realtime: trip admins only" ON realtime.messages;
CREATE POLICY "Join requests realtime: trip admins only"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'trip_join_requests:%'
      THEN public.is_trip_admin(
        auth.uid(),
        substring(realtime.topic() FROM length('trip_join_requests:') + 1)
      )
    ELSE true
  END
);
