## Objective
Restore trip chat without broad rewrites by proving where the Stream pipeline stops, then fixing only that boundary.

## What I found
- The frontend currently shows the chat failure state, but browser/network signals show no request to `/functions/v1/stream-token`.
- Supabase has the backend secrets needed for Stream: `STREAM_API_KEY`, `STREAM_API_SECRET`, and `STREAM_ADMIN_SECRET` exist.
- Hosted edge logs also show no recent `stream-token` invocation, confirming the client is not reaching the token function.
- Stream feature flags are enabled for trip chat/channels/broadcasts.

## Likely root cause
The last change added `VITE_STREAM_API_KEY` locally, but if the running preview/published build does not actually receive that build-time env var, `getStreamApiKey()` returns empty and `connectStreamClient()` exits before requesting `stream-token`. That matches the observed absence of network and edge-function logs.

## Fix plan
1. **Verify build-time Stream key availability**
   - Add a safe diagnostics path that reports whether the client build sees a non-empty `VITE_STREAM_API_KEY` without exposing the key.
   - Confirm the deployed/preview bundle is not stale.

2. **Repair the client connection lifecycle**
   - Make `useStreamClient` and `useStreamTripChat` treat missing client config as an explicit “configuration unavailable” state, not a generic chat failure.
   - If `VITE_STREAM_API_KEY` is present, force the Stream connect attempt to surface a specific error when `stream-token` is never called.

3. **Verify the backend function directly**
   - Call `stream-token` with the preview auth session if available.
   - If it fails, inspect logs and fix only that edge-function/CORS/auth issue.
   - If it succeeds, the remaining issue is strictly frontend env/deployment propagation.

4. **Deployment/config correction**
   - Ensure `VITE_STREAM_API_KEY` is in the project’s frontend env/build config in the same place as other `VITE_*` values.
   - Restart/rebuild the preview so `import.meta.env.VITE_STREAM_API_KEY` is compiled into the bundle.

5. **Proof**
   - Verify browser network shows `POST /functions/v1/stream-token`.
   - Verify Supabase edge logs show `stream-token` executed.
   - Verify Stream WebSocket/channel watch happens and the chat panel loads messages instead of the reload/error state.

## Scope control
- No chat rewrite.
- No legacy Supabase chat resurrection unless Stream backend is proven unavailable.
- No changes to trip permissions, RLS, or message data model.