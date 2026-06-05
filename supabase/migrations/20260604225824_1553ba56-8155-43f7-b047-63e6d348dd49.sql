
ALTER VIEW public.billing_entitlement_reconciliation_candidates SET (security_invoker = true);

DROP POLICY IF EXISTS "Users can view own gmail accounts" ON public.gmail_accounts;

DROP POLICY IF EXISTS "Members can join accessible channels" ON public.channel_members;
CREATE POLICY "Members can join accessible channels"
ON public.channel_members
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND public.can_access_channel((SELECT auth.uid()), channel_id)
);

DROP POLICY IF EXISTS "Trip members can subscribe to trip_chat_messages" ON realtime.messages;
CREATE POLICY "Trip members can subscribe to trip_chat_messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'trip_chat_messages:%'
  AND public.is_trip_member(
    auth.uid(),
    SUBSTRING(realtime.topic() FROM (length('trip_chat_messages:') + 1))
  )
);

DROP POLICY IF EXISTS "Join requests realtime: trip admins only" ON realtime.messages;
CREATE POLICY "Join requests realtime: trip admins only"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'trip_join_requests:%'
  AND public.is_trip_admin(
    auth.uid(),
    SUBSTRING(realtime.topic() FROM (length('trip_join_requests:') + 1))
  )
);
