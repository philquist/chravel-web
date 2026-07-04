# Realtime Voice Concierge — Verification Plan (read-only)

Goal: confirm the bidirectional realtime voice concierge works on desktop and mobile, is powered by **OpenAI Realtime via the Vercel AI Gateway**, is cleanly isolated from the **Lovable AI Gateway** (which stays on text concierge + one-way TTS), and that voice selection matches the voices Lovable's TTS exposes. No file will be modified, deleted, or "hardened".

Protected — read-only:
- `supabase/functions/{mint-realtime-token,realtime-voice-session,execute-concierge-tool}/`
- `src/features/concierge/hooks/useRealtimeVoice.ts`
- `src/features/concierge/lib/realtimeVoiceClient.ts`
- `src/features/concierge/components/RealtimeVoice*.tsx`
- `src/utils/serviceWorkerRegistration.ts`, `public/sw.js`
- `feature_flags` row `concierge_realtime_voice` and its RLS

## 1. Gateway isolation audit (static read)
Confirm the two gateways never cross:
- `mint-realtime-token` uses only `AI_GATEWAY_API_KEY` (Vercel) and points at the OpenAI Realtime WS URL; no `LOVABLE_API_KEY` reference.
- `realtime-voice-session` builds instructions/tools only; does not mint tokens or call Lovable gateway.
- `lovable-concierge` and `concierge-voice-tts` continue to reference `LOVABLE_API_KEY` and do NOT reference `AI_GATEWAY_API_KEY` or OpenAI Realtime.
- `realtimeVoiceClient.ts` hits only `mint-realtime-token`, `realtime-voice-session`, `execute-concierge-tool` — no Lovable endpoints.
- ESLint/`no-restricted-imports` still blocks cross-wiring.

Deliverable: a short "isolation matrix" table (function → secret → upstream host).

## 2. Secret + flag preflight (no writes)
- `fetch_secrets` to confirm `AI_GATEWAY_API_KEY` present (Vercel) AND `LOVABLE_API_KEY` present (Lovable). Report missing without adding.
- Read `public.feature_flags` for `concierge_realtime_voice` (enabled? scope?).
- Confirm RLS on `feature_flags` unchanged.

## 3. Voice parity check (Vercel Realtime ↔ Lovable TTS)
- Enumerate voices exposed by `concierge-voice-tts` (Lovable) from source.
- Enumerate voices allowed in `realtime-voice-session` response / `RealtimeSessionConfigResponse.voice`.
- Produce a parity table. If any Lovable TTS voice is not selectable in the realtime session config, flag as a gap (do not fix).

## 4. Runtime edge-function probes (safe GETs/POSTs as preview user)
- `curl_edge_functions` → `realtime-voice-session` with a real `tripId` from the preview session: expect `{instructions, voice, tools[]}`.
- `curl_edge_functions` → `mint-realtime-token` (POST with `{sessionConfig:{}}` and `?jwt=...&model=openai/gpt-realtime-2&apikey=...`): expect `{token, url, tools}` and a `wss://…vercel…` URL. Confirm token is short-lived.
- `execute-concierge-tool` with a benign read-only tool: expect success envelope.
- Pull recent `edge_function_logs` for all three; note any 4xx/5xx.

## 5. Browser E2E — desktop (Playwright, headless Chromium, 1280×1800)
Against `http://localhost:8080` with injected Supabase session:
1. Navigate to a trip with concierge open.
2. Assert `RealtimeVoiceButton` renders (flag on) and Lovable text concierge still works.
3. Click the voice button; capture:
   - POST to `mint-realtime-token` (status, response headers `X-Lovable-AIG-*` absent — this path is Vercel, not Lovable).
   - WebSocket upgrade to `wss://…` (Vercel gateway host).
   - `RealtimeVoiceOverlay` mounts as **full chat-window takeover** (bounded by `containerRef`, covers input + transcript region, dismiss control visible).
4. Screenshot: overlay open, waveform/turn indicators, End button.
5. Click End → overlay unmounts, socket closes (frame in network log), text input restored.
6. Console: no errors, no Lovable-gateway calls during the voice session.

## 6. Browser E2E — mobile viewport (Playwright, 390×844, touch)
Repeat step 5 with mobile viewport + `hasTouch`:
- Voice button reachable in mobile input bar (≥44px tap target).
- Overlay takes over the full chat window (not the whole viewport, unless that is the desktop behavior — record actual).
- Safe-area / keyboard behavior: overlay not clipped.
- Screenshot portrait; then rotate to 844×390 landscape and re-screenshot.

## 7. Interference + fallback checks
- With `concierge_realtime_voice` flag OFF (read-only check via existing UI — do not toggle in DB unless user asks), confirm button hides and dictation (Web Speech) path remains.
- Confirm text concierge streaming (Lovable SSE) is unaffected while a voice session is active.
- Confirm tool calls emitted during voice go through `execute-concierge-tool` (same path as text), by inspecting network during a scripted "add a task" utterance.

## 8. Report deliverable
A single markdown report containing:
- Isolation matrix (§1)
- Secret + flag status (§2)
- Voice parity table (§3)
- Edge-probe results with log IDs/timestamps (§4)
- Desktop + mobile screenshots and network/WS traces (§5–6)
- Any gaps found, each tagged **observation only — no fix applied**, with a paste-ready follow-up prompt per §DEFERRAL_DISCIPLINE.

## Explicitly out of scope
- No edits to any file in the protected list.
- No refactors, no "hardening", no secret rotation.
- No changes to `feature_flags` rows or RLS.
- No migration of realtime voice onto the Lovable gateway.
