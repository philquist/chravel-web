
## Goal
Concierge replies in whatever language the user wrote/spoke in — no UI, no settings, no allowlist. Mid-conversation language switches are followed each turn. Quoted trip content (chat, calendar titles, places) stays verbatim; the surrounding explanation is in the user's language.

## Changes

### 1. Text mode — `supabase/functions/lovable-concierge/`
- In the system prompt builder (shared concierge prompt module), append a small language directive:
  - "Detect the language of the user's most recent message and reply in that same language. If the user switches languages, switch with them on the next reply."
  - "When quoting existing trip content (chat messages, calendar entries, place names, links, names of people), quote it verbatim in its original language. Translate only your own explanation, never the quoted content."
  - "Preserve proper nouns, brand names, addresses, URLs, and numeric values (dates, times, prices, currencies) unchanged."
- No model change, no extra round-trip. Gemini 3 Flash already handles 100+ languages.

### 2. Voice mode — Vertex Live session config
Files to touch (verify exact names during build):
- `src/features/concierge/hooks/useConciergeVoice.ts` (and/or the edge function that mints the Live session token / sets session config)
- Any shared `liveSessionConfig` / system-instruction module used by the voice path

Edits:
- **Remove hardcoded STT `languageCode`** (e.g. `"en-US"`) from the Live session config so Gemini Live auto-detects spoken language per utterance. If a value is required by the SDK, pass the multi-language form the Live API accepts rather than a single locale.
- **Add the same language directive** to the voice session's system instruction so the model's spoken reply matches the detected input language each turn.
- Native-audio voice on `gemini-live-2.5-flash-native-audio` is already multilingual — no voice swap needed.

### 3. Verification
- Text: send messages in EN, ES, FR, JA, AR to a test trip; confirm reply language matches each; confirm a quoted chat message stays in its original language while the explanation switches.
- Voice: in a single session, speak EN → switch to ES → switch back; confirm transcription and spoken reply follow each turn.
- Regression: existing English-only flows behave identically (auto-detect resolves to English).
- Run `npm run lint && npm run typecheck && npm run build`.

## Out of scope (deliberate)
- No settings UI, no per-user language preference, no language allowlist.
- No translation of stored trip data.
- No change to TTS voice selection or to the text model.

## Risk
Low. Worst case is the model occasionally over-corrects on a short ambiguous message (e.g. one-word "ok") — acceptable and self-correcting on the next turn. If a hardcoded STT locale exists and we miss it, voice will keep transcribing as English; mitigated by grepping the voice config files during implementation.

## Rollback
Single revert of the prompt + session-config commit.
