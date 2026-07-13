# Lessons

> Reusable engineering tips. Read matching entries before planning; update after meaningful tasks via a single learning-update commit at branch end.
> Format: heading + one-sentence principle (+ optional one-line scope or evidence).

---

## Data Flow & State

### Always distinguish Loading, Not Found, and Empty states
Never let a fetch-in-progress fall through to a Not Found or Empty render path. Zero-tolerance regression in Chravel.

### Gate all data fetches on fully hydrated auth session
Wait for the auth guard to resolve a real user session before triggering trip / profile / auth-gated queries — stale auth state flashes a false Not Found.

### Trace field names end-to-end before patching data bugs
DB schema → Supabase types → hook → props → render. Fix at the source, not via mapping hacks.

### Trip access requires both existence check AND RLS-gated membership
Existence ≠ access. Always check membership before any trip-aware mutation or read.

### Post-create follow-up writes must go through the same invalidating mutation path
A successful create that bypasses the canonical mutation hook leaves caches inconsistent.

### Cache invalidation footprint is the contract — extract once, reference everywhere
If two mutation paths invalidate the same keys, lift the key set to a shared helper; drift is otherwise inevitable.

### Avoid default `[]` prop literals when callbacks/effects depend on that prop
A new array identity each render triggers infinite effect loops; default via `useMemo` or hoist the constant.


### Poll discussion lives beside the vote, not in chat
Keep poll replies on the poll card (vote → reply). Parallel demo storage (`poll_comments_${tripId}`) so demo mode works without mutating sacred mockPolls.

### Poll option append after lock needs a SECURITY DEFINER RPC
`options_locked_at` freezes client UPDATE of option text/votes; member-suggested options must go through `append_poll_option` (auth + membership + active + max 10 + duplicate check), not a direct options rewrite.

### Cross-tab poll deep-links use sessionStorage + a window event
Concierge/chat → Polls tab: stash intent (`pollDeepLink`), fire `POLL_DEEP_LINK_EVENT`, switch tab; CommentsWall consumes URL/`?pollId=`/`?createPoll=1` so mobile and desktop shells stay in sync without prop-drilling through every trip shell.

### useEffect dependencies on array state cause O(N) re-execution storms
Depend on `arr.length` or a derived primitive, not the array itself, unless deep-equal is required.

---

## Realtime & Chat

### Realtime subscriptions must filter by trip_id
Unfiltered Supabase realtime channels receive ALL global events — always specify the table-column filter.

### Always backfill on realtime channel reconnect
Supabase does not replay missed events. On `SUBSCRIBED`-after-initial and on app foreground, refetch the affected queries.

### Chat backfill is mandatory on websocket reconnect
Message loss between disconnect and reconnect is the most common chat bug — backfill from server with deterministic dedupe.

### Stream chat cheatsheet
- Use the singleton client API, **not** channel-level casts, for message edits.
- Pin/unpin uses `partialUpdateMessage`, **not** full update payloads.
- Custom message fields require explicit forwarding through both adapter paths.
- System messages route via `channel.sendMessage` with `silent` + `skip_push`.
- Hook into client *connection events*, not one-time client snapshots.
- Webhook channel identity parses from the *event root*, not the nested message object.
- Read-receipt and reaction hooks must no-op when the channel is unavailable.
- Unread badge splits must not override Stream's total unread when history is partial.
- Keep Stream channel state and role-channel state as separate identifiers in mixed UIs.
- Presentation features that need `attachments[]` (mosaic, voice notes) must map the full Stream attachment list in `streamMessageViewModel` — collapsing to first `mediaUrl` silently kills multi-media UX.
- Message grouping must resolve sender via `sender.id` (Stream view models), not only legacy `sender_id`/`user_id`.
- Sticky overlays over virtualized lists must compare derived values by primitive (timestamp/id) before setState — `setState(new Date(sameTs))` infinite-loops because Date identity changes every render.

### Keep shared chat mutations (pin/unpin, edit, delete) inside the shared hook, not UI surfaces
Trips/Pro Trips/Events should all call the same `togglePin` from `useStreamTripChat` — UI components should never run their own client-level Stream mutations.

### In transport-mixed chat surfaces, propagate transport mode to the mutation trigger
If a parent surface mixes Stream + legacy transports, the inner action component must receive explicit `transportMode` — defaults route Stream actions through legacy paths.

### Don't block chat delivery on preview metadata fetch
Link previews enrich, they don't gate. Send the message first, resolve OG after.

### During chat backend migrations, hydrate from both old and new stores with deterministic dedupe
Migration windows must read both sides and merge by stable ID.

### Thread-reply success UX should derive from pre-send reply context, not post-send composer state
Composer mutates between dispatch and ack; capture context before send.

### Stream search results for thread replies should deep-link to parent message IDs
Replies without parent context are unmoored.

---

## AI Concierge

### AI concierge writes go through the pending actions buffer, not directly to shared state
Every AI-initiated mutation pauses for user confirmation via `trip_pending_actions`; bypass = silent state corruption.

### Concierge tool additions require 5-file sync — miss one and the tool silently fails
A new concierge tool touches: `toolRegistry.ts` · tool implementation · pending-action confirm switch · renderer · voice tool surface. Use the `chravel-ai-concierge` skill checklist. Symptom of a partial implementation: tool works in text but not voice, or confirms silently.

### Concierge tool declarations live in `toolRegistry.ts` as single source of truth
Voice and text share the same tool surface; never declare a tool only in one path.

### Conditional tool exposure beats always-on for latency and cost
Tools load by query class via `queryClassifier.ts`. Adding a tool means picking which classes get it.

### Map each AI tool's writes to the React Query keys it dirties
The tool runs; the UI shows stale data. Explicit invalidation per affected surface fixes this.

### Pending action confirm handler must cover every pending-buffer write tool
If a tool inserts to `trip_pending_actions` but the confirm switch doesn't case on its `action_type`, confirm appears to work but produces no data.

### Stream finalization should treat rich-card-only tool results as successful output
Don't bail on empty text when the model returned a card.

### Always-on prompt layers should be audited for conditional value
Boilerplate preference / system context injected on every query wastes tokens; gate by query class.

### Gemini Live voice sessions require explicit lifecycle cleanup
Tear down audio context + mic stream + websocket on unmount; otherwise zombie sessions burn quota.

### Vertex Live setup payloads should omit optional objects when unset
Sending `{}` for a missing optional triggers a setup error — omit the key entirely.

### Voice session lifecycle requires LiveKit agent + room metadata as prerequisites
`livekit-token` alone is not enough; ensure the agent is deployed and room metadata propagates.

### Ship live voice behind a hard UI kill switch until control-plane and data-plane checks both pass
Voice should never silently degrade — kill it explicitly.

### Realtime model drift needs a literal-level CI guard
Voice model string drifts silently; assert it equals the canonical literal in CI.

---


### Release gates must bound long-running suites with explicit timeouts
### ChatSearchOverlay default `demoMessages = []` infinite-loops Vitest
Inline default array props are new references every render. If a `useEffect` depends on that prop and calls `setState([])` on the empty-query path, React sees a changed dependency forever and hangs the full suite (no failing assertion). Fix with a module-level `EMPTY_*` constant and functional setState that preserves empty arrays. Evidence: 2026-07-13 App Store gate hang — suite completed after fix (1898 pass).

### Full-suite Vitest can hang without reporting failures; release gates should fail closed with a configurable timeout and require focused follow-up instead of running indefinitely. Evidence: App Store QA gate timed out `npm run test:run` at 180s on 2026-07-13 while focused feature suites passed.

## Auth, Permissions, Payments

### Permission model varies by trip type: consumer open · pro role-based · event organizer-only
Any mutation hook serving multiple trip types must branch on type before authorizing.

### Role propagation must flow DB → RLS → hook → UI
Never trust a client-side role claim. The DB is the source of truth.

### Mock-ID tier gate disables consumer-only features for all real trips
If you write `if (isMockId)` to enable a feature, you've disabled it for production. Use the tier check, not the ID.

### Installed-app OAuth requires in-app browser tab + Universal Link callback
Web flow re-opens the app via Universal Link; the AASA must list every short path used in production.

### Native Sign in with Apple (id-token) beats the browser OAuth round-trip on iOS/iPad
The SFSafariViewController + Universal-Link OAuth round-trip can strand iPad users after they authenticate (App Review 2.1(a) "did not proceed to next page"). When the native shell exposes `window.ChravelNative.signInWithApple()` (native ASAuthorization → `{ identityToken, rawNonce, authorizationCode }`), authenticate via `supabase.auth.signInWithIdToken({ provider:'apple', token, nonce: rawNonce })` — pass the RAW unhashed nonce (the shell sends `SHA256(nonce)` to Apple). Keep the web OAuth flow as the byte-for-byte fallback: the helper returns `{ handled:false }` when the bridge is absent, throws, or returns an incomplete credential. *Evidence: `src/utils/nativeAppleSignIn.ts`; PR #746.*

### OAuth callbacks should preserve same-origin session context via signed redirect state
Don't trust the redirect URI off the query string — sign it into state and verify server-side.

### Internal admin surfaces need route-level role guards, not auth-only protection
Logged-in ≠ authorized.

### Keep founder/super-admin bypass identity in one shared module across edge functions
Drift between edge functions creates inconsistent privilege grants.

### Apple token revocation (5.1.1(v)) differs by sign-in path
Web OAuth puts a `provider_refresh_token` on the session only on the INITIAL `SIGNED_IN` (capture it then). Native id-token sign-in carries no refresh token — only a one-time `authorizationCode`; `captureAppleRefreshToken` no-ops for native users, so forward the code to `store-apple-token` for a server-side exchange (which needs the Apple `.p8` client secret). Account deletion must revoke the grant regardless of which path the user signed in through. *Evidence: `src/hooks/auth/captureAppleToken.ts`; PR #746.*

### Enforce payment SDK boundary: RevenueCat for iOS, Stripe for web
Subscription checks should branch on platform; mixing creates double-charge / mismatched entitlement risk.

### Pick one billing runtime adapter per app surface
All entitlement sync routes through the chosen adapter; the other provider becomes reconciliation-only.

### Entitlement upserts conflict on purchase domain, not user identity alone
Same user with two providers needs two rows.

### Entitlement-read APIs should prefer normalized `user_entitlements`; provider APIs are stale-reconciliation only
Don't fetch RevenueCat live on every paywall render.

### Checkout creation should enforce cross-provider overlap guards
Reject a new Stripe checkout if an active RevenueCat sub exists (and vice versa).

### Plan quotas live in one canonical module consumed by both client and server
Drift between client-displayed and server-enforced quotas is a UX bug factory.

### Payment splits are state machines — pending/confirmed/settled per participant with optimistic locking
Each settlement is a row transition; never compute split state on the fly.

### App Store billing compliance needs both client-side and server-side enforcement
Client toggles aren't enough — server must reject non-compliant purchases.

### Archive/restore limits must be enforced server-side, not only in client services
Client validation is UX; server validation is the contract.

### Smart-import limits should return machine-readable paywall metadata
Generic parser errors prevent the client from rendering the right upsell.

---

## Notifications & Routing

### Notification dual-path dedup prevents duplicate delivery
Push and in-app notifications share an `event_id`; dedupe on it server-side before broadcasting.

### Notification deep-link mappers should read both metadata and first-class columns
Older notifications carry context in metadata; newer ones in columns. Read both during transition.

### Notification click routing should be metadata-first and carry chat bootstrap context
Land in the right chat with the right message highlighted, not just the trip page.

### Kill-switched write features should be gated in both UI and service layers
A UI-only kill switch leaves the service path callable.

### Branded OG hosts should never be used as app CTA destinations
`p.chravel.app` is for unfurls; CTAs link to the canonical app URL.

### Keep OG proxy rewrites on share entry paths only
Don't rewrite SPA destination paths — preview metadata leaks into the live app.

### Scope idempotency/dedupe keys to the specific event row, not a broader identity
A dedupe key on `trip_id:user_id` for join-request notifications silently swallowed every future notification once one request had ever been made — including the exact re-request a 24h rejection cooldown is designed to allow. Key on the request/event's own id instead; that still dedupes accidental repeat-insert attempts for the *same* event without blocking legitimate new ones. *Evidence: July 2026 invite flow audit, `supabase/functions/join-trip/index.ts` fanout_event_key.*

### A proxy must forward the upstream's Cache-Control, not apply a blanket policy
When a proxy edge function sets its own `Cache-Control` unconditionally, it can override an upstream's deliberate `no-store` on error/negative responses (expired/revoked/not-found), letting the CDN cache a stale negative result. Read `upstream.headers.get('cache-control')` and only fall back to a default when absent. *Evidence: July 2026 invite flow audit, `api/invite-preview.ts`.*

### OG/share proxy endpoints must fail over to HTML redirect pages when upstream returns JSON
Crawlers expect HTML; a JSON 500 prevents Universal Link interception.

### Shared trip preview flows should self-heal missing active invites before exposing the join CTA
Pending invite that's silently inactive = users see "Join" but hit a dead-end toast.

### Trip preview CTA should resolve membership AND join-request status together
Otherwise pending requesters dead-end on "invite still setting up".

### Dashboard request cards and request counters must share the same outbound source-of-truth
If cards render from outbound rows but the counter reads `membership_status='pending'` trips, count/card drift is guaranteed.

### When a card depends on joined trip metadata, ship a requester-scoped RPC instead of UI fallback mappers
PostgREST relationship metadata or RLS nulls break frontend joins — push the join to a single RPC.

### For invite conversion CTAs, never let a secondary client lookup overwrite invite context derived from edge previews
The edge-resolved context is the source of truth.

---

## Calendar & Smart Import

### Treat imports and sync as state machines, not parser calls
Receive → parse → validate → stage → confirm → commit. Each stage logs its own failure.

### Calendar bi-sync must be idempotent — deduplicate by external event ID, not insert order
Recurrence makes the order question unanswerable.

### Calendar sync uses sync tokens and etags for idempotent bi-directional sync
Google returns tokens; persist them as the next-poll cursor.

### Gmail and PDF import failures must persist partial state
Never silently drop parsed items on retry; users re-import and get duplicates.

### Replace-mode imports should be insert-first, delete-last
A transient insert failure mid-replace can hard-delete the user's data. Sequence matters.

### URL import modals stay stable when UI gating and submit normalization share one helper
Two parallel normalizers create UI/submit mismatch on edge case URLs.

### Fire-and-forget sync paths must emit structured failure signals
Silent failures are unfixable. Emit a typed error event even if no caller is listening.

### Never put AI/parser enrichment ahead of chat mutation kickoff
Enrich after the canonical write — otherwise enrichment failure blocks delivery.

### Mobile Day vs Month calendar must be layout-distinct, not just a label swap
Day = agenda-first listings with a height-capped mini grid; Month = capped month overview + selected-day agenda. A single stretched grid for both modes reads as broken UX (Jul 2026 marketing-parity fix).

### Never let an empty day list `flex-1` the month grid into the leftover viewport
Empty-state calendar expansion made Day view look identical to Month and stole >50% vertical space. Cap with `max-h-[~42%]` + `shrink-0` instead.

---

## Media, Maps & UI

### Media uploads use a compression pipeline before storage
Browser uploads >5MB without compression fail mobile reliably. Compress client-side, validate server-side, signed URLs only.

### Media uploads need server-side validation, signed URLs, and orphan cleanup triggers
Client validation is UX; server validation is enforcement; orphan cleanup runs periodically.

### Single map instance per page with debounced events
Never duplicate `MapView`; use props/context for mode changes. Debounce drag/zoom/bounds_changed at 300ms.

### Cover-image storage should have a single bucket/path helper shared by all upload entrypoints
Otherwise different upload surfaces write to different buckets with different naming.

### Use a two-layer image strategy (blur-fill background + contain foreground) for fixed cover-card layouts
Preserves intent at any aspect ratio without cropping the subject.

### Resolve trip-media URLs at shared renderer boundaries
Don't resolve in every component — centralize so the cache is shared.

### Secured Supabase storage buckets require signed URLs for client previews
Public buckets leak; signed URLs respect RLS.

### Demo-mode media should not depend on external uptime without a local fallback
Onboarding videos that 404 break the first-run experience harder than a missing feature.

### Centralized segment color tokens need `dark:` variants when the bar uses semi-transparent dark over varying page backgrounds
Light-mode washout is invisible in dark-mode-only design review. Use `dark:*` on inactive states. *Evidence: MessageTypeBar Pinned `amber-300` → `amber-700 dark:amber-300` (PR #585).*

### Prefer semantic foreground tokens over fixed light text for selected controls
`text-white` on a themed background ignores dark/light mode and theming overrides.

### Mention chips inside themed chat bubbles should be bubble-context aware, not brand-accent aware
A gold mention on a red broadcast bubble breaks color theory; mention color follows bubble.

### Remove visual effects at the trigger class, not with clipping overrides
`overflow:hidden` to mask an animation = pixel snapping bugs. Kill the animation instead.

### Never apply keyframe `transform` animations on the same node dnd-kit uses for drag transforms
Drag transforms compose multiplicatively; keyframes break the math.

### For reorder edit-mode motion, prefer micro-float over rotation
Users find rotation disorienting; vertical micro-float is calmer and still affords drag.

### Hover actions in dense message stacks must share the same pointer-ownership container
Otherwise mouseover/mouseout race and actions flicker.

### Dark-themed native time inputs need an explicit affordance
Browser-native time picker indicators disappear on dark bg; render a visible clock icon.

### Keep hidden file inputs mounted when multiple CTAs share one upload ref
Conditional rendering kills the ref between renders; mount once, `.click()` on demand.

### CSS multi-background layering is a low-risk fallback for background-image cards
Compose color + gradient + image in `background` shorthand instead of nesting wrappers.

### Resolve cache-busting at the renderer, never persisted into canonical DB columns
`?v=123` in a stored URL is permanent technical debt.

---

## Edge Functions, CI & Process

### Edge functions must validate required secrets at startup via `requireSecrets()`
Boot-time validation prevents silent failures on missing env.

### For edge-function auth bugs, fail early on malformed Bearer headers
Run a shape check before calling `auth.getUser` to avoid the misleading "User not found" 401.

### Edge Function "Failed to fetch" in browser is usually CORS-origin drift, not a DB bug
Check the function's CORS allowlist before chasing SQL. Keep `_shared/cors.ts` aligned with active production domains.

### Standalone agents need their own deployment pipeline
Edge function CI does not cover LiveKit / external agents; ship them through a dedicated workflow.

### Treat `npm run validate` as the deployment gate when `npm run build` is green
Build can pass while `validate` (lint:budget + format:check + schema-drift + env coverage) catches the real blockers.

### Prettier `format:check` runs repo-wide in CI; the auto-format workflow only touches PR-modified files
Inherited unformatted files in `main` fail Static Checks on every new PR until manually formatted — even files the PR never touched. Reproduce with `npm run format:check`, fix with `prettier --write` using the repo's pinned version (so output matches CI), and land it as a separate `chore:` commit; expect touching those shared files to widen Cross-PR File Overlap with other open PRs. *Evidence: PR #585; PR #746 inherited 21 unformatted files byte-identical to `main` (proved via `git diff origin/main`).*

### "Unit Tests (Vitest)" is an aggregate gate — a red shard is usually a forks-worker teardown flake, not an assertion
The aggregate job only rolls up the shard matrix (`result="failure"` → exit 1); open the specific shard log to diagnose. `[vitest-pool]: Timeout terminating forks worker for <file>` printed AFTER the coverage table means the tests passed and the pool failed to tear a worker down in time — a flake a re-run clears, not a real failure. The Codecov "Token required - not valid tokenless upload" line is a separate non-failing `if: always()` step. *Evidence: PR #746 — shard 4 flaked on `AIConciergeChat.test.tsx`, passed on re-run.*

### Split flaky E2E from required PR gates and reuse build artifacts
E2E should be advisory or scheduled, not blocking.

### Treat schema migrations as a product compatibility API, not just SQL files
Every migration is a breaking change for someone. Document the forward-fix.

### Client-side deletes on RLS-protected tables must never assume success without row-level confirmation
Empty result = "no rows visible to you", not "no rows existed".

### `trip_payment_messages.trip_id` is TEXT, not UUID
Cast appropriately when joining or filtering — type-mismatched filters return empty.

### Retiring a deprecated service should be enforced with an import-level guard, not just file deletion
Otherwise a future agent restores it from history.

### Decompose god-components by extracting stateful domains before moving large async pipelines
Pull state first, then move the async work — otherwise tests have nothing to anchor on.

### Never use `(x as any).property = value` to set SDK configuration
Verify the API surface; the cast hides removed/renamed properties.

### When duplicated handlers exist across components, unify before patching
Fixes that target one path leave the others broken — the duplicate is the bug.

### Bounded chunk concurrency is the safest first optimization for sequential external API loops
Unbounded parallelism breaks rate limits; sequential is slow. Chunk size 5–10 is the sweet spot.

### Parallelizing handlers can break check-then-insert dedupe paths
Add a DB uniqueness constraint before parallelizing — TOCTOU otherwise.

### Reliability posture audits must separate "controls exist" from "controls are exercised"
Coverage of the test suite ≠ coverage of the contract.

### Treat the first 24–72 hours after launch as an hourly reliability gate, not a daily dashboard check
Most launch incidents are hourly-resolution; daily granularity misses them.

### Canary incident auto-disable should live server-side behind service-role updates
Client-only kill switches don't help if the client is broken.

### QA confidence drift happens when docs describe planned suites as implemented
Audit `TEST_GAPS.md` quarterly; planned ≠ shipped.

### When hook dependencies gain auth context, patch hook tests with explicit `useAuth` mocks immediately
A new `useAuth()` dependency breaks every direct `renderHook` suite that didn't already mock it.

### In network-isolated Playwright environments, use app demo mode for UI-layer messaging verification
Don't try to mock network in E2E; ship demo mode and exercise it.

### For event-scale chat gating, enforce thresholds in both mode-resolution and write-validation
Single-layer thresholds get bypassed by direct mutation paths.

### Gate third-party SDK boot on preview/runtime compatibility
Don't boot Sentry / PostHog / RevenueCat in unsupported environments (e.g., SSR, demo mode, capacitor preview).

### Ship new AI renderer paths behind endpoint-level feature flags
Lets you flip back to the previous endpoint without touching UI state logic.

### Explicit `reconnecting` state prevents misleading voice UX
"Connected" + "Disconnected" is a false dichotomy; the third state is real.

---

## Auditing & Dead-Code Removal

### Before "completing" a no-op stub, trace the live call path — a sibling may already persist
A stubbed submit that looks like data loss can be redundant: e.g. AddLinkModal's empty submit was opened only after MediaUrlsPanel.handlePromote already called `createTripLink`, so wiring it would have double-inserted `trip_links`. Confirm who calls the stub and whether the write already happened before deciding delete-vs-complete.

### A "broken stub" can be unreachable — grep every caller before classifying it
MediaSubTabs' entire `type==='urls'` branch (with its Add Link button) was dead because no caller passes `type="urls"`; UnifiedMediaHub routes URLs to MediaUrlsPanel instead. Reachability, not just the TODO comment, decides the fix.

### Scorecard remediation needs a task registry before code motion
When an audit asks for many health scores to reach 90+, create durable issue IDs with DoD and verification before broad refactors. This prevents a mega-PR from mixing architecture, bundle, security, and dead-code work without a rollback path. *Evidence: Atlas remediation kickoff created AHS-01..AHS-19 before implementing the first low-risk slices.*

### Rare export dependencies should load on explicit export intent
Screenshot/export libraries such as `html2canvas` should not sit in route-level bundles when the only user path is clicking Export. Dynamically import them inside the export handler and preserve a print/download fallback. *Evidence: Team org chart export moved `html2canvas` behind `handleExportChart`.*

### Privacy exports need table-level manifests, not silent skips
If an export path catches table fetch errors and still returns `success: true`, users cannot distinguish complete exports from partial compliance failures. Record every section with included/empty/skipped/failed status, and fail hard for required identity, settings, membership, and file tables. *Evidence: AHS-12 added `export-user-data` manifest policy and tests.*

### Smart Import retries must check durable outputs before usage counters
If a parser increments quota before checking whether the same file/type has already been extracted, network retries double-charge users. Check durable extraction records first, return cached payloads, then charge only for new AI work. *Evidence: AHS-14 added file-ai-parser idempotency helpers/tests and moved the existing extraction lookup before `checkAndIncrementSmartImportUsage`.*

### Import workers need explicit terminal status policy
`completed` cannot represent mixed success/failure batches. Derive final status from stats: all success -> `completed`, mixed success/error -> `completed_partial`, all error -> `failed`. *Evidence: AHS-15 added Gmail import status policy/tests and worker wiring.*

### Trip search modals need body portals + explicit Close, not bare Radix autoFocus
Concierge Trip Search froze on iOS because Radix Dialog + HTML autoFocus never reliably focused the field under `.mobile-trip-shell`; use shared `BodyPortalOverlayShell` + `getTrustedOverlayOpenHandlers` for Concierge and Chat Search CTAs (Upload stays an in-DOM file input).

### Mobile chat horizontal overflow must be fixed at every flex boundary
Long assistant markdown/URLs can ignore visual `max-width` when parent flex items keep `min-width:auto`, creating page-level sideways pan and stealing tab taps. Clamp the tab pane to `overflow-x:hidden`, add `min-w-0` at chat/message flex boundaries, and force markdown links to wrap anywhere. *Evidence: May 2026 Concierge mobile fix contained long Japan itinerary responses and restored Media/Payments tab taps.*

### Removing a value from a shared CHECK constraint: widen, don't tighten
When deleting one value from an enum-style `CHECK (col IN (...))` on a SHARED table (e.g. dropping `'sms'` from `notification_deliveries.channel`/`notification_logs.type`), leave the constraint permissive. Historical rows may still carry the value; tightening requires purging/migrating them and risks failing on prod data for zero gain. Stop *producing* the value at its source (the fan-out trigger) instead. *Evidence: 20260604120000_remove_sms_notifications.sql recreated queue_notification_deliveries() to emit push+email only and marked queued sms rows skipped, while leaving the CHECKs widened.*

### To remove a delivery channel, recreate the producer before dropping its objects
Order matters when surgically removing a channel woven into a shared dispatcher: (1) `CREATE OR REPLACE` the fan-out trigger function to stop emitting the channel, (2) neutralize already-queued rows (`status='skipped'`, preserve audit history), (3) drop dependent triggers→functions→table→columns in dependency order, (4) `CREATE OR REPLACE` any shared function that *referenced* the dropped columns so it is column-safe. plpgsql resolves RECORD field access at runtime, so a CASE arm that referenced `v_prefs.sms_enabled` only breaks if that arm executes — recreate it anyway to avoid a latent failure. *Evidence: should_send_notification had two overloads; the surviving 3-arg version referenced sms columns only in its unreached `WHEN 'sms'` arm and was recreated column-safe.*

### A "voice-related" file is often shared with the text path — grep consumers before deleting
During LiveKit removal, `_shared/vertexAuth.ts` (used by concierge-tts + fcmV1), `voiceToolDeclarations.ts` (text concierge), and the generic `formatTimeForTimezone` helper (living inside smsTemplates.ts, used by event-reminders push) all *looked* removable by name but were shared. Grep every importer before deleting a file whose name matches the feature you're removing; relocate genuinely-shared helpers rather than deleting them. *Evidence: formatTimeForTimezone was moved to notificationUtils.ts and event-reminders repointed, instead of being deleted with smsTemplates.ts.*

### Demo-trip data path: gate on the structural id, not the demo-mode flag
The onboarding "Couldn't Load Trip" failure was a race: an effect in `Index.tsx` cleared demo mode for unauthenticated users (`!user && demoView==='app-preview' → setDemoView('off')`) and had `demoView` in its deps, so the onboarding handler's own `setDemoView('app-preview')` re-triggered it and turned demo mode back off before `/trip/1` rendered. Two-part fix: (1) read `demoView` imperatively (`useDemoModeStore.getState().demoView`) and drop it from the effect deps so intentional activation doesn't self-cancel; (2) gate the demo fast path in `useTripDetailData` on `isDemoTrip(tripId)` alone (numeric ids 1–12 are structurally demo; real trips are UUIDs) instead of `isDemoMode && isDemoTrip(tripId)` — so demo trips load local data with no Supabase/RLS/auth even if the flag flickers. *Evidence: useTripDetailData.ts shouldUseDemoPath change + Index.tsx race-fix; resilience test asserts trip '1' loads with isDemoMode=false and no network.*

### Don't captureException for expected non-fault states (logged-out on a real trip)
When adding error-categorization logging to a data hook, an unauthenticated visit to an auth-gated resource is an EXPECTED state (we render a sign-in prompt), not a fault. Capturing it via `errorTracking.captureException` floods the error tracker on every logged-out link click and buries real failures. Use `addBreadcrumb`/`captureMessage` at info level for the expected path; reserve `captureException` for genuine fetch rejections. Also classify on structured fields first (Postgres `code` 42501/PGRST116, HTTP `status`) — RLS denials often lack the word "permission" in `.message`. *Evidence: useTripDetailData.ts structured-logging effect; surfaced by pre-push /code-review.*

### Run only ONE vitest instance at a time — concurrent runs cause phantom "Loading chunk failed"
Overlapping `vitest run` invocations (and stray `pkill -f vitest`) produce misleading "Loading chunk N failed / Importing a module script failed" errors and flaky pass/fail that look like regressions but aren't. Confirm `ps aux | grep -c '[v]itest'` is 0 before starting a run, and verify a suspected-broken suite in isolation. To prove a failure predates your change, `git stash push -- <file>` the relevant files — if it reports "No local changes to save", you never touched them and the failure is pre-existing. *Evidence: chatSearchService + smartImport/agenda suites failed under concurrency and on clean HEAD (untouched files), unrelated to the demo fix.*

## 2026-06-07 — Mobile landscape can still be `isMobile` in JS breakpoints

When `useIsMobile()` intentionally includes tablets / mobile webviews up to 1024px, landscape phones like 844×390 remain on the mobile branch and will not receive desktop Tailwind grid classes. For Trips-style card grids, add a CSS orientation media query on a stable grid class instead of branching in React; this preserves mobile-specific wrappers such as swipe rows while still using landscape width efficiently. Also pair fixed bottom tab bars with content-level `padding-bottom: calc(tab-bar-height + env(safe-area-inset-bottom) + buffer)` because a spacer rendered after content does not always protect the last card's in-card actions during short landscape scrolls.
### Mobile reorder entry should be explicit, not long-press-only
Long-press drag activation on iOS/webview conflicts with scroll, context gestures, and exit discoverability. Prefer a visible card/menu action that enters a scoped reorder mode, disables competing swipe/action surfaces while active, and provides a tap/Done exit path with persistence rollback on save failure. Evidence: Trips dashboard Move Trip flow now uses overflow-menu entry plus existing `dashboard_card_order` persistence instead of wrapper-level long-press activation.

### Play Console native warnings require the artifact-producing native source
When Google Play reports Android framework/library callsites, first verify the checked-out repo contains the native project that produced the AAB; otherwise add a release gate/runbook rather than making web-only changes that cannot affect the artifact.

### App Review compliance paths must be directly discoverable, not merely present
For account deletion, having a backend/RPC and a nested settings flow is insufficient if reviewers cannot find it quickly; expose the action from the obvious signed-in account/profile row and keep it routed to the same canonical deletion flow. *Evidence: June 17, 2026 App Review 5.1.1(v) remediation added Profile → Account → Delete Account as a direct entry point while preserving ConsumerGeneralSettings as the single deletion flow.*

### App Store rejection fixes for the native shell live in chravel-mobile, not chravel-web
`chravel-web` is only the WebView payload; the iOS binary, `Info.plist` (`UIBackgroundModes` — e.g. background-audio under Guideline 2.5.4), entitlements, and Associated Domains live in the separate `chravel-mobile` Expo/EAS repo. chravel-web owns only the AASA file (`public/.well-known/apple-app-site-association`), the Supabase OAuth flow, and the `window.ChravelNative` bridge contract (`src/utils/nativeBridge.ts`). Before "fixing" an App Store rejection here, confirm which repo owns the artifact — most native-config rejections cannot be resolved from chravel-web and need a chravel-mobile change plus an App Store Connect reply. *Evidence: June 2026 2.5.4 + 2.1(a) rejection; PR #746 shipped the web half (native id-token path), native config deferred to chravel-mobile.*

### Stream message search text must use the SDK query string path
`channel.search('term', options)` triggers Stream full-text search; `channel.search({ text: 'term' }, options)` is a message-filter path and can miss normal chat body text like “join this trip”.

### Demo mode flags must not override real entity identity
When a flow has both a demo-mode flag and a production UUID/entity ID, classify the entity first; stale local demo state must never route real-user writes or share links into mock/demo paths.

### Subscription marketing copy must be enforced by entitlement parity tests
When pricing cards advertise limits or role/channel access, assert those claims against `BILLING_PRODUCTS`, `FEATURE_LIMITS`, and `FREEMIUM_LIMITS` together so display copy cannot drift from actual gates.

### AI quota copy must be changed in both client and edge limit maps
Concierge query caps are duplicated across UI copy, client helpers, and Supabase edge usage policy; changing a free/paid quota requires grep-driven updates plus parity tests for `FEATURE_LIMITS`, `FREEMIUM_LIMITS`, and `CONCIERGE_TRIP_QUERY_LIMITS`.

## Design System & Theme

### Fix light-mode regressions at semantic tokens before screen-level patches
When light mode feels muddy across many surfaces, repair `background/card/popover/surface/ink/input/border/ring` tokens and shared primitives first; one-off page colors multiply inconsistencies and miss PWA safe-area/toast/modal surfaces.
### Landing scroll reveals: use positive rootMargin + idle chunk prefetch, never negative-margin whileInView on full-viewport sections
`whileInView` with negative viewport margins (`margin: '-40px'`) on the marketing landing left fast scrollers (PgDn / nav-dot jumps) staring at fully blank pre-reveal sections — on the black theme this reads as a full-screen gap between sections. Fix pattern: positive bottom rootMargin (`'0px 0px 25% 0px'`) so reveals start before entry, plus `requestIdleCallback` prefetch of all lazy section chunks in `FullPageLanding` so Suspense's `min-h-screen` SectionLoader never appears mid-scroll. *Evidence: July 2026 homepage redesign — video review flagged a viewport-height black gap at the features/use-cases seam; both fixes together eliminated it.*

### [data-marketing] typography must be opt-in classes, not bare element/sibling selectors
A bare `[data-marketing] h2 + p { font-weight: 300; margin: auto; max-width: 64ch }` rule leaked into every marketing-shell surface: pricing gold chips (bold black-on-gold subline dropped to weight 300) and blog articles (byline + first paragraph of each section restyled/centered). Marketing landing typography treatments should use opt-in classes (`.marketing-lede`, `.no-display-serif`, `.no-text-shadow`) because `MarketingApp` wraps /blog and /use-cases in the same `data-marketing` scope as the landing. *Evidence: July 2026 homepage redesign semantic review findings 1–2.*

### computer-use mobile QA: confirm device emulation actually applied before trusting results
A computer-use pass reported "hamburger menu missing at 390px" because DevTools device toolbar wasn't actually active — the screenshots were still 1440px desktop rendering. Before acting on mobile QA findings, verify the screenshot content is genuinely narrow/single-column (or have the agent confirm the Dimensions bar reads the target size). *Evidence: July 2026 homepage redesign QA — retest with confirmed iPhone 12 Pro emulation showed the `lg:hidden` hamburger working correctly.*

### Kill-switch defaults must match product-critical shipped controls
If a visible primary control is meant to work by default, do not gate its mounted handler behind a `false` feature-flag fallback; use the flag only as a remote kill switch so missing flag rows do not turn production UI into a no-op.

### Concierge Search auto-closes when isActive is stale from tab render deps
`renderTabContent` that computes `isActive={activeTab === tabId}` must list `activeTab` in its `useCallback` deps. Omitting it freezes Concierge at `isActive=false` after first visit, and the inactive effect immediately closes Search / cancels conversation mode — Search looks dead. *Evidence: July 2026 Concierge controls repair; MobileTripTabs.navigation regression asserts live isActive=true.*

### Realtime voice unmount cleanup must not depend on stop identity
`useEffect(() => stop, [stop])` aborts a freshly started session when caption helpers change `stop`'s reference across renders. Use a `stopRef` + empty-deps unmount cleanup, and lazy-mount `useRealtimeVoice` only after the waveform tap. *Evidence: July 2026 Concierge waveform no-op fix.*

### App Store Concierge: waveform dictation beats unstable realtime as default
When a prominent control (waveform) starts bidirectional realtime voice that remains flaky across LiveKit/Gateway iterations, ship Web Speech dictation on that control for launch and keep realtime behind `concierge_realtime_voice` (default OFF). Also remove duplicate in-field mics so Search / Attach / Dictate / Send is one clear mental model. *Evidence: July 2026 App Store simplification — PR waveform→dictation; flag disabled in prod.*

### Chat tabs that filter the in-memory timeline silently lose off-window history
The Broadcasts and Pinned tabs derived content by filtering the live Stream window (30 loaded / 250 retained), so anything older vanished from the tab while the unread badge (computed elsewhere) still counted it. Fix pattern: on tab activation, fetch tab-specific history server-side (`channel.search({message_type:{$eq:'broadcast'}})`, `channel.getPinnedMessages`) and merge under the live window with live-wins dedupe; always degrade to the window filter on fetch failure. Also keep every classifier for the same concept on ONE predicate — `isBroadcast` used `message_type` only while the badge also matched `privacy_mode`, which is exactly how "badge shows 3, tab shows empty" happens. *Evidence: July 2026 Stream chat hardening — user screenshots of empty Broadcasts tab with nonzero badge on a PRO trip.*

### Full-screen error cards must never replace already-loaded chat history
TripChat swapped the whole timeline for a "Something went wrong" card whenever `chatError` was set — even when 250 messages were already hydrated, making users think their chats were deleted. Gate terminal error/loading UI on `messages.length === 0`; with history present, render a slim retry banner above the preserved list. *Evidence: July 2026 chat-tabs fix; TripChat.renderPath regression test "keeps loaded history visible behind a retry banner".*

### pg_cron service-role bearer via app.settings GUC is silently broken if never provisioned
Every cron job here builds `Authorization: Bearer ' || current_setting('app.settings.service_role_key', true)`, but that GUC was never set at database/role/vault level — so the header is empty, verifyCronAuth 401s, and jobs fail forever with zero user-visible signal (dispatch-notification-deliveries: 2880/2880 failures over 2 days; one job also had `... || '"}'::jsonb` binding the cast to the bare literal → JSON parse error). Before scheduling any cron that calls an edge function, verify the GUC actually resolves (`SELECT current_setting('app.settings.service_role_key', true)`) and check `cron.job_run_details` for the pattern you're copying. *Evidence: July 2026 prod audit SQL against cron.job_run_details.*
### Meta CSP and vercel.json CSP must both allow AI Gateway hosts
When production serves a meta CSP (and may omit the HTTP CSP header), `index.html` `connect-src` must include `https://ai-gateway.vercel.sh` and `wss://ai-gateway.vercel.sh` or realtime voice WebSockets fail after mint. Align meta with `vercel.json` whenever gateway hosts change. *Evidence: July 2026 Concierge recovery — live chravel.app meta CSP lacked AI Gateway while vercel.json already listed it.*

### Prove TestFlight web asset provenance before rewriting Concierge controls
July 9 Search/isActive + realtime lazy-mount fixes were already on `main` and in production `mrex8prk` chunks. Multi-control dead UI on a screenshot matching that chrome is often deployment drift (`chravel-mobile` remote vs bundled) or CSP — not a reason to re-implement working handlers. *Evidence: production chunk markers `header-search-btn` / `mint-realtime-token` present before recovery branch.*

### Launch-critical E2E fixtures need an explicit release-gate mode
Local Playwright runs can skip authenticated setup when staging secrets or confirmation-free auth are unavailable, but CI/App Store QA must fail instead of reporting green with skipped launch-critical coverage. Centralize the mode flag (`CHRAVEL_E2E_RELEASE_GATE=1`) and throw fixture-step errors (`[E2E fixture step failed: auth|trip creation|membership|pro trip creation] ...`) from shared fixtures so failures identify the broken setup step. *Evidence: July 2026 chat messaging E2E release-gate hardening.*

### Prefer `@`/`vs` over bare `at` for home/away schedule classification
Bare `at` matches venue phrases ("Trivia Night at Joe's"). Use `@` and `vs`/`versus` title cues (or explicit labels) so unknown events stay importable instead of being silently filtered.

