INSERT INTO public.feature_flags (key, enabled, rollout_percentage, description)
VALUES (
  'gmail_smart_import',
  false,
  0,
  'Gmail Smart Import (per-user OAuth). Disabled until Google CASA Tier 2 verification is complete and test users are added in Google Cloud Console.'
)
ON CONFLICT (key) DO NOTHING;