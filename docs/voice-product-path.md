# Concierge Voice Product Path

Current Phase 1 decision for **composer input**: **dictation-only** (waveform → Web Speech).

## Three distinct voice surfaces

| Surface | User action | Stack | Gate |
|---------|-------------|-------|------|
| **Read-aloud** | Tap speaker on an assistant reply | `TTSSpeakerButton` → `useConciergeReadAloud` → `concierge-voice-tts` → Lovable AI Gateway (`openai/gpt-4o-mini-tts`) | Always on when signed in. Voices from Settings (10 OpenAI voices; default `coral`). |
| **Dictation** | Tap waveform / mic in composer | `useConciergeVoice` → `useWebSpeechVoice` | App Store default input path |
| **Realtime bidirectional** | Experimental full-duplex conversation | `mint-realtime-token` / `realtime-voice-session` (+ legacy LiveKit paths in repo) | Fail-closed unless `concierge_realtime_voice` (aka `realtime_voice`) is enabled in `public.feature_flags` |

Canonical read-aloud docs: [`docs/ACTIVE/CONCIERGE_READ_ALOUD_TTS.md`](ACTIVE/CONCIERGE_READ_ALOUD_TTS.md).  
Preview-vs-save contract: [`docs/CONCIERGE_VOICE_PREVIEW_BEHAVIOR.md`](CONCIERGE_VOICE_PREVIEW_BEHAVIOR.md).

## Dictation (shipped input)

The shipped Concierge voice **input** UI uses browser Web Speech dictation through
`useConciergeVoice` and `useWebSpeechVoice`. Realtime conversational voice paths
(`livekit-token`, `create-openai-realtime-session`, gateway realtime) remain in the
repository for investigation, but they fail closed unless the realtime feature flag
is enabled.

Before enabling realtime voice:

- Route all agent write tools through the canonical Concierge executor.
- Add payload-shape parity tests for `addToCalendar`, `createTask`, and every mutating tool.
- Verify room/session lifecycle cleanup on unmount and reconnect.
- Run an end-to-end voice smoke test against a real trip membership.
- Confirm CSP allows the AI Gateway hosts used by the chosen realtime path
  (`docs/CONCIERGE_CONTROLS_RECOVERY_2026-07-11.md`).
