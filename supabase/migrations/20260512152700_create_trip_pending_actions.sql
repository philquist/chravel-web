-- Create trip_pending_actions: the AI concierge's "confirm before write" buffer.
-- All AI-initiated mutations to shared trip data flow through this table so a
-- user can confirm or reject before the actual mutation runs.
-- Schema matches PendingAction in src/hooks/usePendingActions.ts.

CREATE TABLE IF NOT EXISTS public.trip_pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_call_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired')),
  source_type TEXT NOT NULL DEFAULT 'ai_concierge',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS trip_pending_actions_trip_status_idx
  ON public.trip_pending_actions (trip_id, status);
CREATE INDEX IF NOT EXISTS trip_pending_actions_user_idx
  ON public.trip_pending_actions (user_id);
CREATE INDEX IF NOT EXISTS trip_pending_actions_created_at_idx
  ON public.trip_pending_actions (created_at DESC);

ALTER TABLE public.trip_pending_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip members can view pending actions" ON public.trip_pending_actions;
CREATE POLICY "Trip members can view pending actions"
  ON public.trip_pending_actions FOR SELECT
  USING (public.is_trip_member((SELECT auth.uid()), trip_id));

DROP POLICY IF EXISTS "Trip members can insert their own pending actions" ON public.trip_pending_actions;
CREATE POLICY "Trip members can insert their own pending actions"
  ON public.trip_pending_actions FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND public.is_trip_member((SELECT auth.uid()), trip_id)
  );

DROP POLICY IF EXISTS "Trip members can resolve pending actions" ON public.trip_pending_actions;
CREATE POLICY "Trip members can resolve pending actions"
  ON public.trip_pending_actions FOR UPDATE
  USING (public.is_trip_member((SELECT auth.uid()), trip_id))
  WITH CHECK (public.is_trip_member((SELECT auth.uid()), trip_id));

DROP POLICY IF EXISTS "Authors can delete their own pending actions" ON public.trip_pending_actions;
CREATE POLICY "Authors can delete their own pending actions"
  ON public.trip_pending_actions FOR DELETE
  USING ((SELECT auth.uid()) = user_id);
