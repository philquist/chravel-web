# Concierge Voice Product Path

Current Phase 1 decision: **dictation-only**.

The shipped Concierge voice UI uses browser Web Speech dictation through `useConciergeVoice` and `useWebSpeechVoice`. Realtime conversational voice paths (`livekit-token` and `create-openai-realtime-session`) remain in the repository for investigation, but they fail closed unless the `realtime_voice` feature flag is enabled in `public.feature_flags`.

Before enabling realtime voice:

- Route all agent write tools through the canonical Concierge executor.
- Add payload-shape parity tests for `addToCalendar`, `createTask`, and every mutating tool.
- Verify room/session lifecycle cleanup on unmount and reconnect.
- Run an end-to-end voice smoke test against a real trip membership.

