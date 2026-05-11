-- Durable idempotency store for execute-concierge-tool mutating actions
CREATE TABLE IF NOT EXISTS public.concierge_tool_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed')),
  result_ref text,
  result_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, trip_id, tool_name, idempotency_key)
);

CREATE INDEX IF NOT EXISTS concierge_tool_idempotency_trip_user_idx
  ON public.concierge_tool_idempotency (trip_id, user_id);

ALTER TABLE public.concierge_tool_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own concierge idempotency records"
  ON public.concierge_tool_idempotency
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own concierge idempotency records"
  ON public.concierge_tool_idempotency
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own concierge idempotency records"
  ON public.concierge_tool_idempotency
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
