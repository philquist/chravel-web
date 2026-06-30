-- Seed the kill switch for bidirectional realtime voice (OpenAI Realtime via Vercel AI Gateway).
--
-- Dark-launched: starts DISABLED. Realtime voice depends on Vercel project secrets
-- (AI_GATEWAY_API_KEY, SUPABASE_ANON_KEY) being configured for the /api/realtime-token
-- function. Once those are set, flip this on (takes effect within ~60s, no redeploy):
--   UPDATE public.feature_flags SET enabled = true WHERE key = 'concierge_realtime_voice';

INSERT INTO public.feature_flags (key, enabled, description) VALUES
  ('concierge_realtime_voice', false, 'Bidirectional realtime voice concierge (OpenAI Realtime via Vercel AI Gateway)')
ON CONFLICT (key) DO NOTHING;
