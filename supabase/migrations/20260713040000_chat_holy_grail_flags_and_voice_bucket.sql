-- Chat Holy Grail kill switches + dedicated voice-note storage
-- Plan: .lovable/plan.md — chat_reactions_v2 / chat_swipe_reply / chat_media_mosaic / chat_voice_notes
-- Kill any phase in <60s:
--   UPDATE public.feature_flags SET enabled = false WHERE key = 'chat_voice_notes';

-- =====================================================
-- 1. Feature flags (seeded ON — presentation polish is live)
-- =====================================================
INSERT INTO public.feature_flags (key, enabled, description) VALUES
  ('chat_reactions_v2', true, 'iMessage-style Tapback reaction bar + corner reaction chips'),
  ('chat_swipe_reply', true, 'Swipe-to-reply gesture on chat bubbles'),
  ('chat_media_mosaic', true, 'Multi-image mosaic grid (1/2/3/4-up) in chat bubbles'),
  ('chat_voice_notes', true, 'Hold-to-record voice notes + in-bubble waveform player'),
  ('voice_note_transcripts', false, 'Optional server-side voice-note transcription (disabled until edge pipeline ships)')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description;
  -- Do NOT overwrite enabled on conflict — preserve operator kill-switch state.

-- =====================================================
-- 2. trip-voice-notes bucket (mirrors trip-media membership RLS)
-- Path: {tripId}/{userId}/{uuid}.{ext}
-- =====================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trip-voice-notes',
  'trip-voice-notes',
  false,
  26214400, -- 25MB (5-min voice notes with headroom)
  ARRAY[
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/x-m4a',
    'audio/aac',
    'audio/opus'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Trip members can view voice notes" ON storage.objects;
CREATE POLICY "Trip members can view voice notes"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'trip-voice-notes'
  AND EXISTS (
    SELECT 1 FROM public.trip_members tm
    WHERE tm.trip_id::text = (storage.foldername(name))[1]
      AND tm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Trip members can upload voice notes" ON storage.objects;
CREATE POLICY "Trip members can upload voice notes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trip-voice-notes'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.trip_members tm
    WHERE tm.trip_id::text = (storage.foldername(name))[1]
      AND tm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update own voice notes" ON storage.objects;
CREATE POLICY "Users can update own voice notes"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'trip-voice-notes'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete own voice notes" ON storage.objects;
CREATE POLICY "Users can delete own voice notes"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'trip-voice-notes'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
