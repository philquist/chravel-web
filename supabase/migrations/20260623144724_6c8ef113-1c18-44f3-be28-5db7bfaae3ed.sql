CREATE TABLE IF NOT EXISTS public.concierge_conversation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id text NOT NULL,
  session_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, trip_id, session_id)
);
GRANT SELECT, INSERT ON public.concierge_conversation_sessions TO authenticated;
GRANT ALL ON public.concierge_conversation_sessions TO service_role;
ALTER TABLE public.concierge_conversation_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own conversation sessions"
  ON public.concierge_conversation_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS concierge_conversation_sessions_lookup_idx
  ON public.concierge_conversation_sessions (user_id, trip_id, session_id);