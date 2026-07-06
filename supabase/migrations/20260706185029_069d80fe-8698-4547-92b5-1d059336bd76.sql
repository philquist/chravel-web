
-- =========================================================================
-- 1. Narrow admin bypass on private surfaces to is_full_trip_admin
-- =========================================================================

-- can_access_channel: private-channel admin bypass restricted to full admins
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
        OR public.is_full_trip_admin(_user_id, tc.trip_id)
      )
  );
$function$;

-- channel_members: management bypass restricted to full admins
DROP POLICY IF EXISTS "System can manage channel membership" ON public.channel_members;
CREATE POLICY "System can manage channel membership"
ON public.channel_members
FOR ALL
USING (
  public.is_full_trip_admin(
    (SELECT auth.uid()),
    (SELECT trip_channels.trip_id FROM public.trip_channels WHERE trip_channels.id = channel_members.channel_id)
  )
)
WITH CHECK (
  public.is_full_trip_admin(
    (SELECT auth.uid()),
    (SELECT trip_channels.trip_id FROM public.trip_channels WHERE trip_channels.id = channel_members.channel_id)
  )
);

-- trip_files: admin delete/update bypass restricted to full admins
DROP POLICY IF EXISTS "trip_files_delete" ON public.trip_files;
CREATE POLICY "trip_files_delete"
ON public.trip_files
FOR DELETE
USING (
  auth.uid() = uploaded_by
  OR public.is_full_trip_admin(auth.uid(), trip_id)
);

DROP POLICY IF EXISTS "trip_files_update" ON public.trip_files;
CREATE POLICY "trip_files_update"
ON public.trip_files
FOR UPDATE
USING (
  auth.uid() = uploaded_by
  OR public.is_full_trip_admin(auth.uid(), trip_id)
)
WITH CHECK (
  auth.uid() = uploaded_by
  OR public.is_full_trip_admin(auth.uid(), trip_id)
);

-- =========================================================================
-- 2. Coordinator write policies for logistics tables
--    (additive — existing member/owner policies remain in force)
-- =========================================================================

-- trip_events (calendar)
DROP POLICY IF EXISTS "Coordinators can insert calendar events" ON public.trip_events;
CREATE POLICY "Coordinators can insert calendar events"
ON public.trip_events
FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_calendar')
);

DROP POLICY IF EXISTS "Coordinators can update calendar events" ON public.trip_events;
CREATE POLICY "Coordinators can update calendar events"
ON public.trip_events
FOR UPDATE
USING (public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_calendar'))
WITH CHECK (public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_calendar'));

DROP POLICY IF EXISTS "Coordinators can delete calendar events" ON public.trip_events;
CREATE POLICY "Coordinators can delete calendar events"
ON public.trip_events
FOR DELETE
USING (public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_calendar'));

-- trip_tasks
DROP POLICY IF EXISTS "Coordinators can insert trip tasks" ON public.trip_tasks;
CREATE POLICY "Coordinators can insert trip tasks"
ON public.trip_tasks
FOR INSERT
WITH CHECK (
  auth.uid() = creator_id
  AND public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_tasks')
);

DROP POLICY IF EXISTS "Coordinators can update trip tasks" ON public.trip_tasks;
CREATE POLICY "Coordinators can update trip tasks"
ON public.trip_tasks
FOR UPDATE
USING (public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_tasks'))
WITH CHECK (public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_tasks'));

DROP POLICY IF EXISTS "Coordinators can delete trip tasks" ON public.trip_tasks;
CREATE POLICY "Coordinators can delete trip tasks"
ON public.trip_tasks
FOR DELETE
USING (public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_tasks'));

DROP POLICY IF EXISTS "Coordinators can view trip tasks" ON public.trip_tasks;
CREATE POLICY "Coordinators can view trip tasks"
ON public.trip_tasks
FOR SELECT
USING (public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_tasks'));

-- trip_places
DROP POLICY IF EXISTS "Coordinators can insert trip places" ON public.trip_places;
CREATE POLICY "Coordinators can insert trip places"
ON public.trip_places
FOR INSERT
WITH CHECK (
  auth.uid() = added_by
  AND public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_places')
);

DROP POLICY IF EXISTS "Coordinators can update trip places" ON public.trip_places;
CREATE POLICY "Coordinators can update trip places"
ON public.trip_places
FOR UPDATE
USING (public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_places'))
WITH CHECK (public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_places'));

DROP POLICY IF EXISTS "Coordinators can delete trip places" ON public.trip_places;
CREATE POLICY "Coordinators can delete trip places"
ON public.trip_places
FOR DELETE
USING (public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_places'));

DROP POLICY IF EXISTS "Coordinators can view trip places" ON public.trip_places;
CREATE POLICY "Coordinators can view trip places"
ON public.trip_places
FOR SELECT
USING (public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_places'));

-- trip_links
DROP POLICY IF EXISTS "Coordinators can insert trip links" ON public.trip_links;
CREATE POLICY "Coordinators can insert trip links"
ON public.trip_links
FOR INSERT
WITH CHECK (
  auth.uid() = added_by
  AND public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_links')
);

DROP POLICY IF EXISTS "Coordinators can update trip links" ON public.trip_links;
CREATE POLICY "Coordinators can update trip links"
ON public.trip_links
FOR UPDATE
USING (public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_links'))
WITH CHECK (public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_links'));

DROP POLICY IF EXISTS "Coordinators can delete trip links" ON public.trip_links;
CREATE POLICY "Coordinators can delete trip links"
ON public.trip_links
FOR DELETE
USING (public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_links'));

DROP POLICY IF EXISTS "Coordinators can view trip links" ON public.trip_links;
CREATE POLICY "Coordinators can view trip links"
ON public.trip_links
FOR SELECT
USING (public.has_coordinator_capability(auth.uid(), trip_id, 'can_manage_shared_links'));

-- =========================================================================
-- 3. Enable the pro_coordinator_role kill switch
-- =========================================================================
UPDATE public.feature_flags SET enabled = true WHERE key = 'pro_coordinator_role';
