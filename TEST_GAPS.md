# Test Gaps

> Track meaningful missing coverage discovered during debugging and implementation.
> Prioritize gaps that protect critical paths.

---

## Chat reconnect backfill correctness
- **Area:** `src/features/chat/hooks/useTripChat.ts`
- **Why this gap matters:** Messages lost during websocket drops are the most common chat reliability issue for mobile users
- **Missing coverage:** No test for backfill fetch on channel reconnect or visibilitychange
- **Failure mode if untested:** Backfill could silently fail, fetch duplicates, or miss edge cases (empty gap, >100 messages in gap, encrypted messages)
- **Suggested tests:** Mock Supabase channel status change to SUBSCRIBED (after CHANNEL_ERROR), verify gap messages are fetched and merged without duplicates
- **Priority:** high
- **Provenance:** March 2026 chat reliability audit

## Chat read receipt debounce and incremental marking
- **Area:** `src/features/chat/components/TripChat.tsx`
- **Why this gap matters:** Read receipt storms caused N×M DB writes per new message
- **Missing coverage:** No test that only new messages are marked as read, and that the 1s debounce batches correctly
- **Failure mode if untested:** Regression to marking all messages on every INSERT; debounce timer not cleared on unmount causing memory leak
- **Suggested tests:** Render TripChat, simulate 5 rapid message arrivals, verify markMessagesAsRead called once with only the new IDs (not all visible)
- **Priority:** medium
- **Provenance:** March 2026 chat reliability audit

## Chat client_message_id always set on online sends
- **Area:** `src/features/chat/hooks/useTripChat.ts`
- **Why this gap matters:** Idempotent sends prevent duplicate messages on network retries
- **Missing coverage:** No test verifying client_message_id is present in online (non-offline) message payloads
- **Failure mode if untested:** Regression could remove client_message_id from online sends, losing retry safety
- **Suggested tests:** Mock sendChatMessage, call sendMessageAsync, verify messageData includes a valid UUID client_message_id
- **Priority:** medium
- **Provenance:** March 2026 chat reliability audit

## Chat reaction incremental updates vs full refetch
- **Area:** `src/features/chat/components/TripChat.tsx`
- **Why this gap matters:** Full reaction refetch on every message caused O(N) queries
- **Missing coverage:** No test that reactions are only fetched once and subsequent updates come from realtime
- **Failure mode if untested:** Regression to refetching all reactions on every new message
- **Suggested tests:** Render TripChat, simulate 3 messages arriving, verify getMessagesReactions called exactly once (initial), not on subsequent INSERTs
- **Priority:** low
- **Provenance:** March 2026 chat reliability audit

## Integrations platform replay/idempotency coverage
- **Area:** `supabase/functions/gmail-import-worker/index.ts`, `supabase/functions/file-ai-parser/index.ts`, `supabase/functions/calendar-sync/index.ts`
- **Why this gap matters:** Integration retries and provider replays can silently duplicate or corrupt shared trip data.
- **Missing coverage:** No shared contract tests for idempotent reruns, out-of-order events, or partial import terminal states across provider pipelines.
- **Failure mode if untested:** Duplicate imports, stale sync state, and false-success UX after partial failures.
- **Suggested tests:** End-to-end integration suite with deterministic replay payloads, duplicate-run attempts, and partial-step failures asserting `completed_partial` semantics.
- **Priority:** high
- **Provenance:** March 2026 integrations/import-export audit
- **Partial coverage added:** 2026-05 AHS-14/15 added unit coverage for file parser replay keys/cached payloads and Gmail import terminal status (`completed`, `completed_partial`, `failed`). Full integration replay tests are still needed for database-level concurrency and provider out-of-order events.

## Export completeness + authorization manifest tests
- **Area:** `supabase/functions/export-user-data/index.ts`, `supabase/functions/export-trip/index.ts`
- **Why this gap matters:** Exports are trust/privacy boundaries and can become compliance incidents when partial or over-scoped.
- **Missing coverage:** No manifest-based assertions for table completeness, mandatory-section failures, and per-role authorization boundaries.
- **Failure mode if untested:** Silent omissions presented as success, or unauthorized data leakage in generated export packages.
- **Suggested tests:** Integration tests validating manifest row counts, enforced auth checks, and blocked access for non-members/non-admins.
- **Priority:** high
- **Provenance:** March 2026 integrations/import-export audit
- **Partial coverage added:** 2026-05 AHS-11/12/13 added unit coverage for export manifest hard-failure policy and trip PDF membership/default-section authorization policy. Full integration tests with live Supabase fixtures are still needed for row-count completeness and role matrix enforcement.

## Migration compatibility window regression suite
- **Area:** `supabase/migrations/` + app DB access layer
- **Why this gap matters:** Current migration history shows repeated modification of high-risk tables and policies; without compatibility testing, rolling deploy windows can break old/new app versions.
- **Missing coverage:** No automated CI test that validates both old-app/new-schema and new-app/old-schema compatibility for one deploy window.
- **Failure mode if untested:** Runtime failures during phased rollout, policy mismatches, or enum/state parsing regressions after migration apply.
- **Suggested tests:** CI job that boots previous app build against latest schema, and current app build against prior schema snapshot; verify critical CRUD/auth paths.
- **Priority:** high
- **Provenance:** 2026-03 data evolution hardening audit

## Internal/Admin Route Authorization
- **Gap:** No end-to-end route authorization tests asserting `/admin/*` rejects authenticated non-admin users.
- **Failure mode if untested:** Regressions can silently expose internal admin surfaces to all logged-in users.
- **Recommended test:** Playwright test: authenticate non-admin -> open `/admin/scheduled-messages` -> assert redirect away from route; authenticate super admin -> assert page access.
- **Priority:** P1
- **Provenance:** March 2026 support/admin hardening pass
## Missing automated load + chaos pipelines for Tier-0 journeys
- **Area:** CI/workflows + QA infrastructure (`.github/workflows`, `qa/`)
- **Why this gap matters:** Functional tests can be green while event spikes/provider degradation still break launch-critical journeys.
- **Missing coverage:** No automated load profiles (join surge, hot chat) or chaos scenarios (outage, delayed webhook, stale session) currently gated in CI.
- **Failure mode if untested:** Release gates pass despite production failures under scale or dependency instability.
- **Suggested tests:** Add staged load/chaos workflows that publish artifacts and evolve from warn-only to blocking for Tier-0.
- **Priority:** high
- **Provenance:** March 2026 QA governance hardening pass.
## AI Concierge query classifier and tool selection tests
- **Area:** `supabase/functions/lovable-concierge/index.ts`, `supabase/functions/_shared/voiceToolDeclarations.ts`
- **Why this gap matters:** No tests verify that the right tools are exposed for the right query types, or that irrelevant tools are excluded
- **Missing coverage:** No unit tests for `isTripRelatedQuery()`, `shouldRunRAGRetrieval()`, or `CLEARLY_GENERAL_QUERY_PATTERN`. No tests that a weather question excludes payment tools. No tests that voice tool declarations match backend implementations.
- **Failure mode if untested:** Model selects wrong tools, tools silently fail in voice path, prompt bloat goes unmeasured
- **Suggested tests:** (1) Query classifier unit tests: input queries → expected classification. (2) Tool parity test: every tool in voiceToolDeclarations has a matching case in functionExecutor. (3) Token budget test: measure system prompt size per query class, alert if over threshold.
- **Priority:** high
- **Provenance:** March 2026 AI Concierge architecture & prompt audit

## AI Concierge prompt token measurement and regression
- **Area:** `supabase/functions/_shared/promptBuilder.ts`, `supabase/functions/_shared/aiUtils.ts`
- **Why this gap matters:** No baseline measurement of prompt token cost exists, so bloat accumulates silently
- **Missing coverage:** No test that system prompt stays under a token budget per query class. No test that few-shot examples are only injected for matching query types.
- **Failure mode if untested:** Prompt grows unbounded, latency increases, context window exceeded for long conversations
- **Suggested tests:** Snapshot test measuring `buildSystemPrompt()` output length for minimal, typical, and maximal trip contexts. Assert within budget thresholds.
- **Priority:** medium
- **Provenance:** March 2026 AI Concierge architecture & prompt audit

## AI Concierge voice tool backend parity
- **Area:** `supabase/functions/_shared/voiceToolDeclarations.ts`, `supabase/functions/_shared/functionExecutor.ts`
- **Why this gap matters:** Voice path declares 31 tools but only ~19 have backend implementations. Model can call tools that return errors.
- **Missing coverage:** No automated test that every tool in VOICE_FUNCTION_DECLARATIONS has a corresponding case in functionExecutor
- **Failure mode if untested:** Voice users experience silent tool failures when the model selects an unimplemented tool
- **Suggested tests:** Enumerate VOICE_FUNCTION_DECLARATIONS names, call executeFunctionCall for each with minimal valid args, assert no "unknown function" errors
- **Priority:** high
- **Provenance:** March 2026 AI Concierge architecture & prompt audit

## Reliability drill automation for SLO + degradation + restore
- **Area:** Cross-cutting reliability platform (`src/services/apiHealthCheck.ts`, queue workers, DR procedures)
- **Why this gap matters:** Without automated drills, resilience assumptions remain theoretical and regress silently.
- **Missing coverage:** No CI/staging suite that validates tier-based degradation behavior, queue backlog alert thresholds, and backup-restore acceptance checks.
- **Failure mode if untested:** Production incidents where fallback modes are broken, alerts are noisy/missing, or restore success is declared prematurely.
- **Suggested tests:** Scheduled staging drills that (1) inject provider outage, (2) force queue saturation, (3) execute restore rehearsal and verify Tier-0 journeys.
- **Priority:** high
- **Provenance:** March 2026 reliability constitution audit

## LiveKit voice end-to-end integration test

- **Area:** `supabase/functions/livekit-token/index.ts`, `agent/src/index.ts`, `src/hooks/useLiveKitVoice.ts`
- **Why this gap matters:** The two P0 voice bugs (dead roomConfig code + missing agent deployment) survived code review because no integration test validates the end-to-end path from token generation through agent dispatch to audio roundtrip.
- **Missing coverage:** (1) Test that `createRoom()` is called with correct metadata and agent dispatch. (2) Test that the agent receives non-empty room metadata. (3) Test that the agent joins within the 10s SLA. (4) Smoke test for audio roundtrip in staging.
- **Failure mode if untested:** Voice appears "code-complete" but silently fails at runtime because the room has no metadata or agent dispatch.
- **Suggested tests:** Integration test mocking `RoomServiceClient` to verify call args. E2E staging test that creates a real room and asserts agent joins.
- **Priority:** critical
- **Provenance:** April 2026 LiveKit voice stack forensic audit
## Stream hook initialization race — pro channels, broadcasts, concierge history
- **Area:** `src/hooks/stream/useStreamProChannel.ts`, `src/hooks/stream/useStreamBroadcasts.ts`, `src/hooks/stream/useStreamConciergeHistory.ts`
- **Why this gap matters:** `useStreamTripChat` had a race condition (fixed April 2026 via `onStreamClientConnected` subscriber + `streamClientReady` state). The three hooks above have the identical structural pattern — they check `getStreamClient()?.userID` once at mount and bail out if falsy, meaning they stay broken if Stream connects after the component mounts. The bug is dormant only if these hooks consistently mount after Stream is fully connected.
- **Missing coverage:** No test that exercises these hooks mounting before `connectStreamClient()` resolves. No test that the hooks recover when Stream connects asynchronously.
- **Failure mode if untested:** Pro channels, broadcast list, and concierge history silently show empty/loading state until the user hard-refreshes, especially on mobile where token fetch is slower.
- **Suggested tests:** Unit test each hook with a mocked Stream client that connects 200ms after mount — assert data loads without requiring a re-mount.
- **Priority:** medium-high
- **Provenance:** April 2026 GetStream messaging rebase (`claude/fix-getstream-messaging-xmHa9`)

## Authenticated e2e messaging tests require SUPABASE_SERVICE_ROLE_KEY
- **Area:** `e2e/specs/chat/messaging.spec.ts` (CHAT-001, CHAT-002, CHAT-003)
- **Why this gap matters:** The 8 smoke tests (CHAT-SMOKE-01..08) run and pass in any environment using demo mode. The 8 authenticated tests that verify actual Stream message delivery, concierge query/response, and pro channel rendering skip when `SUPABASE_SERVICE_ROLE_KEY` is not set. They have never run in CI.
- **Missing coverage:** Actual Stream `channel.sendMessage()` delivery, `message.new` WebSocket event receipt, concierge query-to-response cycle, and pro channel member filter.
- **Failure mode if untested:** Stream integration could be broken in staging and only discovered by a human spot-check.
- **Suggested tests:** Run `e2e/specs/chat/messaging.spec.ts --grep "CHAT-001|CHAT-002|CHAT-003"` against staging with `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` set. Add to scheduled staging E2E workflow.
- **Priority:** high
- **Provenance:** April 2026 messaging e2e suite (`claude/fix-getstream-messaging-xmHa9`)

## Trip cover photo upload end-to-end coverage
- **Area:** `src/features/trips/hooks/useCoverPhotoUpload.ts`, `src/components/CreateTripModal.tsx`, `src/components/TripHeader.tsx`, `src/components/TripCoverPhotoUpload.tsx`
- **Why this gap matters:** The "create trip with cover" flow has been beta-blocking for multiple sprints across multiple fix attempts because no integration or E2E test exercises the full pipeline: storage upload → DB write → cache invalidation across all six query surfaces (`['trips']`, `['proTrips']`, `['events']`, `['pending-request-trip-cards']`, `['trip', tripId, ...]`, `['trip-members', tripId]`). The existing `TripCoverPhotoUpload.test.tsx` is broken on baseline because `prepareImageForUpload` requires JSDOM image APIs (`createImageBitmap`) that aren't available.
- **Missing coverage:** (1) Unit test for `useCoverPhotoUpload` covering direct mode happy path, callback mode happy path, persist returns false (storage cleanup verified), upload throws (storage cleanup verified). (2) E2E (Playwright) for create-trip-with-cover on consumer + pro + event types, asserting the dashboard card renders the cover within 2s. (3) E2E for cover replace via `TripHeader` asserting old cached image is not shown after refresh.
- **Failure mode if untested:** Same recurring beta complaint pattern — cover uploads "succeed" silently but the surface that should render them stays stale, and partial cleanup leaves orphaned storage objects.
- **Suggested tests:** Vitest for the hook with `@tanstack/react-query` test client + mocked `supabase`. Playwright E2E using a fresh authenticated test user and a small fixture image, asserting card rendering on `/dashboard`, `/dashboard/pro`, `/dashboard/events`.
- **Priority:** high
- **Provenance:** May 2026 cover photo upload definitive fix (branch `claude/fix-cover-photo-upload-RodMM`)

## iMessage chat polish — mosaic / voice / receipt render paths
- **Area:** `MessageBubble.tsx`, `VoiceNotePlayer.tsx`, `useShareAsset.ts`
- **Why this gap matters:** Adapter unit tests now cover Stream→VM attachment mapping; MessageBubble RTL now covers mosaic / voice / place card / tail (July 2026). Still missing: swipe-up-to-lock gesture RTL and feature-flag OFF fallbacks.
- **Missing coverage:** VoiceRecordButton lock gesture; MessageBubble with `chat_media_mosaic=false` / `chat_voice_notes=false`.
- **Failure mode if untested:** Kill-switch OFF paths could crash or keep showing disabled UI.
- **Suggested tests:** Mock useFeatureFlag per key; assert mosaic stacks and voice falls back to file link; pointer lock/send on VoiceRecordButton.
- **Priority:** medium
- **Provenance:** July 2026 iMessage chat audit + deferred polish (`cursor/imessage-chat-audit-ff9d`)
