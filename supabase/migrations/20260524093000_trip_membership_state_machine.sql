-- Canonical trip membership lifecycle states and audit trail
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trip_membership_state') THEN
    CREATE TYPE public.trip_membership_state AS ENUM ('invited', 'accepted', 'declined', 'removed', 'archived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.trip_membership_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_state public.trip_membership_state,
  to_state public.trip_membership_state NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_membership_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip members can read membership audit events" ON public.trip_membership_audit_events;
CREATE POLICY "Trip members can read membership audit events"
ON public.trip_membership_audit_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trip_members tm
    WHERE tm.trip_id = trip_membership_audit_events.trip_id
      AND tm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Service role can manage membership audit events" ON public.trip_membership_audit_events;
CREATE POLICY "Service role can manage membership audit events"
ON public.trip_membership_audit_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

ALTER TABLE public.trip_join_requests
  DROP CONSTRAINT IF EXISTS trip_join_requests_status_check;

ALTER TABLE public.trip_join_requests
  ADD CONSTRAINT trip_join_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));
