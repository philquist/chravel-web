
DROP POLICY IF EXISTS "Users can insert their own RSVP" ON public.event_rsvps;
CREATE POLICY "Members can insert their own RSVP"
  ON public.event_rsvps
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_trip_member(auth.uid(), event_id)
  );

DROP POLICY IF EXISTS "Payment creators can delete audit logs" ON public.payment_audit_log;

DROP POLICY IF EXISTS "Debtors can update their own payment splits" ON public.payment_splits;
CREATE POLICY "Debtors can mark their own split settled"
  ON public.payment_splits
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = debtor_user_id)
  WITH CHECK (
    auth.uid() = debtor_user_id
    AND amount_owed IS NOT DISTINCT FROM (SELECT ps.amount_owed FROM public.payment_splits ps WHERE ps.id = payment_splits.id)
    AND confirmation_status IS NOT DISTINCT FROM (SELECT ps.confirmation_status FROM public.payment_splits ps WHERE ps.id = payment_splits.id)
    AND confirmed_by IS NOT DISTINCT FROM (SELECT ps.confirmed_by FROM public.payment_splits ps WHERE ps.id = payment_splits.id)
    AND confirmed_at IS NOT DISTINCT FROM (SELECT ps.confirmed_at FROM public.payment_splits ps WHERE ps.id = payment_splits.id)
    AND debtor_user_id IS NOT DISTINCT FROM (SELECT ps.debtor_user_id FROM public.payment_splits ps WHERE ps.id = payment_splits.id)
    AND payment_message_id IS NOT DISTINCT FROM (SELECT ps.payment_message_id FROM public.payment_splits ps WHERE ps.id = payment_splits.id)
  );

DROP POLICY IF EXISTS "view_upvotes" ON public.event_qa_upvotes;
CREATE POLICY "Members can view upvotes"
  ON public.event_qa_upvotes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_qa_questions q
      WHERE q.id = event_qa_upvotes.question_id
        AND public.is_trip_member(auth.uid(), q.event_id)
    )
  );

DROP POLICY IF EXISTS "Trip members can update cover image" ON public.trips;
CREATE POLICY "Trip members can update cover image only"
  ON public.trips
  FOR UPDATE
  TO authenticated
  USING (public.is_trip_member(auth.uid(), id))
  WITH CHECK (
    public.is_trip_member(auth.uid(), id)
    AND name                   IS NOT DISTINCT FROM (SELECT t.name                   FROM public.trips t WHERE t.id = trips.id)
    AND description            IS NOT DISTINCT FROM (SELECT t.description            FROM public.trips t WHERE t.id = trips.id)
    AND destination            IS NOT DISTINCT FROM (SELECT t.destination            FROM public.trips t WHERE t.id = trips.id)
    AND start_date             IS NOT DISTINCT FROM (SELECT t.start_date             FROM public.trips t WHERE t.id = trips.id)
    AND end_date               IS NOT DISTINCT FROM (SELECT t.end_date               FROM public.trips t WHERE t.id = trips.id)
    AND trip_type              IS NOT DISTINCT FROM (SELECT t.trip_type              FROM public.trips t WHERE t.id = trips.id)
    AND is_archived            IS NOT DISTINCT FROM (SELECT t.is_archived            FROM public.trips t WHERE t.id = trips.id)
    AND privacy_mode           IS NOT DISTINCT FROM (SELECT t.privacy_mode           FROM public.trips t WHERE t.id = trips.id)
    AND ai_access_enabled      IS NOT DISTINCT FROM (SELECT t.ai_access_enabled      FROM public.trips t WHERE t.id = trips.id)
    AND chat_mode              IS NOT DISTINCT FROM (SELECT t.chat_mode              FROM public.trips t WHERE t.id = trips.id)
    AND media_upload_mode      IS NOT DISTINCT FROM (SELECT t.media_upload_mode      FROM public.trips t WHERE t.id = trips.id)
    AND enabled_features       IS NOT DISTINCT FROM (SELECT t.enabled_features       FROM public.trips t WHERE t.id = trips.id)
    AND capacity               IS NOT DISTINCT FROM (SELECT t.capacity               FROM public.trips t WHERE t.id = trips.id)
    AND registration_status    IS NOT DISTINCT FROM (SELECT t.registration_status    FROM public.trips t WHERE t.id = trips.id)
    AND organizer_display_name IS NOT DISTINCT FROM (SELECT t.organizer_display_name FROM public.trips t WHERE t.id = trips.id)
    AND created_by             IS NOT DISTINCT FROM (SELECT t.created_by             FROM public.trips t WHERE t.id = trips.id)
  );

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_attachments' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.payment_attachments', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Trip members can view payment attachments"
  ON public.payment_attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_payment_messages tpm
      WHERE tpm.id = payment_attachments.payment_message_id
        AND public.is_trip_member(auth.uid(), tpm.trip_id)
    )
  );

COMMENT ON TABLE public.apple_auth_tokens IS
  'Apple OAuth refresh tokens. Intentionally has NO user-facing RLS policies — accessed only via SECURITY DEFINER functions / service_role. RLS enabled denies all direct authenticated/anon reads.';
COMMENT ON TABLE public.gmail_accounts IS
  'Gmail OAuth tokens. No SELECT policy on base table is intentional — token columns never returned to clients. Reads go through the gmail_accounts_safe view which masks token columns.';
