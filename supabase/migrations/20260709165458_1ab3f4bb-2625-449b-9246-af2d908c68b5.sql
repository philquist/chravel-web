
-- 1. app_settings: remove anon read access
DROP POLICY IF EXISTS "Anon users can read app_settings" ON public.app_settings;
REVOKE SELECT ON public.app_settings FROM anon;

-- 2. organization_billing: revoke column-level SELECT on Stripe IDs from client roles
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.organization_billing FROM anon, authenticated;
-- Ensure service_role retains full access
GRANT ALL ON public.organization_billing TO service_role;

-- 3. organization_subscription_links: revoke column-level SELECT on provider IDs
REVOKE SELECT (provider_subscription_id, external_customer_id) ON public.organization_subscription_links FROM anon, authenticated;
GRANT ALL ON public.organization_subscription_links TO service_role;
