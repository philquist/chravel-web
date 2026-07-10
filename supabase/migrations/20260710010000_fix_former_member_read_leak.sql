-- Fix F-07: former members retained SELECT (read) access to trip tasks/polls/events.
--
-- Root cause: the live SELECT policies on trip_tasks / trip_polls / trip_events used the
-- status-agnostic single-arg helper public.is_trip_member(trip_id), which matches ANY
-- trip_members row regardless of status. A member whose row is status = 'left' (removed or
-- who left) therefore continued to read — and, because trip_tasks is in the realtime
-- publication, continued to receive — that trip's tasks/polls/events.
--
-- Fix: rebind these SELECT policies to the status-aware helper
-- public.is_active_trip_member(auth.uid(), trip_id) (status IS NULL OR status = 'active'),
-- which the resolver-gated INSERT/UPDATE/DELETE policies already use. Also close a second
-- leak path (a redundant membership-only polls SELECT policy) and add the active-status
-- filter to the public-channel membership branch of can_access_channel.
--
-- Behavior change: only removed/left members lose read access. Active members and admins
-- are unaffected (they satisfy the status-aware helper exactly as before).

-- trip_tasks (trip_id is TEXT)
DROP POLICY IF EXISTS "Trip members can view tasks" ON public.trip_tasks;
CREATE POLICY "Trip members can view tasks" ON public.trip_tasks
  FOR SELECT USING (public.is_active_trip_member(auth.uid(), trip_id));

-- trip_polls (trip_id is TEXT). Drop the redundant membership-only SELECT policy that
-- provided a second status-agnostic read path for former members.
DROP POLICY IF EXISTS "Trip members can view polls" ON public.trip_polls;
DROP POLICY IF EXISTS "Trip members can read polls" ON public.trip_polls;
CREATE POLICY "Trip members can view polls" ON public.trip_polls
  FOR SELECT USING (public.is_active_trip_member(auth.uid(), trip_id));

-- trip_events (trip_id needs a ::text cast to match the helper's text parameter, mirroring
-- the existing resolver-gated event policies).
DROP POLICY IF EXISTS "Trip members can view events" ON public.trip_events;
CREATE POLICY "Trip members can view events" ON public.trip_events
  FOR SELECT USING (public.is_active_trip_member(auth.uid(), trip_id::text));

-- can_access_channel: the public-channel membership branch joined trip_members with no
-- status predicate, so a former member kept access to public channels. Add the active
-- filter to that branch. The role-based (channel_role_access) and creator/full-admin
-- branches are preserved unchanged.
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
      AND (tm.status IS NULL OR tm.status = 'active')
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
        OR public.is_full_trip_admin(_user_id, tc.trip_id)
      )
  );
$function$;
