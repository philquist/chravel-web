-- Unified per-channel member counts for a trip's role channels.
--
-- Replaces three divergent client-side counting implementations (admin branch,
-- member branch, and the ChannelChatView fallback) that produced disagreeing
-- numbers and N+1 query storms. One query, one definition of "member":
-- role-derived members (channel_role_access ∪ legacy required_role_id joined
-- through user_trip_roles) UNION explicit channel_members, counted DISTINCT
-- per user. Archived channels are excluded.
--
-- SECURITY INVOKER on purpose: every underlying table is already read directly
-- by the client today (trip_channels, channel_role_access, user_trip_roles,
-- channel_members), so this only moves aggregation server-side — the caller's
-- RLS visibility is unchanged and no new leak surface is created.
CREATE OR REPLACE FUNCTION public.get_channel_member_counts(p_trip_id text)
RETURNS TABLE (channel_id uuid, member_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH channel_roles AS (
    -- Junction-table role grants (multi-role channels)
    SELECT tc.id AS channel_id, cra.role_id
    FROM public.trip_channels tc
    JOIN public.channel_role_access cra ON cra.channel_id = tc.id
    WHERE tc.trip_id = p_trip_id
      AND COALESCE(tc.is_archived, false) = false
    UNION
    -- Legacy single-role linkage (the only linkage populated for most
    -- existing pro channels — must be honored or counts read 0)
    SELECT tc.id, tc.required_role_id
    FROM public.trip_channels tc
    WHERE tc.trip_id = p_trip_id
      AND COALESCE(tc.is_archived, false) = false
      AND tc.required_role_id IS NOT NULL
  ),
  members AS (
    -- Role-derived membership
    SELECT cr.channel_id, utr.user_id
    FROM channel_roles cr
    JOIN public.user_trip_roles utr
      ON utr.role_id = cr.role_id
     AND utr.trip_id = p_trip_id
    UNION
    -- Explicit membership (creators, backfilled members)
    SELECT cm.channel_id, cm.user_id
    FROM public.channel_members cm
    JOIN public.trip_channels tc ON tc.id = cm.channel_id
    WHERE tc.trip_id = p_trip_id
      AND COALESCE(tc.is_archived, false) = false
  )
  SELECT m.channel_id, COUNT(DISTINCT m.user_id)::bigint AS member_count
  FROM members m
  GROUP BY m.channel_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_channel_member_counts(text) TO authenticated;

-- Retire the superseded admin-only variant (zero callers in src/ or edge
-- functions; verified 2026-07-13). Its member_count subquery was also buggy:
-- no DISTINCT users, no trip filter, and it ignored legacy required_role_id
-- linkage — the historical "0 members" bug class. Forward-fix if ever needed:
-- recreate from 20251202233308 with the corrected count from
-- get_channel_member_counts above.
DROP FUNCTION IF EXISTS public.get_admin_accessible_channels(text, uuid);
