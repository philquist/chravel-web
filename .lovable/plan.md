
# AI Concierge — Scoped Retrieval & Authorization Hardening

## Current state (verified in code)

The Concierge already has most of the architecture the brief asks for. This plan is an **audit + surgical fix** pass, not a rewrite.

What exists today:
- **Entry points** (server-side):
  - `supabase/functions/lovable-concierge/index.ts` (2098 lines) — main chat/streaming endpoint, called from client via `src/services/conciergeGateway.ts` (`CONCIERGE_FUNCTION_NAME = 'lovable-concierge'`).
  - `supabase/functions/execute-concierge-tool/index.ts` — tool execution bridge (voice + text share it).
- **Auth & membership**:
  - `_shared/requireAuth.ts` — JWT-verified user via service-role client.
  - `_shared/verifyTripMembership.ts` — wraps SECURITY DEFINER RPC `is_trip_member(_user_id, _trip_id)` as the canonical predicate.
  - `_shared/concierge/tripAccess.ts` — used by `execute-concierge-tool`, checks `trip_members` + `trip_privacy_configs.ai_access_enabled`.
  - `lovable-concierge` performs its own inline membership gate on `trip_members` (line ~937) after parallel pre-flight queries.
- **Quotas**:
  - `_shared/concierge/usagePolicy.ts` — **free = 10/trip, explorer = 25/trip, frequent_chraveler = unlimited**, plus monthly token budgets.
  - `_shared/conciergeUsage.ts` calls SECURITY DEFINER RPC `increment_concierge_trip_usage(p_trip_id, p_limit)` with `incremented=false` on cap hit.
  - Rate limit: 30 req/min/user via `checkRateLimit` (DB-backed).
- **Context**: `_shared/contextBuilder.ts` (903 lines) — `TripContextBuilder.buildContextWithCache(tripId, userId, authHeader, ...)` with `QUERY_CLASS_SLICES` for module-aware retrieval (calendar, basecamps, places, payments, tasks, polls, broadcasts, files). Uses anon client with the user's JWT so RLS filters every read.
- **Privacy gate**: `trip_privacy_configs.ai_access_enabled === false` short-circuits to a friendly refusal.
- **Tool registry**: `_shared/concierge/toolRegistry.ts` (38 tools), routed through `_shared/security/toolRouter.ts` with capability tokens.

So the **goal of this work is verification + closing any concrete gap**, not redesigning the system.

## Audit plan (read-only first)

1. **Trace `tripId` end-to-end** in both endpoints:
   - Confirm `tripId` is never accepted from the request body without re-checking membership for the JWT user.
   - Confirm the same `tripId` used for the membership check is the one passed to `TripContextBuilder`, RAG retrieval, `get_concierge_trip_history`, `increment_concierge_trip_usage`, and every tool invocation. Look for any code path where one variable is checked and another is queried.

2. **Demo-mode bypass review**:
   - `serverDemoMode` short-circuits membership + usage. Verify it can only be enabled by the server (env/flag), never set by the client request body, and that demo trip IDs cannot be mixed with real trip IDs in the same call.

3. **Cross-trip leak surface**:
   - Re-run `is_trip_member` consistency check: `lovable-concierge` uses an inline `trip_members` select while `execute-concierge-tool` uses `verifyConciergeTripAccess`. Either is correct, but pick one canonical path (`verifyTripMembership` RPC) and use it in both to eliminate drift.
   - Verify `TripContextBuilder` passes the **user JWT** (not service role) so RLS filters reads. Confirm there is no place it falls back to a service-role client for a tab read.
   - Inspect every tool in `toolRegistry.ts` for tools that take a free-form `trip_id`/`tripId` argument and confirm the router rejects any id that doesn't match the membership-checked `tripId` from the request envelope.
   - `db lint`: query `pg_policies` for tables in `<supabase-tables>` that hold trip-scoped data (`trip_*`, `event_*`, `channel_*`, `broadcasts`, `payment_*`, `receipts`, `trip_files`, `trip_links`, etc.) and confirm: (a) RLS enabled, (b) SELECT policies require `is_trip_member(auth.uid(), trip_id)` or equivalent, (c) no `USING (true)` on private modules.

4. **Quota correctness**:
   - Verify `increment_concierge_trip_usage` increments **only on a successful AI response** (i.e., after the model returns or after a tool result is committed), not on validation failure/auth failure/rate-limit reject. Failed Gemini calls should not consume the quota unless intentionally documented.
   - Verify free-tier limit (10) is read from `getTripQueryLimitForUsagePlan('free')` and not duplicated as a magic number anywhere (`rg "\\b10\\b"` near concierge code).
   - Verify a user who is a member of two trips has two independent counters (key = `(user_id, trip_id)`), and that explorer/frequent users skip the per-trip cap correctly.

5. **Prompt-injection & source-bounded answers**:
   - Confirm `assemblePrompt` instructs the model: answer only from the provided trip context for trip-scoped questions; if data is missing say "I couldn't find that in this trip"; never reference other trips.
   - Confirm `sanitizeForPrompt` is applied to **all** user-content RAG snippets (messages, broadcasts, file content, links, notes) before they reach the prompt — not just keyword RAG results.

6. **Client trust surface**:
   - `src/services/conciergeGateway.ts` and `src/hooks/useConciergeUsage.ts`: confirm UI never decides whether to enforce the quota; the gate is server-only. Hooks may read remaining count for display only.
   - Confirm no concierge call goes through the anon JS client directly to module tables for "AI context" — all module retrieval must go through `TripContextBuilder` (or RPCs) so one place owns the scoping rules.

7. **Edge cases**: prompt-inject inside notes/messages, user removed mid-session, archived/deleted trip, multi-currency payments, empty trip, tie poll, missing base camp, realtime change after context cache.

## Fix policy (only what the audit surfaces)

For each finding I will produce a surgical patch, not a refactor. Likely shapes:

- **Membership canonicalization**: replace the inline `trip_members` select in `lovable-concierge` with `verifyTripMembership(adminClient, user.id, tripId)` so both endpoints share one predicate. Net diff: ~15 lines.
- **`tripId` rebinding**: assert `tripIdUsedForContext === tripIdUsedForMembership` immediately after the gate; pass a single `const verifiedTripId` everywhere downstream.
- **Tool-arg pinning**: in `executeToolSecurely` / `executeFunctionCall`, override any tool-provided `tripId` with the request-envelope verified `tripId` (drop, don't trust).
- **RLS gaps**: if any trip-scoped table is missing the `is_trip_member` SELECT policy, add it via migration. Will be listed explicitly before submitting.
- **Quota timing**: if `increment_concierge_trip_usage` runs before the AI call succeeds in any branch, move it to the success path; on AI provider error, do not consume. Keep the RPC's atomic "check + increment" guarantee — only relocate the call site.
- **Prompt instructions**: tighten the system prompt section that says "trip-scoped answer policy" to add the explicit refusal phrase the brief requests.
- **Sanitization**: apply `sanitizeForPrompt` to any RAG/source snippet path missing it.
- **Dead code**: remove the deprecated `LOVABLE_API_KEY` Gemini fallback and the `isTripRelatedQuery` shim only if they're truly unused (`rg` confirms zero imports), in a separate commit from the security fixes.

## Out of scope (explicit deferrals, with follow-up plan)

- No UI redesign of the Concierge surface.
- No new dependencies; no provider switch.
- No changes to Stream/LiveKit/Twilio unless the audit shows a leak through them.
- No change to the tab/routing/auth/realtime architecture.
- Quota policy values stay as configured (free=10, explorer=25, frequent=unlimited). If the audit shows the value is hardcoded somewhere outside `usagePolicy.ts`, consolidate; do not change the numbers.

## Deliverable

A single engineering report with:
1. Root-cause findings (per gap)
2. Files changed + diff summary
3. Migration SQL if any RLS or policy was added (presented for approval via the migration tool, not run silently)
4. How trip scoping is enforced after the fix (one canonical path)
5. How quota is enforced and confirmation that free = 10/trip already exists
6. Tests added (vitest for hooks/services; Deno tests for edge `_shared` modules; integration test that proves Trip A user cannot read Trip B context by swapping `tripId` in the payload)
7. Manual QA checklist (two users × two trips, the 11-step list from the brief)
8. Remaining risks / follow-ups

## Validation before claiming done

- `npm run typecheck && npm run lint && npm run build` pass.
- Targeted vitest suites for concierge hooks/services pass.
- Deno tests for `verifyTripMembership`, `verifyConciergeTripAccess`, `usagePolicy`, `conciergeUsage` pass.
- Manual cross-trip swap test (User A in Trip 1 sends a request with Trip 2 id → 403).
- Quota test (free user hits 10 in Trip 1, can still ask in Trip 2).

## Approval requested

Please confirm:
- **Proceed with audit-only first** (I report findings before any code change), **or**
- **Proceed with audit + surgical fixes in one pass** (I apply the patches listed above as I find them, then send the report).

Either path stays inside the constraints above (no UI/UX/routing changes, no new deps, smallest viable diffs).
