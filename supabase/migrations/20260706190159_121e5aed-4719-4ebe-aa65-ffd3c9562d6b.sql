
-- Fix privilege escalation on trip_admins: drop broad ALL policy; add explicit UPDATE gated on can_designate_admins.
DROP POLICY IF EXISTS "Trip admins manage admins" ON public.trip_admins;

CREATE POLICY "Admins with designate permission can update admins"
ON public.trip_admins
FOR UPDATE
USING (has_admin_permission((SELECT auth.uid()), trip_id, 'can_designate_admins'))
WITH CHECK (has_admin_permission((SELECT auth.uid()), trip_id, 'can_designate_admins'));

-- Fix self-role-assignment on user_trip_roles: drop broad ALL policy that let users insert their own role rows.
DROP POLICY IF EXISTS "Trip admins assign roles" ON public.user_trip_roles;
