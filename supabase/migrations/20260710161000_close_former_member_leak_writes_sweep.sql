-- Close the final former-member WRITE leaks found by a full pg_policies sweep
-- (companion to 20260710160000, which fixed the read leaks + the first batch of writes).
--
-- These 7 policies still used the status-agnostic public.is_trip_member(...) in their
-- INSERT/UPDATE checks, so a member whose row is status = 'left' (removed or who left)
-- could still insert RSVPs, split patterns, files, links, polls, and receipts, and could
-- still update a trip's cover image. Rebind each to public.is_active_trip_member(...) —
-- identical predicate plus the active-status filter. Verified against production
-- (project jmjiyekmxwsxkfnqwyaa): all trip_members rows are status = 'active', so no
-- active member loses access; only removed/left members are excluded.
--
-- The trips "cover image only" policy keeps its full column-pinning WITH CHECK verbatim;
-- only the two is_trip_member(...) calls change.

DROP POLICY IF EXISTS "Members can insert their own RSVP" ON public.event_rsvps;
CREATE POLICY "Members can insert their own RSVP" ON public.event_rsvps
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.is_active_trip_member(auth.uid(), event_id)
  );

DROP POLICY IF EXISTS "Users can insert their own split patterns" ON public.payment_split_patterns;
CREATE POLICY "Users can insert their own split patterns" ON public.payment_split_patterns
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND public.is_active_trip_member((SELECT auth.uid()), trip_id)
  );

DROP POLICY IF EXISTS "Owners can insert trip_files" ON public.trip_files;
CREATE POLICY "Owners can insert trip_files" ON public.trip_files
  FOR INSERT WITH CHECK (
    auth.uid() = uploaded_by
    AND public.is_active_trip_member(auth.uid(), trip_id)
  );

DROP POLICY IF EXISTS "Owners can insert trip_links" ON public.trip_links;
CREATE POLICY "Owners can insert trip_links" ON public.trip_links
  FOR INSERT WITH CHECK (
    auth.uid() = added_by
    AND public.is_active_trip_member(auth.uid(), trip_id)
  );

DROP POLICY IF EXISTS "Owners can insert trip_polls" ON public.trip_polls;
CREATE POLICY "Owners can insert trip_polls" ON public.trip_polls
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND public.is_active_trip_member(auth.uid(), trip_id)
  );

DROP POLICY IF EXISTS "Members can insert trip_receipts" ON public.trip_receipts;
CREATE POLICY "Members can insert trip_receipts" ON public.trip_receipts
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.is_active_trip_member(auth.uid(), trip_id)
  );

-- trips: "update cover image only" — active members may touch only the cover image; every
-- other column is pinned to its current value. Preserve that guard exactly, swapping just
-- the membership helper to the active-status variant in both USING and WITH CHECK.
DROP POLICY IF EXISTS "Trip members can update cover image only" ON public.trips;
CREATE POLICY "Trip members can update cover image only" ON public.trips
  FOR UPDATE USING (public.is_active_trip_member(auth.uid(), id))
  WITH CHECK (
    public.is_active_trip_member(auth.uid(), id)
    AND (NOT (name IS DISTINCT FROM (SELECT t.name FROM trips t WHERE t.id = trips.id)))
    AND (NOT (description IS DISTINCT FROM (SELECT t.description FROM trips t WHERE t.id = trips.id)))
    AND (NOT (destination IS DISTINCT FROM (SELECT t.destination FROM trips t WHERE t.id = trips.id)))
    AND (NOT (start_date IS DISTINCT FROM (SELECT t.start_date FROM trips t WHERE t.id = trips.id)))
    AND (NOT (end_date IS DISTINCT FROM (SELECT t.end_date FROM trips t WHERE t.id = trips.id)))
    AND (NOT (trip_type IS DISTINCT FROM (SELECT t.trip_type FROM trips t WHERE t.id = trips.id)))
    AND (NOT (is_archived IS DISTINCT FROM (SELECT t.is_archived FROM trips t WHERE t.id = trips.id)))
    AND (NOT (privacy_mode IS DISTINCT FROM (SELECT t.privacy_mode FROM trips t WHERE t.id = trips.id)))
    AND (NOT (ai_access_enabled IS DISTINCT FROM (SELECT t.ai_access_enabled FROM trips t WHERE t.id = trips.id)))
    AND (NOT (chat_mode IS DISTINCT FROM (SELECT t.chat_mode FROM trips t WHERE t.id = trips.id)))
    AND (NOT (media_upload_mode IS DISTINCT FROM (SELECT t.media_upload_mode FROM trips t WHERE t.id = trips.id)))
    AND (NOT (enabled_features IS DISTINCT FROM (SELECT t.enabled_features FROM trips t WHERE t.id = trips.id)))
    AND (NOT (capacity IS DISTINCT FROM (SELECT t.capacity FROM trips t WHERE t.id = trips.id)))
    AND (NOT (registration_status IS DISTINCT FROM (SELECT t.registration_status FROM trips t WHERE t.id = trips.id)))
    AND (NOT (organizer_display_name IS DISTINCT FROM (SELECT t.organizer_display_name FROM trips t WHERE t.id = trips.id)))
    AND (NOT (created_by IS DISTINCT FROM (SELECT t.created_by FROM trips t WHERE t.id = trips.id)))
  );
