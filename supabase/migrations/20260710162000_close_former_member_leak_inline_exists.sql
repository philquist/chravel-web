-- Close former-member leak via inline trip_members EXISTS (add active-status filter).
--
-- Companion to 20260710160000 / 20260710161000, which fixed policies using the
-- status-agnostic is_trip_member() helper. A full-schema sweep found a second class:
-- ~55 policies gate on an INLINE `EXISTS (SELECT 1 FROM trip_members ... WHERE
-- user_id = auth.uid())` with no status predicate, so a member whose row is
-- status = 'left' still passed. Add `(status IS NULL OR status = 'active')` to every
-- trip_members EXISTS subquery (leaving trip_admins/trips/own-authorship branches and
-- role checks untouched). Verified against production: all trip_members rows are
-- status = 'active', so no active member loses access; only removed/left members are
-- excluded. Policy-only change — no schema/type impact.

DROP POLICY IF EXISTS "Trip members can create broadcasts" ON public.broadcasts;
CREATE POLICY "Trip members can create broadcasts" ON public.broadcasts
  FOR INSERT WITH CHECK (((( SELECT auth.uid() AS uid) = created_by) AND (EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = broadcasts.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active'))))));

DROP POLICY IF EXISTS "Trip members can view broadcasts" ON public.broadcasts;
CREATE POLICY "Trip members can view broadcasts" ON public.broadcasts
  FOR SELECT USING ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = broadcasts.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))));

DROP POLICY IF EXISTS "Trip members can delete category assignments" ON public.category_assignments;
CREATE POLICY "Trip members can delete category assignments" ON public.category_assignments
  FOR DELETE USING ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = category_assignments.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))));

DROP POLICY IF EXISTS "Trip members can create category assignments" ON public.category_assignments;
CREATE POLICY "Trip members can create category assignments" ON public.category_assignments
  FOR INSERT WITH CHECK ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = category_assignments.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))));

DROP POLICY IF EXISTS "Trip members can view category assignments" ON public.category_assignments;
CREATE POLICY "Trip members can view category assignments" ON public.category_assignments
  FOR SELECT USING ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = category_assignments.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))));

DROP POLICY IF EXISTS "Trip members can update category assignments" ON public.category_assignments;
CREATE POLICY "Trip members can update category assignments" ON public.category_assignments
  FOR UPDATE USING ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = category_assignments.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))));

DROP POLICY IF EXISTS "Event admins can delete agenda items" ON public.event_agenda_items;
CREATE POLICY "Event admins can delete agenda items" ON public.event_agenda_items
  FOR DELETE USING (((EXISTS ( SELECT 1 FROM trip_members WHERE ((trip_members.trip_id = event_agenda_items.event_id) AND (trip_members.user_id = ( SELECT auth.uid() AS uid)) AND (trip_members.role = 'admin'::text) AND (trip_members.status IS NULL OR trip_members.status = 'active')))) OR (EXISTS ( SELECT 1 FROM trip_admins WHERE ((trip_admins.trip_id = event_agenda_items.event_id) AND (trip_admins.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "Event admins can insert agenda items" ON public.event_agenda_items;
CREATE POLICY "Event admins can insert agenda items" ON public.event_agenda_items
  FOR INSERT WITH CHECK (((EXISTS ( SELECT 1 FROM trip_members WHERE ((trip_members.trip_id = event_agenda_items.event_id) AND (trip_members.user_id = ( SELECT auth.uid() AS uid)) AND (trip_members.role = 'admin'::text) AND (trip_members.status IS NULL OR trip_members.status = 'active')))) OR (EXISTS ( SELECT 1 FROM trip_admins WHERE ((trip_admins.trip_id = event_agenda_items.event_id) AND (trip_admins.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "Event members can view agenda items" ON public.event_agenda_items;
CREATE POLICY "Event members can view agenda items" ON public.event_agenda_items
  FOR SELECT USING ((EXISTS ( SELECT 1 FROM trip_members WHERE ((trip_members.trip_id = event_agenda_items.event_id) AND (trip_members.user_id = ( SELECT auth.uid() AS uid)) AND (trip_members.status IS NULL OR trip_members.status = 'active')))));

DROP POLICY IF EXISTS "Event admins can update agenda items" ON public.event_agenda_items;
CREATE POLICY "Event admins can update agenda items" ON public.event_agenda_items
  FOR UPDATE USING (((EXISTS ( SELECT 1 FROM trip_members WHERE ((trip_members.trip_id = event_agenda_items.event_id) AND (trip_members.user_id = ( SELECT auth.uid() AS uid)) AND (trip_members.role = 'admin'::text) AND (trip_members.status IS NULL OR trip_members.status = 'active')))) OR (EXISTS ( SELECT 1 FROM trip_admins WHERE ((trip_admins.trip_id = event_agenda_items.event_id) AND (trip_admins.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "Event admins can delete lineup" ON public.event_lineup_members;
CREATE POLICY "Event admins can delete lineup" ON public.event_lineup_members
  FOR DELETE USING (((EXISTS ( SELECT 1 FROM trip_members WHERE ((trip_members.trip_id = event_lineup_members.event_id) AND (trip_members.user_id = auth.uid()) AND (trip_members.role = 'admin'::text) AND (trip_members.status IS NULL OR trip_members.status = 'active')))) OR (EXISTS ( SELECT 1 FROM trip_admins WHERE ((trip_admins.trip_id = event_lineup_members.event_id) AND (trip_admins.user_id = auth.uid())))) OR (EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = event_lineup_members.event_id) AND (trips.created_by = auth.uid()))))));

DROP POLICY IF EXISTS "Event admins can insert lineup" ON public.event_lineup_members;
CREATE POLICY "Event admins can insert lineup" ON public.event_lineup_members
  FOR INSERT WITH CHECK (((EXISTS ( SELECT 1 FROM trip_members WHERE ((trip_members.trip_id = event_lineup_members.event_id) AND (trip_members.user_id = auth.uid()) AND (trip_members.role = 'admin'::text) AND (trip_members.status IS NULL OR trip_members.status = 'active')))) OR (EXISTS ( SELECT 1 FROM trip_admins WHERE ((trip_admins.trip_id = event_lineup_members.event_id) AND (trip_admins.user_id = auth.uid())))) OR (EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = event_lineup_members.event_id) AND (trips.created_by = auth.uid()))))));

DROP POLICY IF EXISTS "Event admins can update lineup" ON public.event_lineup_members;
CREATE POLICY "Event admins can update lineup" ON public.event_lineup_members
  FOR UPDATE USING (((EXISTS ( SELECT 1 FROM trip_members WHERE ((trip_members.trip_id = event_lineup_members.event_id) AND (trip_members.user_id = auth.uid()) AND (trip_members.role = 'admin'::text) AND (trip_members.status IS NULL OR trip_members.status = 'active')))) OR (EXISTS ( SELECT 1 FROM trip_admins WHERE ((trip_admins.trip_id = event_lineup_members.event_id) AND (trip_admins.user_id = auth.uid())))) OR (EXISTS ( SELECT 1 FROM trips WHERE ((trips.id = event_lineup_members.event_id) AND (trips.created_by = auth.uid()))))));

DROP POLICY IF EXISTS "insert_qa_questions" ON public.event_qa_questions;
CREATE POLICY "insert_qa_questions" ON public.event_qa_questions
  FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = event_qa_questions.event_id) AND (tm.user_id = auth.uid()) AND (tm.status IS NULL OR tm.status = 'active'))))));

DROP POLICY IF EXISTS "view_qa_questions" ON public.event_qa_questions;
CREATE POLICY "view_qa_questions" ON public.event_qa_questions
  FOR SELECT USING ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = event_qa_questions.event_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))));

DROP POLICY IF EXISTS "update_qa_questions" ON public.event_qa_questions;
CREATE POLICY "update_qa_questions" ON public.event_qa_questions
  FOR UPDATE USING ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = event_qa_questions.event_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.role = ANY (ARRAY['admin'::text, 'organizer'::text])) AND (tm.status IS NULL OR tm.status = 'active')))));

DROP POLICY IF EXISTS "Event admins can delete tasks" ON public.event_tasks;
CREATE POLICY "Event admins can delete tasks" ON public.event_tasks
  FOR DELETE USING (((EXISTS ( SELECT 1 FROM trip_members WHERE ((trip_members.trip_id = event_tasks.event_id) AND (trip_members.user_id = ( SELECT auth.uid() AS uid)) AND (trip_members.role = 'admin'::text) AND (trip_members.status IS NULL OR trip_members.status = 'active')))) OR (EXISTS ( SELECT 1 FROM trip_admins WHERE ((trip_admins.trip_id = event_tasks.event_id) AND (trip_admins.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "Event admins can insert tasks" ON public.event_tasks;
CREATE POLICY "Event admins can insert tasks" ON public.event_tasks
  FOR INSERT WITH CHECK (((EXISTS ( SELECT 1 FROM trip_members WHERE ((trip_members.trip_id = event_tasks.event_id) AND (trip_members.user_id = ( SELECT auth.uid() AS uid)) AND (trip_members.role = 'admin'::text) AND (trip_members.status IS NULL OR trip_members.status = 'active')))) OR (EXISTS ( SELECT 1 FROM trip_admins WHERE ((trip_admins.trip_id = event_tasks.event_id) AND (trip_admins.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "Event members can view tasks" ON public.event_tasks;
CREATE POLICY "Event members can view tasks" ON public.event_tasks
  FOR SELECT USING ((EXISTS ( SELECT 1 FROM trip_members WHERE ((trip_members.trip_id = event_tasks.event_id) AND (trip_members.user_id = ( SELECT auth.uid() AS uid)) AND (trip_members.status IS NULL OR trip_members.status = 'active')))));

DROP POLICY IF EXISTS "Event admins can update tasks" ON public.event_tasks;
CREATE POLICY "Event admins can update tasks" ON public.event_tasks
  FOR UPDATE USING (((EXISTS ( SELECT 1 FROM trip_members WHERE ((trip_members.trip_id = event_tasks.event_id) AND (trip_members.user_id = ( SELECT auth.uid() AS uid)) AND (trip_members.role = 'admin'::text) AND (trip_members.status IS NULL OR trip_members.status = 'active')))) OR (EXISTS ( SELECT 1 FROM trip_admins WHERE ((trip_admins.trip_id = event_tasks.event_id) AND (trip_admins.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "Users can insert kb_documents for their trips" ON public.kb_documents;
CREATE POLICY "Users can insert kb_documents for their trips" ON public.kb_documents
  FOR INSERT WITH CHECK ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = kb_documents.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))));

DROP POLICY IF EXISTS "Users can view kb_documents for their trips" ON public.kb_documents;
CREATE POLICY "Users can view kb_documents for their trips" ON public.kb_documents
  FOR SELECT USING ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = kb_documents.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))));

DROP POLICY IF EXISTS "Members can add payment attachments" ON public.payment_attachments;
CREATE POLICY "Members can add payment attachments" ON public.payment_attachments
  FOR INSERT WITH CHECK (((uploaded_by = auth.uid()) AND (EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = payment_attachments.trip_id) AND (tm.user_id = auth.uid()) AND (tm.status IS NULL OR tm.status = 'active')))) AND (EXISTS ( SELECT 1 FROM trip_payment_messages tpm WHERE ((tpm.id = payment_attachments.payment_message_id) AND (tpm.trip_id = payment_attachments.trip_id))))));

DROP POLICY IF EXISTS "Trip members can view admins" ON public.trip_admins;
CREATE POLICY "Trip members can view admins" ON public.trip_admins
  FOR SELECT USING ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_admins.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))));

DROP POLICY IF EXISTS "Trip members can view embeddings" ON public.trip_embeddings;
CREATE POLICY "Trip members can view embeddings" ON public.trip_embeddings
  FOR SELECT USING ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_embeddings.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))));

DROP POLICY IF EXISTS "Allow calendar event deletion" ON public.trip_events;
CREATE POLICY "Allow calendar event deletion" ON public.trip_events
  FOR DELETE USING (((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_events.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))) OR (EXISTS ( SELECT 1 FROM trips t WHERE ((t.id = trip_events.trip_id) AND (t.created_by = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "Allow calendar event creation" ON public.trip_events;
CREATE POLICY "Allow calendar event creation" ON public.trip_events
  FOR INSERT WITH CHECK (((( SELECT auth.uid() AS uid) = created_by) AND ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_events.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))) OR (EXISTS ( SELECT 1 FROM trips t WHERE ((t.id = trip_events.trip_id) AND (t.created_by = ( SELECT auth.uid() AS uid))))))));

DROP POLICY IF EXISTS "Allow viewing calendar events" ON public.trip_events;
CREATE POLICY "Allow viewing calendar events" ON public.trip_events
  FOR SELECT USING (((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_events.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))) OR (EXISTS ( SELECT 1 FROM trips t WHERE ((t.id = trip_events.trip_id) AND (t.created_by = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "Allow calendar event updates" ON public.trip_events;
CREATE POLICY "Allow calendar event updates" ON public.trip_events
  FOR UPDATE USING (((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_events.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))) OR (EXISTS ( SELECT 1 FROM trips t WHERE ((t.id = trip_events.trip_id) AND (t.created_by = ( SELECT auth.uid() AS uid))))))) WITH CHECK (((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_events.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))) OR (EXISTS ( SELECT 1 FROM trips t WHERE ((t.id = trip_events.trip_id) AND (t.created_by = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "Members can read trip_files" ON public.trip_files;
CREATE POLICY "Members can read trip_files" ON public.trip_files
  FOR SELECT USING (((EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_files.trip_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status IS NULL OR m.status = 'active')))) OR (uploaded_by = ( SELECT auth.uid() AS uid))));

DROP POLICY IF EXISTS "Members or admins can delete invites based on trip type" ON public.trip_invites;
CREATE POLICY "Members or admins can delete invites based on trip type" ON public.trip_invites
  FOR DELETE USING ((EXISTS ( SELECT 1 FROM trips t WHERE ((t.id = trip_invites.trip_id) AND ((t.created_by = auth.uid()) OR ((COALESCE(t.trip_type, 'consumer'::text) = 'consumer'::text) AND (EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = t.id) AND (tm.user_id = auth.uid()) AND (tm.status IS NULL OR tm.status = 'active'))))) OR ((COALESCE(t.trip_type, 'consumer'::text) = ANY (ARRAY['pro'::text, 'event'::text])) AND (EXISTS ( SELECT 1 FROM trip_admins ta WHERE ((ta.trip_id = t.id) AND (ta.user_id = auth.uid()))))))))));

DROP POLICY IF EXISTS "Members or admins can create invites based on trip type" ON public.trip_invites;
CREATE POLICY "Members or admins can create invites based on trip type" ON public.trip_invites
  FOR INSERT WITH CHECK (((auth.uid() = created_by) AND (EXISTS ( SELECT 1 FROM trips t WHERE ((t.id = trip_invites.trip_id) AND ((t.created_by = auth.uid()) OR ((COALESCE(t.trip_type, 'consumer'::text) = 'consumer'::text) AND (EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = t.id) AND (tm.user_id = auth.uid()) AND (tm.status IS NULL OR tm.status = 'active'))))) OR ((COALESCE(t.trip_type, 'consumer'::text) = ANY (ARRAY['pro'::text, 'event'::text])) AND (EXISTS ( SELECT 1 FROM trip_admins ta WHERE ((ta.trip_id = t.id) AND (ta.user_id = auth.uid())))))))))));

DROP POLICY IF EXISTS "Members or admins can update invites based on trip type" ON public.trip_invites;
CREATE POLICY "Members or admins can update invites based on trip type" ON public.trip_invites
  FOR UPDATE USING ((EXISTS ( SELECT 1 FROM trips t WHERE ((t.id = trip_invites.trip_id) AND ((t.created_by = auth.uid()) OR ((COALESCE(t.trip_type, 'consumer'::text) = 'consumer'::text) AND (EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = t.id) AND (tm.user_id = auth.uid()) AND (tm.status IS NULL OR tm.status = 'active'))))) OR ((COALESCE(t.trip_type, 'consumer'::text) = ANY (ARRAY['pro'::text, 'event'::text])) AND (EXISTS ( SELECT 1 FROM trip_admins ta WHERE ((ta.trip_id = t.id) AND (ta.user_id = auth.uid()))))))))));

DROP POLICY IF EXISTS "Members can delete trip links" ON public.trip_link_index;
CREATE POLICY "Members can delete trip links" ON public.trip_link_index
  FOR DELETE USING ((EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_link_index.trip_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status IS NULL OR m.status = 'active')))));

DROP POLICY IF EXISTS "Members can insert trip links" ON public.trip_link_index;
CREATE POLICY "Members can insert trip links" ON public.trip_link_index
  FOR INSERT WITH CHECK ((EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_link_index.trip_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status IS NULL OR m.status = 'active')))));

DROP POLICY IF EXISTS "Members can view trip links" ON public.trip_link_index;
CREATE POLICY "Members can view trip links" ON public.trip_link_index
  FOR SELECT USING ((EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_link_index.trip_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status IS NULL OR m.status = 'active')))));

DROP POLICY IF EXISTS "Members can update trip links" ON public.trip_link_index;
CREATE POLICY "Members can update trip links" ON public.trip_link_index
  FOR UPDATE USING ((EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_link_index.trip_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status IS NULL OR m.status = 'active')))));

DROP POLICY IF EXISTS "Members can delete trip links" ON public.trip_links;
CREATE POLICY "Members can delete trip links" ON public.trip_links
  FOR DELETE USING (((( SELECT auth.uid() AS uid) = added_by) OR (EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_links.trip_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status IS NULL OR m.status = 'active'))))));

DROP POLICY IF EXISTS "Members can read trip_links" ON public.trip_links;
CREATE POLICY "Members can read trip_links" ON public.trip_links
  FOR SELECT USING (((EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_links.trip_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status IS NULL OR m.status = 'active')))) OR (added_by = ( SELECT auth.uid() AS uid))));

DROP POLICY IF EXISTS "Users can delete own trip preferences" ON public.trip_member_preferences;
CREATE POLICY "Users can delete own trip preferences" ON public.trip_member_preferences
  FOR DELETE USING (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_member_preferences.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active'))))));

DROP POLICY IF EXISTS "Users can insert own trip preferences" ON public.trip_member_preferences;
CREATE POLICY "Users can insert own trip preferences" ON public.trip_member_preferences
  FOR INSERT WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_member_preferences.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active'))))));

DROP POLICY IF EXISTS "Users can view own trip preferences" ON public.trip_member_preferences;
CREATE POLICY "Users can view own trip preferences" ON public.trip_member_preferences
  FOR SELECT USING (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_member_preferences.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active'))))));

DROP POLICY IF EXISTS "Users can update own trip preferences" ON public.trip_member_preferences;
CREATE POLICY "Users can update own trip preferences" ON public.trip_member_preferences
  FOR UPDATE USING (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_member_preferences.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active'))))));

DROP POLICY IF EXISTS "Trip members can create payment messages" ON public.trip_payment_messages;
CREATE POLICY "Trip members can create payment messages" ON public.trip_payment_messages
  FOR INSERT WITH CHECK (((( SELECT auth.uid() AS uid) = created_by) AND (EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_payment_messages.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active'))))));

DROP POLICY IF EXISTS "Trip members can view payment messages" ON public.trip_payment_messages;
CREATE POLICY "Trip members can view payment messages" ON public.trip_payment_messages
  FOR SELECT USING ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_payment_messages.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))));

DROP POLICY IF EXISTS "Members can read trip_polls" ON public.trip_polls;
CREATE POLICY "Members can read trip_polls" ON public.trip_polls
  FOR SELECT USING (((EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_polls.trip_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status IS NULL OR m.status = 'active')))) OR (created_by = ( SELECT auth.uid() AS uid))));

DROP POLICY IF EXISTS "Members can delete trip_preferences" ON public.trip_preferences;
CREATE POLICY "Members can delete trip_preferences" ON public.trip_preferences
  FOR DELETE USING ((EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_preferences.trip_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status IS NULL OR m.status = 'active')))));

DROP POLICY IF EXISTS "Members can insert trip_preferences" ON public.trip_preferences;
CREATE POLICY "Members can insert trip_preferences" ON public.trip_preferences
  FOR INSERT WITH CHECK ((EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_preferences.trip_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status IS NULL OR m.status = 'active')))));

DROP POLICY IF EXISTS "Members can read trip_preferences" ON public.trip_preferences;
CREATE POLICY "Members can read trip_preferences" ON public.trip_preferences
  FOR SELECT USING ((EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_preferences.trip_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status IS NULL OR m.status = 'active')))));

DROP POLICY IF EXISTS "Members can update trip_preferences" ON public.trip_preferences;
CREATE POLICY "Members can update trip_preferences" ON public.trip_preferences
  FOR UPDATE USING ((EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_preferences.trip_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status IS NULL OR m.status = 'active'))))) WITH CHECK ((EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_preferences.trip_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status IS NULL OR m.status = 'active')))));

DROP POLICY IF EXISTS "Trip members can view privacy configs" ON public.trip_privacy_configs;
CREATE POLICY "Trip members can view privacy configs" ON public.trip_privacy_configs
  FOR SELECT USING ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_privacy_configs.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))));

DROP POLICY IF EXISTS "Trip members can view roles" ON public.trip_roles;
CREATE POLICY "Trip members can view roles" ON public.trip_roles
  FOR SELECT USING ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_roles.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))));

DROP POLICY IF EXISTS "Trip members can create tasks" ON public.trip_tasks;
CREATE POLICY "Trip members can create tasks" ON public.trip_tasks
  FOR INSERT WITH CHECK (((( SELECT auth.uid() AS uid) = creator_id) AND (EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_tasks.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active'))))));

DROP POLICY IF EXISTS "Trip members can view tasks" ON public.trip_tasks;
CREATE POLICY "Trip members can view tasks" ON public.trip_tasks
  FOR SELECT USING ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = trip_tasks.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))));

DROP POLICY IF EXISTS "Trip members can view all role assignments" ON public.user_trip_roles;
CREATE POLICY "Trip members can view all role assignments" ON public.user_trip_roles
  FOR SELECT USING ((EXISTS ( SELECT 1 FROM trip_members tm WHERE ((tm.trip_id = user_trip_roles.trip_id) AND (tm.user_id = ( SELECT auth.uid() AS uid)) AND (tm.status IS NULL OR tm.status = 'active')))));
