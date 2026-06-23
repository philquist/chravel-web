DROP POLICY IF EXISTS "Trip members can view pending actions" ON public.trip_pending_actions;
DROP POLICY IF EXISTS "Trip members can resolve pending actions" ON public.trip_pending_actions;

CREATE POLICY "Users can view their own pending actions"
ON public.trip_pending_actions
FOR SELECT
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can resolve their own pending actions"
ON public.trip_pending_actions
FOR UPDATE
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);