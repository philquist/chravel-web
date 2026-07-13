
-- Lock down app_settings: no client reads (service role only)
DROP POLICY IF EXISTS "Authenticated users can read app_settings" ON public.app_settings;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.app_settings FROM anon, authenticated;

-- Lock down rate_limits SELECT: remove fragile LIKE pattern policy.
-- No client code reads this table; keep service-role-only management policies.
DROP POLICY IF EXISTS "Users can view own rate limits" ON public.rate_limits;
REVOKE SELECT ON public.rate_limits FROM anon, authenticated;
