# Concierge Read-Aloud TTS (Current)

> **Canonical doc for per-reply speaker / narrate-aloud.**  
> Last verified: 2026-07-13 against `main` + ChravelApp deployed edge functions.

This is **not** bidirectional conversational voice. Read-aloud is one-way TTS of an
assistant message when the user taps the speaker button. Dictation (waveform → Web
Speech) and realtime voice (`concierge_realtime_voice`) are separate paths.

---

## Status (production)

| Item | Value |
|------|--------|
| **Client entry** | Subtle `Volume2` speaker on each assistant reply (`TTSSpeakerButton`) |
| **Edge function** | `concierge-voice-tts` (deployed on ChravelApp) |
| **Provider** | Lovable AI Gateway → `openai/gpt-4o-mini-tts` |
| **Gateway URL** | `https://ai.gateway.lovable.dev/v1/audio/speech` |
| **Secret** | `LOVABLE_API_KEY` (Supabase Edge Function secret; never client-exposed) |
| **Auth** | User JWT via `requireAuth` + `Authorization: Bearer` from the SPA |
| **Default voice** | `coral` |
| **Voice catalog** | 10 OpenAI voices (see below) |
| **Feature flag** | None for read-aloud. Always on when authenticated. Do **not** gate on `concierge_realtime_voice` or stale `VITE_CONCIERGE_TTS_ENABLED`. |

Legacy functions (`google-tts`, `concierge-tts`, `gemini-tts`, `elevenlabs-tts`) may still
exist in the project for historical/rollback reasons. **The live SPA does not call them**
for Concierge read-aloud.

---

## End-to-end path

```
Assistant bubble (MessageRenderer)
  └─ TTSSpeakerButton  (aria-label: "Listen to response")
       └─ AIConciergeChat.handleTTSPlay
            └─ buildSpeechText(...)          # URL-aware spoken transcript
                 └─ useConciergeReadAloud.play
                      └─ POST /functions/v1/concierge-voice-tts
                           └─ Lovable AI Gateway audio/speech
                                └─ MP3 blob and/or SSE PCM stream → <audio> / WebAudio
```

### Key files

| Role | Path |
|------|------|
| Speaker UI | `src/features/chat/components/TTSSpeakerButton.tsx` |
| Message wiring | `src/features/chat/components/MessageRenderer.tsx` |
| Chat → TTS handlers | `src/components/AIConciergeChat.tsx` |
| Playback hook | `src/hooks/useConciergeReadAloud.ts` |
| Streaming helper | `src/features/concierge/lib/streamConciergeTts.ts` |
| Spoken transcript | `src/lib/buildSpeechText.ts` |
| Voice preference | `src/features/concierge/hooks/useConciergeVoicePreference.ts` |
| Settings picker | `src/features/concierge/components/ConciergeVoicePicker.tsx` |
| Edge proxy | `supabase/functions/concierge-voice-tts/index.ts` |
| Preview contract | `docs/CONCIERGE_VOICE_PREVIEW_BEHAVIOR.md` |

Settings surface: consumer AI Concierge section embeds `ConciergeVoicePicker`
(`src/components/consumer/ConsumerAIConciergeSection.tsx`).

---

## Voices (settings ↔ server)

Client catalog (`CONCIERGE_VOICES`) and server allowlist (`VOICES` in
`concierge-voice-tts`) must stay identical:

`coral` · `alloy` · `sage` · `ash` · `ballad` · `echo` · `shimmer` · `verse` · `marin` · `cedar`

| Plan | Behavior |
|------|----------|
| Free | Forced to `coral` (default). Picker shows other voices locked. |
| Paid | Any of the 10; persisted to `localStorage` + `profiles.concierge_voice` |

Unknown / invalid voice IDs fall back to `coral`; response header `x-voice-fallback: true`
signals that happened.

Realtime voice (`realtime-voice-session`) mirrors this same OpenAI voice catalog when
that experimental path is enabled — keep catalogs in sync if you add/remove a voice.

---

## Speech text rules (`buildSpeechText`)

Before audio is requested, the display markdown is converted to a speakable transcript:

1. **Markdown links** `[label](url)` → speak **label** only (never the href).
2. **Bare `https://…` / `www.…` URLs** → speak `a link to {domain}` (e.g. `booking.com`).
3. **Images / code / bold / lists** → stripped or simplified.
4. **Hotel / place / flight cards** → short spoken summaries (cap 3 cards) + “Tap Save to Trip…”.
5. **Hard cap** ~1200 characters, truncated on a sentence boundary.
6. **Edge function** also normalizes “Chravel” → “Travel” for pronunciation only (visual brand unchanged).

Regression tests: `src/lib/__tests__/buildSpeechText.test.ts`,
`src/features/chat/components/__tests__/MessageRenderer.tts.test.tsx`.

---

## Request contract (`concierge-voice-tts`)

```http
POST /functions/v1/concierge-voice-tts
Authorization: Bearer <user-jwt>
apikey: <anon-key>
Content-Type: application/json

{
  "text": "Spoken transcript…",
  "voice": "coral",
  "format": "mp3",
  "stream": false,
  "tripId": "<optional>",
  "messageId": "<optional>"
}
```

| Mode | Body | Response |
|------|------|----------|
| Default (blob) | `format: "mp3"` (default) | `audio/mpeg` bytes |
| Streaming first chunk | `stream: true` | SSE PCM (`x-tts-stream: sse-pcm-24000`) |

Errors of note: `402` credits exhausted, `429` rate limit, `403`/`404` gateway not enabled,
`401` missing/invalid auth.

---

## Secrets & ops

```bash
# Required for read-aloud
supabase secrets set LOVABLE_API_KEY=... --project-ref jmjiyekmxwsxkfnqwyaa

# Deploy / redeploy
supabase functions deploy concierge-voice-tts --project-ref jmjiyekmxwsxkfnqwyaa
```

`AI_GATEWAY_API_KEY` is used by **realtime** mint (`mint-realtime-token` → Vercel AI
Gateway). It is **not** the secret for per-reply read-aloud.

Smoke invoke (replace tokens):

```bash
curl -i -X POST \
  "https://jmjiyekmxwsxkfnqwyaa.supabase.co/functions/v1/concierge-voice-tts" \
  -H "Authorization: Bearer <user-jwt>" \
  -H "apikey: <anon-key>" \
  -H "Content-Type: application/json" \
  --data '{"text":"Hello from your trip concierge.","voice":"coral","format":"mp3"}' \
  --output /tmp/concierge-tts.mp3
```

Expect `200`, `Content-Type: audio/mpeg`, and a playable file.

---

## How this differs from other “voice” features

| Feature | What it does | Gate / stack |
|---------|----------------|--------------|
| **Read-aloud (this doc)** | Narrate one assistant reply | Always available when signed in; Lovable Gateway TTS |
| **Waveform dictation** | Speech → text into composer | Web Speech API; App Store default |
| **Realtime bidirectional** | Full duplex conversation | `concierge_realtime_voice` (default OFF); Vercel AI Gateway + `AI_GATEWAY_API_KEY` |

See also: `docs/voice-product-path.md`, `docs/CONCIERGE_VOICE_PREVIEW_BEHAVIOR.md`.

---

## Historical providers (do not use for new work)

Earlier iterations shipped or drafted these paths. They are **not** the live Concierge
read-aloud route as of 2026-07:

| Era | Function / flag | Provider | Notes |
|-----|-----------------|----------|-------|
| Early | `elevenlabs-tts` / `google-tts` | ElevenLabs → Google Cloud TTS (`GOOGLE_CLOUD_TTS_API_KEY`) | Superseded |
| Mid | `concierge-tts` | Google Cloud / Vertex-adjacent | Superseded |
| Draft migration | `gemini-tts` + `VITE_CONCIERGE_TTS_ENABLED` | Gemini 3.1 Flash TTS Preview (`GEMINI_API_KEY`) | Doc previously claimed this was current; **client no longer routes here** |

If you find `VITE_CONCIERGE_TTS_ENABLED` in an old runbook, ignore it — that flag is not
part of the current SPA TTS path.

Archived stub of the previous migration note:
[`GOOGLE_CLOUD_TTS_MIGRATION.md`](./GOOGLE_CLOUD_TTS_MIGRATION.md).
