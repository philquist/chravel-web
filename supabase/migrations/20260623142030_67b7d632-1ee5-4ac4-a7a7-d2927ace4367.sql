INSERT INTO public.feature_flags (key, enabled, rollout_percentage, description)
VALUES (
  'concierge_conversation_mode',
  true,
  100,
  'Hands-free voice loop in the AI Concierge tab (mic + STT + reply + TTS + mic).'
)
ON CONFLICT (key) DO NOTHING;