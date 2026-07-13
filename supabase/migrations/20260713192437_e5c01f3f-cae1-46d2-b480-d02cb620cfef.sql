
-- 1) broadcast_reactions: require trip membership
DROP POLICY IF EXISTS "Users can manage their own reactions" ON public.broadcast_reactions;
CREATE POLICY "Users can manage their own reactions"
ON public.broadcast_reactions
FOR ALL
TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  AND EXISTS (
    SELECT 1
    FROM public.broadcasts b
    WHERE b.id = broadcast_reactions.broadcast_id
      AND public.is_active_trip_member(auth.uid(), b.trip_id)
  )
)
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND EXISTS (
    SELECT 1
    FROM public.broadcasts b
    WHERE b.id = broadcast_reactions.broadcast_id
      AND public.is_active_trip_member(auth.uid(), b.trip_id)
  )
);

-- 2) event_qa_upvotes: require event/trip membership on INSERT
DROP POLICY IF EXISTS "insert_upvotes" ON public.event_qa_upvotes;
CREATE POLICY "insert_upvotes"
ON public.event_qa_upvotes
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND EXISTS (
    SELECT 1
    FROM public.event_qa_questions q
    WHERE q.id = event_qa_upvotes.question_id
      AND public.is_active_trip_member(auth.uid(), q.event_id)
  )
);

-- 3) message_read_receipts: INSERT must verify user has access to the referenced message
DROP POLICY IF EXISTS "Users can create own read receipts" ON public.message_read_receipts;
CREATE POLICY "Users can create own read receipts"
ON public.message_read_receipts
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND (
    (message_type = 'trip' AND EXISTS (
      SELECT 1
      FROM public.trip_chat_messages tcm
      JOIN public.trip_members tm ON tm.trip_id = tcm.trip_id
      WHERE tcm.id = message_read_receipts.message_id
        AND tm.user_id = auth.uid()
    ))
    OR
    (message_type = 'channel' AND EXISTS (
      SELECT 1
      FROM public.channel_messages cm
      JOIN public.channel_members chm ON chm.channel_id = cm.channel_id
      WHERE cm.id = message_read_receipts.message_id
        AND chm.user_id = auth.uid()
    ))
  )
);
