-- App Store launch: hide hands-free Conversation Mode while waveform dictation is the
-- default mic path and bidirectional realtime voice stays experimental/off.
-- Settings toggle + useConciergeConversationMode honor this flag; re-enable only for
-- deliberate internal testing.
--
-- Regression check: feature_flags row only — no trips/auth/RLS/payments touched.
UPDATE public.feature_flags
SET enabled = false,
    description = 'EXPERIMENTAL — Hands-free Concierge loop (mic + STT + reply + TTS + mic). App Store path uses waveform dictation + per-reply speaker TTS; keep disabled unless deliberately testing conversation mode.',
    updated_at = now()
WHERE key = 'concierge_conversation_mode';

INSERT INTO public.feature_flags (key, enabled, description)
SELECT
  'concierge_conversation_mode',
  false,
  'EXPERIMENTAL — Hands-free Concierge loop (mic + STT + reply + TTS + mic). App Store path uses waveform dictation + per-reply speaker TTS; keep disabled unless deliberately testing conversation mode.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags WHERE key = 'concierge_conversation_mode'
);
