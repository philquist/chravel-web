# AI Concierge Voice Migration Audit (LiveKit/Gemini → OpenAI Realtime)

Date: 2026-05-12

## Executive summary

- The current voice path is functional but operationally heavy: frontend LiveKit room lifecycle + Supabase token function + external LiveKit worker + Gemini Live model pinning + custom data-message transport for transcripts/tool events.
- Tool parity objective is mostly already solved at the declaration layer (`toolRegistry` reused by text + voice declarations), but execution is still split between the agent worker (`agent/src/tools.ts`) and server function executor (`supabase/functions/_shared/functionExecutor.ts`), which increases drift risk.
- OpenAI Realtime can replace the media+model leg with fewer moving parts for the browser path (ephemeral session endpoint + WebRTC client), while preserving the same shared server-side tool execution contract.
- Recommendation: **D then C then E** (dual-path behind provider flag, then shift default to OpenAI Realtime, then remove LiveKit/Gemini after stability window).

## Current architecture map (voice)

1. Frontend UI (`AIConciergeChat`) delegates voice state/session behavior to `useConciergeVoice` and renders live transcripts/overlay states. 
2. `useLiveKitVoice` obtains a LiveKit token from Supabase Edge Function `livekit-token`, opens `livekit-client` room, and listens for data message topics (`transcript`, `turn_complete`, `rich_card`, `agent_state`, `error`).
3. `supabase/functions/livekit-token` validates JWT + trip membership, creates a room, embeds `tripId/userId/voice/agentAssertion` metadata, and returns join token.
4. LiveKit Cloud dispatches `agent/src/index.ts` worker, which fetches trip context, builds prompt, registers tools, configures Gemini Realtime model, and streams transcripts/state/rich-cards back over room data messages.
5. Tool execution inside the worker currently routes write tools to `trip_pending_actions` and external tools via `execute-concierge-tool`.

## Current architecture map (text concierge)

- Text concierge uses Supabase edge-function orchestration and shared server-side tool execution (`_shared/functionExecutor.ts`) with confirmation gating via `trip_pending_actions` and client confirmation handling (`usePendingActions`).
- Tool declarations for text/voice are sourced from shared registry (`_shared/concierge/toolRegistry.ts` + `voiceToolDeclarations.ts`), with parity tests in `src/__tests__/aiConciergeToolParity.test.ts`.

## Shared vs duplicated logic

### Shared now
- Tool declarations and voice/text parity tests.
- `trip_pending_actions` confirmation workflow.
- `execute-concierge-tool` bridge for external APIs.

### Duplicated now (risk)
- Voice worker tool executor (`agent/src/tools.ts`) duplicates behavior that also exists in `functionExecutor.ts`.
- Transport/event protocol for voice transcripts and tool cards is LiveKit-specific.
- Session auth/membership checks exist in both livekit token function and general concierge paths.

## Feasibility assessment: OpenAI Realtime

### What can be replaced directly
- LiveKit room/token/session lifecycle and cloud worker dispatch.
- Gemini realtime model binding in agent worker.
- LiveKit data-message transport layer.

### What must remain server-side
- Auth + trip membership enforcement.
- Tool execution + confirmation gating + RLS-safe writes.
- Audit/event logging for AI mutations.

### What should not change
- Existing text concierge path.
- Shared tool registry contract.
- `trip_pending_actions` confirmation semantics.
- Existing UI states (can preserve gold-line and transcript layout while swapping transport).

## Decision matrix (1-5)

| Option | Speed | Reliability | Latency | Voice quality | Barge-in | Tool maturity | Frontend complexity | Backend complexity | Ops complexity | Mobile/PWA | Debuggability | Arch fit | Maintenance |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A Keep LiveKit+Gemini and fix | 3 | 2 | 4 | 3 | 3 | 3 | 2 | 2 | 1 | 3 | 2 | 3 | 2 |
| B Keep LiveKit media, move orchestration | 2 | 3 | 4 | 3 | 3 | 4 | 2 | 2 | 2 | 3 | 3 | 3 | 2 |
| C Replace with OpenAI Realtime now | 3 | 4 | 4 | 5 | 4 | 4 | 3 | 3 | 4 | 4 | 4 | 4 | 4 |
| D Dual path behind feature flag | 4 | 5 | 4 | 4 | 4 | 4 | 3 | 3 | 3 | 4 | 4 | 5 | 4 |
| E Remove LiveKit/Gemini after stability | 2 | 5 | 4 | 5 | 4 | 4 | 5 | 5 | 5 | 4 | 5 | 5 | 5 |

Recommendation logic:
- **Primary path:** D (migration safety) → C (default provider shift).
- **Fallback path:** Keep LiveKit as rollback during validation window.
- **Final cleanup path:** E only after acceptance + rollback window close.

## Proposed file-by-file migration plan (minimal blast radius)

### Phase 1 (no behavior break)
- Add provider flag support (e.g., `VITE_AI_VOICE_PROVIDER=openai|livekit|off`) in voice config and `useConciergeVoice` selector.
- Keep existing `useLiveKitVoice` unchanged as fallback.

### Phase 2 (server session endpoint)
- Add `supabase/functions/create-openai-realtime-session/index.ts`:
  - verify auth + trip membership
  - mint ephemeral realtime session (model/voice/instructions/tools)
  - return ephemeral token only
- Reuse shared tool definitions from `_shared/concierge/toolRegistry.ts`.

### Phase 3 (frontend transport swap)
- Add `src/hooks/useOpenAIRealtimeVoice.ts` with same return contract as `useLiveKitVoice` where possible.
- Wire transcript + state reducer to existing UI (`VoiceLiveInline`, `AIConciergeChat`) to preserve UX.

### Phase 4 (tool execution unification)
- Route voice tool calls to the same backend function-execution path used by text (no voice-only business logic fork).
- Prefer server-side tool handling; keep client-side parsing thin.

### Phase 5 (stability + cleanup)
- Keep livekit fallback for rollback window.
- After SLO pass, remove agent worker + livekit token function + env/deploy artifacts.

## External research findings (current as of 2026-05-12)

- OpenAI announced new realtime voice models and pricing updates in the May 7, 2026 release.
- OpenAI Realtime docs continue to recommend ephemeral session flow for browser clients and WebRTC for low-latency client transport.
- OpenAI meeting assistant example demonstrates WebRTC peer + function-calling primitives, but is explicitly a demo and not production-auth hardened.

## Risks

- **Security:** ephemeral token endpoint must enforce trip membership; never expose long-lived OpenAI keys.
- **Tool execution:** avoid duplicate writes on reconnect/retry; enforce idempotency key mapping.
- **Mobile:** iOS/Android WebView microphone behavior must be validated in installed contexts.
- **Regression:** text concierge must remain untouched and tested while voice provider is toggled.

## Rollback

- Runtime flag switches voice provider back to `livekit` or `off`.
- Keep LiveKit infra and secrets until OpenAI path passes validation window.
- No destructive DB migration required for initial migration.

## Component/module grades (before → target after)

- Voice transport layer: **62 → 92** (today high operational coupling; after migration reduced dependencies and clearer state lifecycle).
- Shared tool orchestration consistency: **78 → 93** (today partial duplication; after migration server-centric shared executor).
- Safety/confirmation gating: **85 → 92** (already solid via pending actions; improved by unified tool path).
- Mobile/PWA voice resilience: **70 → 90** (requires explicit QA pass on mic/session resume/reconnect).

## Follow-up implementation checklist

1. Build `create-openai-realtime-session` edge function with auth + membership checks.
2. Implement `useOpenAIRealtimeVoice` hook with parity interface.
3. Add voice provider selector in `useConciergeVoice`.
4. Add tests: provider selection, endpoint auth, tool idempotency, lifecycle reducer.
5. Run validation matrix (desktop/mobile/PWA/reconnect/interruption/destructive-action confirmation).
