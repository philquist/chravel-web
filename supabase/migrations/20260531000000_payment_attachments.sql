-- Payment Attachments
-- Date: 2026-05-31
-- Purpose: Let trip members OPTIONALLY attach proof/context (receipt image, PDF/doc,
--          screenshot, order confirmation, or a URL) to a payment request. Each attachment
--          is uploaded/stored ONCE and surfaced in two places:
--            (a) the canonical Media index (trip_media_index / trip_link_index) so it appears
--                in the Media tab automatically, and
--            (b) a row in this `payment_attachments` join table, which is the source of truth
--                the payment card reads (the card never queries Media internals).
--
-- Security model: visibility mirrors the parent `trip_payment_messages` row via transitive RLS
-- (consumer trips => all members; pro/event => creator/debtor/admin/role), the same pattern
-- already used by `payment_splits`.
--
-- Rollback: DROP TABLE IF EXISTS public.payment_attachments CASCADE; (storage objects + media
-- index rows are intentionally NOT removed — the underlying asset remains valid trip media.)

-- =====================================================
-- 1. TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.payment_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id text NOT NULL,
  payment_message_id uuid NOT NULL REFERENCES public.trip_payment_messages(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attachment_type text NOT NULL CHECK (attachment_type IN ('image', 'video', 'file', 'link')),
  file_name text,
  mime_type text,
  file_size bigint,
  storage_path text,
  url text,
  title text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- 2. INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS payment_attachments_payment_message_id_idx
  ON public.payment_attachments (payment_message_id);
CREATE INDEX IF NOT EXISTS payment_attachments_trip_id_idx
  ON public.payment_attachments (trip_id);
CREATE INDEX IF NOT EXISTS payment_attachments_uploaded_by_idx
  ON public.payment_attachments (uploaded_by);
CREATE INDEX IF NOT EXISTS payment_attachments_attachment_type_idx
  ON public.payment_attachments (attachment_type);

-- =====================================================
-- 3. RLS
-- =====================================================

ALTER TABLE public.payment_attachments ENABLE ROW LEVEL SECURITY;

-- SELECT: visible only if the parent payment message is visible to the user.
-- `trip_payment_messages` RLS is enforced inside this EXISTS subquery, so this transitively
-- inherits the consumer/pro/event visibility rules (same approach as payment_splits).
DROP POLICY IF EXISTS "Members can view payment attachments" ON public.payment_attachments;
CREATE POLICY "Members can view payment attachments"
  ON public.payment_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_payment_messages tpm
      WHERE tpm.id = public.payment_attachments.payment_message_id
    )
  );

-- INSERT: only the authenticated uploader, who must be a member of the trip, and the parent
-- payment message must be visible to them and belong to the same trip.
DROP POLICY IF EXISTS "Members can add payment attachments" ON public.payment_attachments;
CREATE POLICY "Members can add payment attachments"
  ON public.payment_attachments
  FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id::text = public.payment_attachments.trip_id
      AND tm.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.trip_payment_messages tpm
      WHERE tpm.id = public.payment_attachments.payment_message_id
      AND tpm.trip_id = public.payment_attachments.trip_id
    )
  );

-- DELETE: the uploader, or the creator of the parent payment message.
DROP POLICY IF EXISTS "Uploaders or payment creators can delete attachments" ON public.payment_attachments;
CREATE POLICY "Uploaders or payment creators can delete attachments"
  ON public.payment_attachments
  FOR DELETE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.trip_payment_messages tpm
      WHERE tpm.id = public.payment_attachments.payment_message_id
      AND tpm.created_by = auth.uid()
    )
  );

-- =====================================================
-- 4. KILL SWITCH (feature flag)
-- =====================================================
-- Disable in < 60s without redeploy: UPDATE public.feature_flags SET enabled = false
--   WHERE key = 'payment_attachments';

INSERT INTO public.feature_flags (key, enabled, description) VALUES
  ('payment_attachments', true, 'Optional attachments (image/file/URL) on payment requests — disable to hide the attachment UI')
ON CONFLICT (key) DO NOTHING;
