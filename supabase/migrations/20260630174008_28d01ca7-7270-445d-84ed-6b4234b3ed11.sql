INSERT INTO public.feature_flags (key, enabled, description) VALUES
  ('concierge_realtime_voice', false, 'Bidirectional realtime voice concierge (OpenAI Realtime via Vercel AI Gateway)')
ON CONFLICT (key) DO NOTHING;