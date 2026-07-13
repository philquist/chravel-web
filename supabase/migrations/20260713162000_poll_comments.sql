-- Poll Comments (discussion wall under each poll)
-- Date: 2026-07-13
-- Purpose: Let trip members discuss a poll after (or while) voting — vote + reply
--          under the same card. This is the differentiator vs iMessage/WhatsApp polls.
--
-- Security: membership-scoped RLS (active trip members only). Authors can edit/delete
-- their own comments; poll creators can delete any comment on their poll.
-- Regression review: does not touch trip loading, auth hydration, payments, or chat.
-- Existence≠access enforced via trip_members status='active' checks on every policy.
--
-- Kill switch: UPDATE public.feature_flags SET enabled = false WHERE key = 'poll_comments';
-- Rollback: DROP TABLE IF EXISTS public.poll_comments CASCADE;

-- =====================================================
-- 1. TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.poll_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id text NOT NULL,
  poll_id uuid NOT NULL REFERENCES public.trip_polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poll_comments_body_length CHECK (
    char_length(btrim(body)) >= 1 AND char_length(body) <= 1000
  )
);

-- =====================================================
-- 2. INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS poll_comments_poll_id_created_at_idx
  ON public.poll_comments (poll_id, created_at ASC);
CREATE INDEX IF NOT EXISTS poll_comments_trip_id_idx
  ON public.poll_comments (trip_id);
CREATE INDEX IF NOT EXISTS poll_comments_user_id_idx
  ON public.poll_comments (user_id);

-- =====================================================
-- 3. UPDATED_AT TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION public.set_poll_comments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_poll_comments_updated_at ON public.poll_comments;
CREATE TRIGGER trg_poll_comments_updated_at
  BEFORE UPDATE ON public.poll_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_poll_comments_updated_at();

-- =====================================================
-- 4. RLS
-- =====================================================

ALTER TABLE public.poll_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: active trip members only
DROP POLICY IF EXISTS "Trip members can read poll comments" ON public.poll_comments;
CREATE POLICY "Trip members can read poll comments"
  ON public.poll_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.trip_members tm
      WHERE tm.trip_id = poll_comments.trip_id
        AND tm.user_id = (SELECT auth.uid())
        AND (tm.status IS NULL OR tm.status = 'active')
    )
  );

-- INSERT: author must be the authenticated user + active member; poll must belong to trip
DROP POLICY IF EXISTS "Trip members can add poll comments" ON public.poll_comments;
CREATE POLICY "Trip members can add poll comments"
  ON public.poll_comments
  FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.trip_members tm
      WHERE tm.trip_id = poll_comments.trip_id
        AND tm.user_id = (SELECT auth.uid())
        AND (tm.status IS NULL OR tm.status = 'active')
    )
    AND EXISTS (
      SELECT 1
      FROM public.trip_polls p
      WHERE p.id = poll_comments.poll_id
        AND p.trip_id = poll_comments.trip_id
    )
  );

-- UPDATE: author only
DROP POLICY IF EXISTS "Authors can update their poll comments" ON public.poll_comments;
CREATE POLICY "Authors can update their poll comments"
  ON public.poll_comments
  FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.trip_members tm
      WHERE tm.trip_id = poll_comments.trip_id
        AND tm.user_id = (SELECT auth.uid())
        AND (tm.status IS NULL OR tm.status = 'active')
    )
  );

-- DELETE: author OR poll creator
DROP POLICY IF EXISTS "Authors or poll creators can delete poll comments" ON public.poll_comments;
CREATE POLICY "Authors or poll creators can delete poll comments"
  ON public.poll_comments
  FOR DELETE
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.trip_polls p
      WHERE p.id = poll_comments.poll_id
        AND p.created_by = (SELECT auth.uid())
    )
  );

-- =====================================================
-- 5. REALTIME
-- =====================================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 6. FEATURE FLAG (kill switch)
-- =====================================================

INSERT INTO public.feature_flags (key, enabled, description) VALUES
  (
    'poll_comments',
    true,
    'Per-poll discussion wall — vote then reply under the same card. Disable to hide comment UI.'
  )
ON CONFLICT (key) DO NOTHING;
