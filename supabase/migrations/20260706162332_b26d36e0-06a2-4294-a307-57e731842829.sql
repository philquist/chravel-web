UPDATE public.feature_flags
SET enabled = true,
    updated_at = now()
WHERE key = 'concierge_realtime_voice';

INSERT INTO public.feature_flags (key, enabled, description)
SELECT
  'concierge_realtime_voice',
  true,
  'Bidirectional realtime voice concierge (OpenAI Realtime via Vercel AI Gateway)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags WHERE key = 'concierge_realtime_voice'
);