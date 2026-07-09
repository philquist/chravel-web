-- Revoke column-level SELECT on sensitive external payment provider IDs
-- for browser roles. Service role bypasses grants and can still read them
-- from stripe-webhook and other server-side code.

REVOKE SELECT (stripe_customer_id, stripe_subscription_id)
  ON public.organization_billing FROM anon, authenticated;

REVOKE SELECT (provider_subscription_id, external_customer_id)
  ON public.organization_subscription_links FROM anon, authenticated;