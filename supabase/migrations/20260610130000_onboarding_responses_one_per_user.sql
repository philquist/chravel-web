-- One onboarding survey response per user.
--
-- The Trip Chaos Diagnostic auto-submits on reaching the result step; a user who
-- exits at the result screen and retakes the survey previously inserted a second
-- row. Enforce the documented "one row per completed survey" invariant: dedupe
-- (keeping each user's most recent response), add a unique index, and let owners
-- update their own row so the client upsert (ON CONFLICT (user_id) DO UPDATE)
-- passes RLS on retakes.

-- 1) Dedupe: keep each user's most recent response (id as deterministic tiebreak).
DELETE FROM public.onboarding_responses o
USING public.onboarding_responses newer
WHERE o.user_id = newer.user_id
  AND (newer.created_at, newer.id) > (o.created_at, o.id);

-- 2) Enforce uniqueness going forward; the unique index supersedes the plain one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_responses_user
  ON public.onboarding_responses (user_id);

DROP INDEX IF EXISTS public.idx_onboarding_responses_user;

-- 3) Owners may update their own row (required for the client-side upsert).
DROP POLICY IF EXISTS "Users update own onboarding responses" ON public.onboarding_responses;
CREATE POLICY "Users update own onboarding responses"
  ON public.onboarding_responses
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
