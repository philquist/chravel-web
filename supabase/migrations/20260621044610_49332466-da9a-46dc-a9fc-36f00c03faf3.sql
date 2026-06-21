ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only subscribe to their own profile topic"
  ON realtime.messages;

CREATE POLICY "Users can only subscribe to their own profile topic"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() NOT LIKE 'profiles:%'
    OR realtime.topic() = 'profiles:' || auth.uid()::text
  );