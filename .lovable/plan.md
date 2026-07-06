# Fix Concierge Voice + Verify Search Deep-Links + Smoke Test

Based on trace analysis, the three Concierge controls fail *silently* for distinct reasons. This plan makes each one either work or explain why, then verifies end-to-end against a real trip.

## 1. Waveform (Realtime Voice) — make it start reliably with clear states

**File:** `src/features/concierge/components/RealtimeVoiceButton.tsx`

- Remove the internal `useFeatureFlag('concierge_realtime_voice')` re-check and the `if (!enabled) return null` — the parent (`AIConciergeChat.tsx:710`) already gates rendering, and the double-check causes hydration flicker + unmount races.
- Stop passing `disabled={usage.isLimitReached}` straight to the `<button>` element (that swallows the click with no feedback). Instead:
  - `handleStart`: if `disabled` → `toast.error('Voice unavailable — upgrade to get more asks.')` and return.
  - Only apply `disabled` on the DOM element when `voice.isActive` (session already live).
- While `voice.phase === 'connecting'` show a spinner in place of the waveform icon; when `voice.phase === 'error'` show error color + tooltip with `voice.errorMessage`.
- Wrap `voice.start(tripId)` so any rejection surfaces as a toast (`useRealtimeVoice.start` already sets `errorMessage`, but a toast guarantees visibility even if the overlay is dismissed).

**File:** `src/features/concierge/hooks/useRealtimeVoice.ts` (defensive only)

- Guard `navigator.mediaDevices` before calling `getUserMedia` and throw a legible error ("Your browser does not expose the microphone. Try Safari/Chrome over HTTPS.") — currently throws an opaque `TypeError`.

## 2. Search + Upload — remove the overlay/gesture traps

**File:** `src/components/AIConciergeChat.tsx`

- Header Search and Upload buttons: add `disabled={realtimeVoiceEnabled && voice.isActive}` so DOM state matches the visual overlay (currently they look clickable but sit under `z-[120]` overlay).
- Hidden file input at ~L397: change `className="hidden"` → `className="sr-only"` + `tabIndex={-1}`. iOS Safari/WKWebView silently ignores programmatic `.click()` on `display:none` inputs — this is why upload does nothing on iPhone.

## 3. Verify Search Deep-Link on Mobile + Desktop

- Confirm `TripTabs` passes `onTabChange` to `AIConciergeChat` on both layouts (already wired at `TripTabs.tsx:274`).
- Confirm `ConciergeSearchModal` result `onSelect` → `AIConciergeChat` handler at L486 calls `onTabChange(tab)` then scrolls to `metadata.anchor` (L79–93). Add smoke assertions for `tasks`, `messages`, `calendar`, `basecamp`, `places`.
- No code change expected unless smoke test finds a gap; if the mobile drawer variant of `TripTabs` swallows the tab-change, wire it there too.

## 4. Authenticated Realtime Voice Smoke Test

Drive Playwright against `http://localhost:8080` using the injected Supabase session (per `browser-use`):

```text
1. Restore Supabase session → navigate to a real Consumer trip URL for a membership the injected user has.
2. Open Concierge chat → click waveform button.
3. Grant fake mic permissions via `context.grant_permissions(['microphone'], origin='http://localhost:8080')`.
4. Assert:
   - RealtimeVoiceOverlay mounts with phase 'connecting' → 'listening' within 8s
   - Network log shows POST /functions/v1/realtime-voice-session → 200
   - Network log shows POST /functions/v1/mint-realtime-token → 200
   - No console errors from '@ai-sdk/react'
5. Trigger a tool intent (screenshot only — no need to speak) then `voice.stop()`; confirm overlay unmounts and mic tracks are released.
6. Pull Supabase edge logs for `realtime-voice-session`, `mint-realtime-token`, `execute-concierge-tool` — attach any 4xx/5xx to the report.
```

If `LOVABLE_BROWSER_AUTH_STATUS !== 'injected'`, stop the smoke and tell the user to sign in via the preview so the session injects on the next turn (per browser-use rules).

## 5. Verification checklist before closing

- Waveform button: disabled state shows toast; connecting shows spinner; error shows tooltip; success shows overlay.
- Upload: file picker opens on iOS Safari (verified via `sr-only` change).
- Search: opens modal, results render, clicking each result deep-links to correct tab + scrolls to anchor on desktop and mobile.
- Edge logs: `realtime-voice-session` / `mint-realtime-token` / `execute-concierge-tool` return 200 for the smoke session, no 4xx.
- `npm run lint && npm run typecheck` pass.

## Files to edit

1. `src/features/concierge/components/RealtimeVoiceButton.tsx` — remove double flag check, convert `disabled` to toast guard, add connecting/error states.
2. `src/features/concierge/hooks/useRealtimeVoice.ts` — guard `navigator.mediaDevices`.
3. `src/components/AIConciergeChat.tsx` — disable header buttons when voice overlay active; change hidden file input to `sr-only`.
4. (Test) `src/components/__tests__/AIConciergeChat.test.tsx` — add cases for toast on limit-reached voice tap and sr-only upload input.

## Out of scope

- Refactoring `useRealtimeVoice` reconnect logic (already bounded + tested).
- Server-side changes to `mint-realtime-token` / `realtime-voice-session` — smoke test will surface if any are actually needed.
