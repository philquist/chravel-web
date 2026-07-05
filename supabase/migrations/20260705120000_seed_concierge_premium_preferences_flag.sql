-- Seed the kill switch for premium AI Concierge preference grounding.
--
-- Grounding the Concierge in a user's saved preferences (dietary, vibe, budget,
-- accessibility, etc.) is a premium-only capability, enforced server-side in the
-- lovable-concierge edge function (gated on the server-verified isPaidUser flag).
--
-- Starts ENABLED. This is a kill switch: if preference grounding ever needs to be
-- turned off globally (e.g. a bad prompt-injection interaction or a cost spike), flip
-- it off and it takes effect within ~60s with no redeploy:
--   UPDATE public.feature_flags SET enabled = false WHERE key = 'concierge_premium_preferences';
-- While disabled, no user (free or premium) gets preference grounding; the Concierge
-- still answers normally.

INSERT INTO public.feature_flags (key, enabled, description) VALUES
  ('concierge_premium_preferences', true, 'Premium AI Concierge preference grounding (dietary/vibe/budget/accessibility applied to answers for paid users)')
ON CONFLICT (key) DO NOTHING;
