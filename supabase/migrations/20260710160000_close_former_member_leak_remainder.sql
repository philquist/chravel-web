-- Close the remainder of the former-member access leak (extends F-07 / 20260710010000).
--
-- Root cause: the live 2-arg helper public.is_trip_member(_user_id, _trip_id) is
-- status-agnostic — it matches ANY trip_members row regardless of status. Only
-- public.is_active_trip_member(...) filters to (status IS NULL OR status = 'active').
-- The July 10 fix rebound trip_tasks/polls/events + can_access_channel to the
-- status-aware helper table-by-table but left every other trip-scoped policy still
-- using is_trip_member. A member whose row is status = 'left' (removed or who left)
-- therefore retained READ access to chat messages, places, basecamps, artifacts,
-- media reactions, payment attachments, the member roster, event lineup/upvotes, and
-- basecamp change history — and retained WRITE access wherever the same helper backed
-- an INSERT WITH CHECK.
--
-- Fix: rebind every remaining trip-scoped policy from is_trip_member(...) to
-- is_active_trip_member(...) — identical predicate plus the active-status filter — and
-- add the same active-status predicate to the inline trip_members membership checks on
-- trip_media_index. Verified against production (project jmjiyekmxwsxkfnqwyaa): all
-- current trip_members rows are status = 'active', so no active member loses access;
-- only removed/left members are excluded, matching the established F-07 intent.
--
-- Policy-only change: no table schema is altered, so generated types are unaffected.

-- ── Read (SELECT) leaks ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Trip members can view basecamp change history" ON public.basecamp_change_history;
CREATE POLICY "Trip members can view basecamp change history" ON public.basecamp_change_history
  FOR SELECT USING (public.is_active_trip_member((SELECT auth.uid()), trip_id));

DROP POLICY IF EXISTS "Event members can view lineup" ON public.event_lineup_members;
CREATE POLICY "Event members can view lineup" ON public.event_lineup_members
  FOR SELECT USING (public.is_active_trip_member(auth.uid(), event_id));

DROP POLICY IF EXISTS "Members can view upvotes" ON public.event_qa_upvotes;
CREATE POLICY "Members can view upvotes" ON public.event_qa_upvotes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.event_qa_questions q
      WHERE q.id = public.event_qa_upvotes.question_id
        AND public.is_active_trip_member(auth.uid(), q.event_id)
    )
  );

DROP POLICY IF EXISTS "Trip members can view reactions" ON public.message_reactions;
CREATE POLICY "Trip members can view reactions" ON public.message_reactions
  FOR SELECT USING (public.is_active_trip_member(auth.uid(), trip_id));

DROP POLICY IF EXISTS "Trip members can view payment attachments" ON public.payment_attachments;
CREATE POLICY "Trip members can view payment attachments" ON public.payment_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.trip_payment_messages tpm
      WHERE tpm.id = public.payment_attachments.payment_message_id
        AND public.is_active_trip_member(auth.uid(), tpm.trip_id)
    )
  );

DROP POLICY IF EXISTS "Trip members can view artifacts" ON public.trip_artifacts;
CREATE POLICY "Trip members can view artifacts" ON public.trip_artifacts
  FOR SELECT USING (public.is_active_trip_member((SELECT auth.uid()), trip_id));

DROP POLICY IF EXISTS "Trip members can view trip base camps" ON public.trip_base_camps;
CREATE POLICY "Trip members can view trip base camps" ON public.trip_base_camps
  FOR SELECT USING (public.is_active_trip_member((SELECT auth.uid()), trip_id));

DROP POLICY IF EXISTS "Members can read messages" ON public.trip_chat_messages;
CREATE POLICY "Members can read messages" ON public.trip_chat_messages
  FOR SELECT USING (public.is_active_trip_member((SELECT auth.uid()), trip_id));

DROP POLICY IF EXISTS "Trip members can view fellow members" ON public.trip_members;
CREATE POLICY "Trip members can view fellow members" ON public.trip_members
  FOR SELECT USING (public.is_active_trip_member((SELECT auth.uid()), trip_id));

DROP POLICY IF EXISTS "Trip members can view trip places" ON public.trip_places;
CREATE POLICY "Trip members can view trip places" ON public.trip_places
  FOR SELECT USING (public.is_active_trip_member((SELECT auth.uid()), trip_id));

-- trip_media_index: the "Members can view/insert/update/delete trip media" policies use an
-- inline trip_members EXISTS with no status predicate; the duplicate "trip_media_index_update"
-- UPDATE policy uses the status-agnostic helper. Add the active-status filter to all of them
-- so former members lose media read/write.
DROP POLICY IF EXISTS "Members can view trip media" ON public.trip_media_index;
CREATE POLICY "Members can view trip media" ON public.trip_media_index
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.trip_members m
      WHERE m.trip_id = public.trip_media_index.trip_id
        AND m.user_id = (SELECT auth.uid())
        AND (m.status IS NULL OR m.status = 'active')
    )
  );

DROP POLICY IF EXISTS "Members can insert trip media" ON public.trip_media_index;
CREATE POLICY "Members can insert trip media" ON public.trip_media_index
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trip_members m
      WHERE m.trip_id = public.trip_media_index.trip_id
        AND m.user_id = (SELECT auth.uid())
        AND (m.status IS NULL OR m.status = 'active')
    )
  );

DROP POLICY IF EXISTS "Members can update trip media" ON public.trip_media_index;
CREATE POLICY "Members can update trip media" ON public.trip_media_index
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.trip_members m
      WHERE m.trip_id = public.trip_media_index.trip_id
        AND m.user_id = (SELECT auth.uid())
        AND (m.status IS NULL OR m.status = 'active')
    )
  );

DROP POLICY IF EXISTS "Members can delete trip media" ON public.trip_media_index;
CREATE POLICY "Members can delete trip media" ON public.trip_media_index
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.trip_members m
      WHERE m.trip_id = public.trip_media_index.trip_id
        AND m.user_id = (SELECT auth.uid())
        AND (m.status IS NULL OR m.status = 'active')
    )
  );

-- Drop the redundant status-agnostic helper-based UPDATE policy; the status-aware
-- "Members can update trip media" above is the single source of truth for media updates.
DROP POLICY IF EXISTS "trip_media_index_update" ON public.trip_media_index;

-- ── Write (WITH CHECK) leaks ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Trip members can record basecamp changes" ON public.basecamp_change_history;
CREATE POLICY "Trip members can record basecamp changes" ON public.basecamp_change_history
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND public.is_active_trip_member((SELECT auth.uid()), trip_id)
  );

DROP POLICY IF EXISTS "Users can insert own reactions" ON public.message_reactions;
CREATE POLICY "Users can insert own reactions" ON public.message_reactions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND public.is_active_trip_member(auth.uid(), trip_id)
  );

DROP POLICY IF EXISTS "Trip members can insert artifacts" ON public.trip_artifacts;
CREATE POLICY "Trip members can insert artifacts" ON public.trip_artifacts
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = creator_id
    AND public.is_active_trip_member((SELECT auth.uid()), trip_id)
  );

DROP POLICY IF EXISTS "Members can insert messages" ON public.trip_chat_messages;
CREATE POLICY "Members can insert messages" ON public.trip_chat_messages
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND public.is_active_trip_member((SELECT auth.uid()), trip_id)
  );

-- Redundant status-agnostic INSERT policy on the same table (inline trip_members EXISTS).
-- Rebind to the active-status filter so it cannot re-open former-member sends.
DROP POLICY IF EXISTS "Users send messages as themselves only" ON public.trip_chat_messages;
CREATE POLICY "Users send messages as themselves only" ON public.trip_chat_messages
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.trip_members
      WHERE trip_members.trip_id = public.trip_chat_messages.trip_id
        AND trip_members.user_id = (SELECT auth.uid())
        AND (trip_members.status IS NULL OR trip_members.status = 'active')
    )
  );

DROP POLICY IF EXISTS "Trip members can add trip places" ON public.trip_places;
CREATE POLICY "Trip members can add trip places" ON public.trip_places
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = added_by
    AND public.is_active_trip_member((SELECT auth.uid()), trip_id)
  );

DROP POLICY IF EXISTS "Trip members can insert their own pending actions" ON public.trip_pending_actions;
CREATE POLICY "Trip members can insert their own pending actions" ON public.trip_pending_actions
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND public.is_active_trip_member((SELECT auth.uid()), trip_id)
  );
