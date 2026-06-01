-- Harden Stripe webhook customer→user lookup: one profile per Stripe customer id.
-- Verified no duplicate non-null stripe_customer_id values before adding (2026-05-31 audit).

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id_unique
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
