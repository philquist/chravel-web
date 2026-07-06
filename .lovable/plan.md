## Objective
Restore the three core Concierge controls so the circled search, upload, and waveform voice buttons perform real actions instead of appearing inert.

## What Codex got wrong in PR #788
- **It changed the visible controls, not the full behavior.** PR #788 mostly rearranged `AIConciergeChat` header/composer buttons and added shallow tests that only verify elements render/open, not that search results route, files send, or voice connects.
- **Realtime voice was only enabled as a client fallback.** The database feature flag is still seeded as `concierge_realtime_voice = false`, and `useFeatureFlag` correctly lets the DB row override the fallback. Result: the waveform can flash or disappear, and the default `true` does not actually enable production voice.
- **Search excludes chat messages and drops item-level navigation.** `ConciergeSearchModal` does not include `messages`, and `AIConciergeChat` only calls `onTabChange(tab)` while discarding the selected result id/deep-link metadata.
- **Desktop wiring is incomplete.** `TripTabs` mounts `AIConciergeChat` without `onTabChange`, so result clicks from desktop Concierge cannot switch tabs at all.
- **Upload selection has weak feedback.** The header button opens the picker, but unsupported/oversized files have no clear path, and the tests do not prove selected attachments appear or send.
- **Voice runtime contract needs verification.** The hook assumes AI SDK realtime + Gateway behavior; the installed packages expose realtime APIs, but the DB flag and server setup path (`mint-realtime-token`, `realtime-voice-session`, `execute-concierge-tool`) must be tested instead of relying on render-only tests.

## Planned fix

### 1. Search button: make trip-wide search real
**Files likely touched**
- `src/components/ai/ConciergeSearchModal.tsx`
- `src/components/AIConciergeChat.tsx`
- `src/components/TripTabs.tsx`
- narrowly targeted tab/content components only if they already expose stable anchors or focus hooks

**Changes**
- Add `messages` to the Concierge search modal content types so trip chat is searched alongside Concierge, Calendar, Tasks, Polls, Payments, Places/Links, and Media.
- Pass the full selected `UniversalSearchResult` through navigation instead of only `(tab, id)`.
- Wire `TripTabs` to pass `onTabChange` into `AIConciergeChat`, matching the mobile/pro paths.
- On selection:
  - switch to the correct tab (`chat`, `calendar`, `tasks`, `payments`, `places`, `media`, `polls`, `concierge`)
  - preserve target metadata in a lightweight client-side focus event or route state
  - attempt to scroll/highlight a matching DOM anchor after the tab mounts
- Add safe no-op behavior if a tab cannot focus a specific item yet: switch tab reliably and surface no broken state.

**Definition of done**
- Tapping Search opens the modal.
- Searching a known task/calendar/message/payment/place/media term returns grouped results.
- Tapping a result switches to the correct tab on mobile and desktop.
- If an item anchor exists, it scrolls/highlights; otherwise the correct tab opens without breaking.

### 2. Upload button: make file selection visible and sendable
**Files likely touched**
- `src/components/AIConciergeChat.tsx`
- `src/features/chat/components/AiChatInput.tsx` if needed for shared file validation/feedback
- `src/features/concierge/utils/chatHelpers.ts` only if validation constants need centralization

**Changes**
- Keep one hidden file input, but route header selections through the same classification/validation behavior the composer uses.
- Show immediate attachment previews/chips after picking files from the header button.
- Add user-facing errors for unsupported file types and over-limit selections instead of silent no-op.
- Ensure Send is enabled when only attachments are selected.
- Preserve existing Smart Import / Summarize / Q&A attachment intent behavior.

**Definition of done**
- Tapping Upload opens the native picker.
- Selecting a supported image/document displays it in the composer.
- Sending an attachment-only message calls the Concierge stream with attachment payloads.
- Unsupported files produce a clear toast/error and do not silently disappear.

### 3. Waveform voice: fix enablement and connection path
**Files likely touched**
- `src/components/AIConciergeChat.tsx`
- `src/features/concierge/components/RealtimeVoiceButton.tsx`
- `src/features/concierge/hooks/useRealtimeVoice.ts`
- `src/features/concierge/lib/realtimeVoiceClient.ts`
- Supabase migration for the `feature_flags` row if product decision is to launch realtime voice now

**Changes**
- Replace render-only flag fallback assumptions with stable flag handling:
  - use `useFeatureFlagStatus` where the parent needs pending state
  - avoid waveform flash/disappear while the flag query hydrates
  - remove redundant or conflicting child self-gating if the parent owns the flag
- Add/adjust migration to enable `concierge_realtime_voice` if we are shipping realtime voice for users now.
- Verify the full startup chain:
  1. mic permission
  2. `realtime-voice-session` returns trip-aware instructions/tools
  3. `mint-realtime-token` returns a realtime token + websocket URL
  4. AI SDK connects and starts audio capture
  5. tool calls route through `execute-concierge-tool`
- Improve error surfacing for auth/mic/flag/secret/credits/model failures so the button never looks like it did nothing.
- Keep dictation mic as fallback text-entry; do not let dictation and realtime capture fight for the microphone.

**Definition of done**
- Tapping waveform either opens the voice overlay and reaches `Listening`, or shows a specific actionable error.
- No flash/disappear from feature flag hydration.
- Voice session tears down on close/unmount/tab switch.
- Realtime tool calls remain trip-scoped and auth-checked.

### 4. Regression tests
**Add/adjust targeted tests**
- `AIConciergeChat`:
  - search button opens modal and result click calls/switches tab
  - desktop path receives `onTabChange`
  - upload button forwards selected files into attachment preview state
  - waveform button starts `useRealtimeVoice.start(tripId)` when enabled and not usage-limited
- `ConciergeSearchModal`:
  - includes `messages`
  - maps each content type to the intended tab
- `realtimeVoiceClient` / hook:
  - keeps authenticated edge-function headers/query params intact
  - surfaces setup failures clearly

## Verification plan
- Run targeted Vitest for changed Concierge/search/voice tests.
- Run TypeScript check and lint through the normal harness.
- Use Playwright mobile viewport (`440x799`) to manually verify:
  1. search modal opens
  2. query returns list
  3. clicking result switches tabs
  4. upload picker can be triggered and selected files show in composer
  5. waveform opens overlay and either connects or shows exact backend error
- If Supabase auth session is available, smoke-test against a real trip membership; if not, verify public/demo-safe behavior and report what needs authenticated confirmation.

## Non-goals
- No broad Concierge refactor.
- No new analytics dashboard or unrelated pricing copy work.
- No weakening auth/RLS or client-side trust for trip/tool actions.
- No changes to unrelated security scan findings.