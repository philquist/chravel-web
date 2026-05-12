-- Create gmail_accounts_safe: a security-invoker view over gmail_accounts that
-- excludes the access_token / refresh_token columns from frontend reads.
-- RLS on the underlying gmail_accounts table still filters by auth.uid() so the
-- view inherits row scoping. The view renames last_sync_at -> last_synced_at to
-- match the column name expected by src/features/smart-import/api/gmailAuth.ts.

CREATE OR REPLACE VIEW public.gmail_accounts_safe
WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  email,
  token_expires_at,
  last_sync_at AS last_synced_at,
  is_active,
  scopes,
  created_at,
  updated_at
FROM public.gmail_accounts;

GRANT SELECT ON public.gmail_accounts_safe TO authenticated;
