# Concierge TTS: Lovable Voices + Fix Speaker Button + Settings Picker

## Why nothing happened when you tapped the speaker

The current speaker button calls `supabase/functions/gemini-tts` (Google Gemini's 8-voice TTS — `Charon`, `Puck`, etc.), not the OpenAI/Lovable voice set. Edge-function logs for both `gemini-tts` and `concierge-tts` show **no recent invocations**, meaning the request is either failing before it leaves the client or 500-ing silently because `GEMINI_TTS_API_KEY` isn't set in this environment. Either way: the "Google voices" path is not the right thing to ship — Lovable AI Gateway already provides 10 OpenAI voices (`alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`, `cedar`) with `LOVABLE_API_KEY` (already provisioned, same key used by `concierge-stt`). One pipeline, no extra secrets, paid voices for everyone on a paid plan.

## Recommended default voice

**coral** — warm, conversational, female-presenting; best fit for the "premium travel concierge" tone. Good runner-ups: `sage` (calm/neutral), `alloy` (balanced/androgynous). Going with **coral as the default**.

## Scope

1. **New edge function** `supabase/functions/concierge-voice-tts/index.ts`
   - Auth-gated (`requireAuth`), CORS via `_shared/cors.ts`.
   - Body: `{ text: string, voice?: string, format?: 'mp3' }` (default `voice = 'coral'`, `format = 'mp3'`).
   - Validates `voice` against the 10-voice allowlist; falls back to `coral` on unknown.
   - Caps `text` at 4000 chars; rejects empty.
   - Calls `POST https://ai.gateway.lovable.dev/v1/audio/speech` with `model: 'openai/gpt-4o-mini-tts'`, `response_format: 'mp3'`, **non-streaming** (single buffered MP3 — matches existing `<Audio>`/`blob` playback in `useConciergeReadAloud`).
   - Surfaces 402/429/403 from Gateway as JSON errors (`{ error, code }`); returns MP3 bytes with `Content-Type: audio/mpeg` on success.
   - Adds `x-voice` response header with the resolved voice for debugging.

2. **Edit `src/hooks/useConciergeReadAloud.ts`**
   - Repoint `TTS_URL` to the new `concierge-voice-tts` function. Drop `VITE_CONCIERGE_TTS_ENABLED` branching and the legacy `concierge-tts`/`gemini-tts` payload shapes.
   - Read the user's chosen voice from a new `useConciergeVoicePreference` hook (below); fall back to `'coral'`.
   - Keep the sentence-chunking + parallel pre-fetch logic exactly as-is (preserves fast time-to-voice).
   - Keep `usedFallbackVoice` plumbing but drive it off the `x-voice` header diff (selected vs returned).

3. **New hook `src/features/concierge/hooks/useConciergeVoicePreference.ts`**
   - Reads/writes `concierge_voice` from `localStorage` (per-device, no DB migration needed for MVP).
   - Exposes `{ voice, setVoice, isPaid }` — `isPaid` from existing subscription/entitlement selector (reuse whichever hook the rest of settings uses; will confirm during build).
   - Free users: forced to `coral`; `setVoice` is a no-op and the picker is disabled.

4. **New component `src/features/concierge/components/ConciergeVoicePicker.tsx`**
   - 10-option radio list with short descriptors (e.g. "Coral — warm, conversational"), preview button per voice that POSTs a short sample ("Hi, I'm your Chravel concierge.") through `concierge-voice-tts` and plays it.
   - Disabled state for free users with an upsell line ("Upgrade to choose a voice.").
   - Saves on selection; toasts "Voice updated."

5. **Wire picker into existing Concierge settings**
   - Add a "Voice" section to whichever concierge settings surface already exists (will locate during build — likely under `src/features/concierge/` or `src/pages/Settings*`); no new route.

## Out of scope (deferred, captured here)

- Server-side persistence of voice pref (DB column on `profiles`) — `localStorage` is fine for MVP; will add a migration once we need cross-device sync.
- Streaming/SSE TTS (lower TTFB) — current chunked-sentence + parallel fetch already delivers good TTFB; SSE PCM is a future perf pass.
- Removing/retiring `gemini-tts` and `concierge-tts` edge functions — leave them deployed but unused for one release in case of rollback; delete next cycle.

## Validation

- `npm run lint:check && npm run typecheck && npm run build`
- Manual: tap speaker on a concierge message → audio plays in coral voice. Open Concierge settings on a paid account → switch to `sage` → tap speaker again → voice changes. Free account → picker disabled, locked to coral.
- Edge function logs show `concierge-voice-tts` invocations with 200s.
- No `LOVABLE_API_KEY` in client bundle (grep build output).

## Rollback

Revert the `TTS_URL` change in `useConciergeReadAloud.ts` (one line) and the new function/component are dormant. No DB changes.
