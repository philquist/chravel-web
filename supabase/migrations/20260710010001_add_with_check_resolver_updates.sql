-- Fix F-20: the resolver-gated UPDATE policies on trip_tasks / trip_polls / trip_events had
-- a USING clause but no explicit WITH CHECK. PostgreSQL currently reuses USING as the implicit
-- WITH CHECK, so this is defense-in-depth (not a behavior change today): making WITH CHECK
-- explicit prevents a future edit to USING from silently allowing a row to be UPDATEd into a
-- state that no longer satisfies the predicate (e.g. reassigning trip_id/created_by to escape
-- authorization). WITH CHECK mirrors USING exactly, so no legitimate update is affected.
-- The sibling coordinator UPDATE policies already carry WITH CHECK; this aligns the two.

DROP POLICY IF EXISTS "Resolver-gated task updates" ON public.trip_tasks;
CREATE POLICY "Resolver-gated task updates" ON public.trip_tasks
  FOR UPDATE
  USING (
    public.is_active_trip_member(auth.uid(), trip_id)
    AND public.can_trip_actor(trip_id, 'tasks', 'write')
    AND (creator_id = auth.uid() OR public.can_trip_actor(trip_id, 'tasks', 'admin'))
  )
  WITH CHECK (
    public.is_active_trip_member(auth.uid(), trip_id)
    AND public.can_trip_actor(trip_id, 'tasks', 'write')
    AND (creator_id = auth.uid() OR public.can_trip_actor(trip_id, 'tasks', 'admin'))
  );

DROP POLICY IF EXISTS "Resolver-gated poll updates" ON public.trip_polls;
CREATE POLICY "Resolver-gated poll updates" ON public.trip_polls
  FOR UPDATE
  USING (
    public.is_active_trip_member(auth.uid(), trip_id)
    AND (
      (created_by = auth.uid() AND public.can_trip_actor(trip_id, 'polls', 'write'))
      OR public.can_trip_actor(trip_id, 'polls', 'admin')
    )
  )
  WITH CHECK (
    public.is_active_trip_member(auth.uid(), trip_id)
    AND (
      (created_by = auth.uid() AND public.can_trip_actor(trip_id, 'polls', 'write'))
      OR public.can_trip_actor(trip_id, 'polls', 'admin')
    )
  );

DROP POLICY IF EXISTS "Resolver-gated event updates" ON public.trip_events;
CREATE POLICY "Resolver-gated event updates" ON public.trip_events
  FOR UPDATE
  USING (
    public.is_active_trip_member(auth.uid(), trip_id::text)
    AND public.can_trip_actor(trip_id::text, 'calendar', 'write')
    AND (created_by = auth.uid() OR public.can_trip_actor(trip_id::text, 'calendar', 'admin'))
  )
  WITH CHECK (
    public.is_active_trip_member(auth.uid(), trip_id::text)
    AND public.can_trip_actor(trip_id::text, 'calendar', 'write')
    AND (created_by = auth.uid() OR public.can_trip_actor(trip_id::text, 'calendar', 'admin'))
  );
