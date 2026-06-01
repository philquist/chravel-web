-- Align billing reconciliation view with live schema: billing identifiers live on profiles,
-- not the abandoned private_profiles table. Safe CREATE OR REPLACE — no data mutation.

CREATE OR REPLACE VIEW public.billing_entitlement_reconciliation_candidates AS
SELECT
  ue.user_id,
  ue.purchase_type,
  ue.plan,
  ue.status,
  ue.current_period_end,
  p.stripe_customer_id,
  p.stripe_subscription_id
FROM public.user_entitlements ue
LEFT JOIN public.profiles p ON p.user_id = ue.user_id
WHERE ue.source = 'stripe'
  AND ue.purchase_type = 'subscription'
  AND (
    (
      ue.status IN ('active', 'trialing', 'past_due', 'canceled')
      AND ue.current_period_end IS NOT NULL
      AND ue.current_period_end < now()
    )
    OR p.stripe_customer_id IS NULL
  );
