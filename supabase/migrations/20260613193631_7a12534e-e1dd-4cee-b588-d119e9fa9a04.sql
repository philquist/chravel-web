DROP POLICY IF EXISTS "Block direct client SELECT on gmail_accounts" ON public.gmail_accounts;
CREATE POLICY "Block direct client SELECT on gmail_accounts"
ON public.gmail_accounts
FOR SELECT
TO authenticated, anon
USING (false);