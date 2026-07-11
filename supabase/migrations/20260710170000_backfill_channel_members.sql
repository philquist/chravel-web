-- Backfill channel_members for pro role channels.
--
-- The sync_channel_memberships_on_role_change trigger (20260315000003) only fires on NEW
-- user_trip_roles INSERT/DELETE and shipped no backfill, so channel_members is empty for
-- every channel whose role assignments predate the trigger. That empties every member-count
-- reader that trusts channel_members ("0 members") and leaves the Stream reconciler with no
-- source of expected members. Populate channel_members from BOTH access sources — the
-- channel_role_access junction and the legacy trip_channels.required_role_id — for every
-- existing role assignment. Idempotent via ON CONFLICT.

INSERT INTO public.channel_members (channel_id, user_id)
SELECT DISTINCT tc.id, utr.user_id
FROM public.user_trip_roles utr
JOIN public.trip_channels tc ON tc.trip_id = utr.trip_id
JOIN public.channel_role_access cra ON cra.channel_id = tc.id AND cra.role_id = utr.role_id
ON CONFLICT (channel_id, user_id) DO NOTHING;

INSERT INTO public.channel_members (channel_id, user_id)
SELECT DISTINCT tc.id, utr.user_id
FROM public.user_trip_roles utr
JOIN public.trip_channels tc ON tc.trip_id = utr.trip_id AND tc.required_role_id = utr.role_id
ON CONFLICT (channel_id, user_id) DO NOTHING;
