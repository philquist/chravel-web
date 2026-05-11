# Lessons

> Reusable engineering lessons extracted from debugging and implementation work.
> Read relevant entries before planning. Update after meaningful tasks. Merge, don't duplicate.

---

## Strategy Tips

### User-trip realtime subscriptions need deterministic backfill triggers
- **Tip:** For dashboard trip hydration, treat realtime as an accelerator, not the only source. Invalidate trips when the channel reaches `SUBSCRIBED` again after the initial subscription (reconnect/resubscribe path), and when the app returns to foreground (`focus` / visible tab), so missed websocket events do not strand approved users in stale pending state. Avoid invalidating on the very first `SUBSCRIBED` if the same mount already ran an initial trip fetch, or you duplicate refetches without adding recovery value.
- **Applies when:** `useTrips` depends on `trip_members` / `trip_join_requests` realtime events for approval state transitions.
- **Avoid when:** A dedicated polling cadence already guarantees state convergence and additional invalidations would cause unacceptable load.
- **Evidence:** Users could remain stale after approval if app backgrounding or reconnect timing dropped realtime events; adding reconnect + foreground backfills restored deterministic hydration.
- **Provenance:** April 2026 PR #416 follow-up audit.
- **Confidence:** high

### Trip preview CTA should resolve membership and join-request status together
- **Tip:** In shared/public trip preview surfaces, don't gate CTA behavior only on `active_invite_code` + `trip_members`. Also read the latest `trip_join_requests.status` for the signed-in user so pending requesters get a deterministic status route instead of a dead-end "invite still setting up" toast.
- **Applies when:** `/trip/:tripId/preview` or branded `/t/:tripId` pages determine where authenticated non-members should be sent.
- **Avoid when:** Product explicitly wants to hide request status from preview users.
- **Evidence:** Users with pending requests could hit "Open in ChravelApp" while `active_invite_code` was null and receive no navigation; adding join-request status fallback changed CTA to "View Request Status" and navigated to Home requests context.
- **Provenance:** April 2026 trip invite flow hardening follow-up.
- **Confidence:** high

### Dashboard request cards and request counters must share the same outbound source-of-truth
- **Tip:** If request cards can render from fallback outbound join-request rows when pending trips are not projected yet, derive the Requests counter from the same outbound rows (or a deterministic max merge) to prevent `0 Requests` while cards are visible.
- **Applies when:** Home dashboard combines `useTrips` pending membership rows with `useDashboardJoinRequests` outbound rows.
- **Avoid when:** Product intentionally separates “pending memberships” and “outbound requests” into distinct widgets/counters.
- **Evidence:** Pending cards rendered from outbound fallback while stats relied only on `membership_status='pending'` trips, producing count/card drift; aligning count derivation removed the mismatch.
- **Provenance:** April 2026 pending join-request hydration/count drift fix.
- **Confidence:** high

### If a request card depends on joined trip metadata, ship a requester-scoped RPC instead of UI fallback mappers
- **Tip:** When frontend relationship joins can fail (missing PostgREST relationship metadata or RLS join nulls), move pending-request card hydration to a single requester-scoped SQL RPC that returns safe card fields (`title`, `destination`, `dates`, `cover`, `member_count`, `places_count`) and consume that same query for both rendered cards and counts.
- **Applies when:** Dashboard shows pending join requests that need trip metadata but users are not approved members yet.
- **Avoid when:** Existing table relationship joins are guaranteed and verified across all environments (local/prod) with matching RLS behavior.
- **Evidence:** Dashboard fallback mapper kept rendering `Trip`/`Untitled trip` placeholders because raw join-request rows were sparse; replacing with `get_my_pending_trip_request_cards` removed placeholder projection and unified desktop/mobile count+card sources.
- **Provenance:** April 2026 pending-request source-of-truth repair.
- **Confidence:** high

### Keep pin/unpin mutations inside shared chat hooks, not UI surfaces
- **Tip:** UI components should call a shared `togglePin` hook method and avoid local Stream client mutation guards/calls, so Trips/Pro Trips/Events all execute identical pin payload logic and error handling.
- **Applies when:** Message action menus in shared chat components (e.g., `TripChat`) invoke pin/unpin.
- **Evidence:** Removing a redundant `streamClient` gate in `TripChat` kept pinning delegated to `useStreamTripChat.togglePin` (`partialUpdateMessage`) and eliminated surface-specific divergence risk.
- **Provenance:** April 2026 pin-path hardening follow-up.
- **Confidence:** high

### In transport-mixed chat surfaces, propagate transport mode to the mutation trigger component
- **Tip:** If a parent surface supports both Stream and legacy transports, ensure the final mutation-triggering UI element (for example message action menu) receives explicit `transportMode`. Relying on an intermediate default (`'legacy'`) can silently route Stream edits/deletes into DB mutation APIs.
- **Applies when:** Chat/message components pass edit/delete callbacks through `MessageItem`/`MessageBubble` style wrappers.
- **Avoid when:** The entire surface is hard-wired to one transport and has no fallback path.
- **Evidence:** `MessageBubble` forwarded callbacks but not `transportMode`, so `MessageActions` defaulted to legacy and could call `chatService` despite Stream mode callbacks being present upstream.
- **Provenance:** April 2026 Stream-canonical mutation-path guardrail fix.
- **Confidence:** high

### When hook dependencies gain auth context, patch hook tests with explicit useAuth mocks immediately
- **Tip:** If a shared hook adds a hard `useAuth()` dependency, every direct `renderHook` suite should mock `@/hooks/useAuth` (or render with `AuthProvider`) in the same change; otherwise broad readiness-gate failures can trigger on identical context errors.
- **Applies when:** Hook-level tests render authenticated chat/data hooks directly via `renderHook`.
- **Avoid when:** The suite already renders a real provider wrapper intentionally.
- **Evidence:** `qa:chat-production-readiness` failed 12 tests with `useAuth must be used within an AuthProvider` until `useStreamTripChat.send` and `.reactions` tests mocked `useAuth`.
- **Provenance:** April 23, 2026 chat production-readiness gate recovery.
- **Confidence:** high

### Ship new AI renderer paths behind endpoint-level feature flags
- **Tip:** When introducing a new model-specific renderer (for example Gemini TTS) in a production flow, switch endpoints behind a frontend feature flag while preserving the previous endpoint contract as a fallback. This isolates model preview risk from core UX and enables instant rollback without touching UI state logic.
- **Applies when:** Replacing third-party model/provider calls for non-critical enhancements (voice playback, summarization, enrichment) in existing user journeys.
- **Evidence:** Concierge speak-back rollout added `VITE_CONCIERGE_TTS_ENABLED` to toggle `gemini-tts` vs `concierge-tts` while keeping the same `useConciergeReadAloud` playback orchestration and auth token handling.
- **Provenance:** April 2026 Gemini 3.1 Flash TTS integration pass.
- **Confidence:** high


### Never ship baked Supabase credentials as runtime fallback in production clients
- **Tip:** Treat Supabase public key + project URL as required runtime configuration and fail fast when missing. Hardcoded fallback credentials can silently go stale after key rotation and create partial outages that are hard to diagnose.
- **Applies when:** Bootstrapping Supabase client in frontend apps, rotating JWT/API keys, migrating from anon JWT keys to publishable keys.
- **Avoid when:** Local throwaway demos where backend project is intentionally fixed and non-production.
- **Evidence:** Chravel client previously booted with built-in Supabase URL/anon key fallback; key rotation introduces drift risk when env injection is missing. Removing fallback and validating `VITE_SUPABASE_URL` + (`VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY`) hardens rollout safety.
- **Provenance:** April 2026 Supabase key-rotation hardening pass.
- **Confidence:** high

### Always distinguish Loading, Not Found, and Empty states
- **Tip:** When building data-dependent UI, explicitly handle three distinct states: Loading (fetch in progress), Not Found (fetch completed, resource missing or inaccessible), and Empty (fetch completed, resource exists but has no items). Never let a loading state fall through to a Not Found or Empty render path.
- **Applies when:** Trip loading, any auth-gated data page, lists that can be empty, resource detail views
- **Avoid when:** Static pages with no data dependencies
- **Evidence:** Documented as zero-tolerance path in CLAUDE.md. Recurring Trip Not Found regression pattern caused by conflating loading with not-found during auth hydration.
- **Provenance:** CLAUDE.md § Security Gate / UI Safety; historical Trip Not Found regressions
- **Confidence:** high

### Trace field names end-to-end before patching data bugs
- **Tip:** When a data value renders incorrectly, trace the field from DB schema → Supabase types → hook/query → component props → render. Fix at the source layer, not via mapping hacks. Field name mismatches between layers are a historically common Chravel regression.
- **Applies when:** Data displays wrong value, type errors on data fields, query returns unexpected shape
- **Avoid when:** Pure UI/styling bugs with no data dependency
- **Evidence:** Documented in AGENTS.md § 5.2 as a stop-the-line bug class. Multiple historical incidents of DB ↔ client type ↔ UI prop mismatches.
- **Provenance:** AGENTS.md § 5.2 Field Name Mismatches
- **Confidence:** high

### Dashboard "Requests" UI should use outbound `dashboardJoinRequests` as single source
- **Tip:** If the product intent is “my pending join requests,” derive both request cards and request counters from `useDashboardJoinRequests` outbound rows only, and avoid rendering legacy `pendingTrips` cards in default trip views.
- **Applies when:** Home dashboard requests tab and stats (`TripGrid`, `TripStatsOverview`, `Index` request counts).
- **Avoid when:** Product explicitly wants inbound approval workload mixed into the same metric.
- **Evidence:** `TripGrid` was rendering `pendingTrips` in non-requests my-trips view while requests tab rendered `dashboardJoinRequests`; this duplicated pending cards and drifted from request counts. Switching to outbound-only requests source removed duplicate cards and aligned stats.
- **Provenance:** April 2026 dashboard pending-card consolidation fix.
- **Confidence:** high

### Branded OG hosts should never be used as app CTA destinations
- **Tip:** For unfurl/preview domains (e.g., `p.chravel.app`), keep `canonicalUrl` aligned to the branded share URL for cache correctness, but always set CTA/app redirect base to the interactive app host (`https://chravel.app`). Otherwise "Open in app" can loop users back to static OG HTML instead of join flows.
- **Applies when:** Proxying shared preview pages through Edge Functions (`/t/:tripId`, invite cards, social previews) that render OG HTML plus CTA links.
- **Avoid when:** The host itself serves the full interactive SPA and is intentionally the app origin.
- **Evidence:** Trip share links on `p.chravel.app/t/:tripId` rendered OG HTML and lacked request-to-join path completion; forcing `appBaseUrl=https://chravel.app` in the proxy restored navigation to `TripPreview`/`JoinTrip`.
- **Provenance:** April 2026 trip invite regression fix.
- **Confidence:** high

### When adding feature parity to a secondary surface, use the existing data layer before adding schema
- **Tip:** When a feature exists in surface A (e.g., TripChat) and needs to be added to surface B (e.g., Channels), first check what shared components and data services already exist. Often the components are reusable but the data layer wiring is missing. Use JSON metadata fields for lightweight data (reply context, link previews) before resorting to schema migrations.
- **Applies when:** Adding threading, link previews, or other chat features to Channels or Broadcasts
- **Avoid when:** The feature requires foreign key integrity or complex queries
- **Evidence:** Channel threading achieved via metadata JSON field instead of new reply_to_id column. Client-side link previews via existing fetch-og-metadata edge function instead of new DB column.
- **Provenance:** Messaging upgrade March 2026 — ChannelChatView threading + link preview parity
- **Confidence:** high

### Unified permission guard hook for multi-trip-type codebases
- **Tip:** When permission models differ by trip type (consumer=open, pro=role-based, event=organizer-only), create a single `useMutationPermissions(tripId)` hook that resolves trip type once and returns flat boolean flags. Import this in every mutation hook rather than duplicating trip-type branching logic. The guard must be client-side UX only — RLS remains authoritative.
- **Applies when:** Adding permission checks to shared hooks that serve consumer, pro, and event trips simultaneously
- **Avoid when:** The permission model is identical across all trip types
- **Evidence:** Stage B hardening added `useMutationPermissions` to 5 hooks (tasks, polls, calendar, basecamp, links) with zero call-site changes. Consumer trips return all-true by default, preserving existing behavior.
- **Provenance:** Shared mutation audit Stage B, March 2026
- **Confidence:** high

### Post-create follow-up writes must go through the same invalidating mutation path
- **Tip:** If a create flow performs a second write (for example, uploading a cover image and then updating the created row), route that second write through the same shared hook/service mutation path used elsewhere (`useTrips.updateTrip`) instead of raw table updates in component code.
- **Applies when:** Multi-step create UX where metadata/media is attached after the primary create mutation.
- **Avoid when:** The follow-up write is fully server-side and already emits an event/query invalidation consumed by the UI.
- **Evidence:** Event trip cover photos uploaded in `CreateTripModal` were persisted to `trips.cover_image_url`, but homepage cards stayed stale because the direct `supabase.from('trips').update(...)` bypassed query invalidation. Switching to `updateTrip(...)` fixed immediate homepage reflection.
- **Provenance:** March 2026 Event trip cover photo regression fix.
- **Confidence:** high

### AI tool writes should go through a pending buffer, not directly to shared state
- **Tip:** When an AI agent (voice concierge, text concierge) wants to create shared objects (tasks, polls, calendar events), write to `trip_pending_actions` instead of directly to the target table. The user then confirms or rejects. This prevents AI hallucination-driven data corruption and gives users agency over their shared trip state. Use `tool_call_id` as idempotency key to prevent duplicate pending actions on retry.
- **Applies when:** Any AI-initiated write to shared trip state (tasks, polls, calendar, basecamp)
- **Avoid when:** Read-only AI operations (search, recommendations, summaries) or low-risk append-only operations (saving a link)
- **Evidence:** Stage B routed `createTask`, `createPoll`, and `addToCalendar` through pending buffer in both `functionExecutor.ts` (edge function) and `useVoiceToolHandler.ts` (client). `savePlace` and `setBasecamp` left as direct writes (lower risk).
- **Provenance:** Shared mutation audit Stage B, March 2026
- **Confidence:** high

### AI concierge write tools need explicit React Query invalidation mapping per affected surface
- **Tip:** Treat each concierge write tool as a mutation source that must map to cache keys for every dependent UI surface (trip detail tabs and dashboard lists). Keep this mapping centralized so new tools cannot silently skip cache refresh.
- **Applies when:** Adding/updating concierge tools that mutate trip data (`execute-concierge-tool`, streamed `onFunctionCall` handlers)
- **Avoid when:** Read-only tools with no state mutation
- **Evidence:** `setTripHeaderImage` successfully updated `trips.cover_image_url` but homepage cards stayed stale because `AIConciergeChat` invalidated other write actions yet omitted `['trips']` for this tool; adding centralized mapping + regression test restored refresh behavior.
- **Provenance:** March 2026 Event cover photo homepage refresh regression fix
- **Confidence:** high


### Archive/restore limits must be enforced server-side, not only in client services
- **Tip:** Any plan/quota guard that prevents a state transition (`is_archived=true -> false`, creation caps, paid-tier gates) must execute in an edge function or RPC; client-side checks are UX hints and can be bypassed.
- **Applies when:** Trip restore flows, archive/unarchive actions, entitlement/plan-gated writes.
- **Avoid when:** Pure UI affordance decisions with no mutation side-effects.
- **Evidence:** `archiveService.restoreTrip` previously enforced free-tier active-trip limits only in frontend code before writing directly to `trips`; adding a dedicated `restore-trip` edge function made entitlement resolution and quota checks authoritative.
- **Provenance:** April 2026 trip entitlement + restore guard hardening.
- **Confidence:** high

## Recovery Tips

### Stream moderation controls should execute through an authenticated edge function, not directly from client SDK
- **Tip:** Expose moderation UI affordances (hide message, shadow ban, mute, ban) only for authorized roles client-side, but route execution through a server-side edge function that re-checks trip authorization before calling Stream moderation APIs and writes admin audit logs.
- **Applies when:** Adding role-gated moderation to chat/message surfaces in trip/event/pro contexts.
- **Avoid when:** Action is purely local UX (for example personal block/hide) and does not require org-wide enforcement.
- **Evidence:** `stream-moderation-action` now verifies trip creator/admin/organizer role from Supabase before applying Stream moderation mutations and inserting `admin_audit_logs`; frontend emits structured telemetry success/failure events and shows role-gated controls only when `isUserAdmin`.
- **Provenance:** April 2026 chat moderation controls rollout.
- **Confidence:** high

### Installed-app OAuth requires in-app browser tab + Universal Link deep-link callback
- **Tip:** For Capacitor/PWA shells, do not embed Google/Apple OAuth in the app WebView (Google rejects with `disallowed_useragent`) and do not bounce to the system browser (it strands the shell and often freezes on provider redirects). The correct pattern is: (1) set `skipBrowserRedirect: true` and point `redirectTo` at an HTTPS Universal Link owned by the app (e.g., `https://chravel.app/auth-callback`), (2) launch the provider URL via an in-app browser tab — `@capacitor/browser` gives SFSafariViewController on iOS and Chrome Custom Tabs on Android — and (3) let the native shell intercept the deep link and reload the WebView at the callback URL so Supabase `detectSessionInUrl` completes the exchange. An earlier revision of this repo hard-blocked OAuth in installed contexts instead; that eliminated the freeze but removed Google/Apple sign-in entirely from the native apps, which is the wrong long-term posture.
- **Applies when:** Wrapping a web auth flow in a native shell (Capacitor/Expo/WebView) and offering third-party OAuth providers.
- **Avoid when:** Native SDK sign-in (e.g., `@capacitor-community/apple-sign-in`) is wired and preferred — use the SDK directly rather than going through `signInWithOAuth`.
- **Evidence:** Google blocks embedded WebView OAuth. The web-only "hard-block" fix passed Apple review but left the TestFlight build without Google/Apple sign-in; the current helper `src/utils/installedAuthBrowser.ts` prefers Capacitor Browser with a same-tab fallback so web/PWA keep working regardless of shell capabilities.
- **Provenance:** April 2026 TestFlight OAuth re-enable.
- **Confidence:** high
- **Cross-repo dependency:** The web-side changes here require matching work in `chravel-mobile` (register URL scheme, AASA/assetlinks, `@capacitor/browser`, `appUrlOpen` deep-link listener). Without that, Google still errors out in an embedded webview redirect — strictly worse than the "hidden buttons" state. Land both or neither.

### Universal Link short paths must be present in the shipped AASA source-of-truth, not just API helpers
- **Tip:** If production invite links use a short path like `/j/:code`, that exact path must exist in the deployed `apple-app-site-association` payload the app host actually serves. Updating only an API generator or docs is not enough if Vercel/public static files remain the effective source-of-truth.
- **Applies when:** iOS invite links or auth callbacks unexpectedly open in Safari instead of handing off to the installed app.
- **Avoid when:** The host serves the AASA exclusively from one verified endpoint and there is no parallel static copy.
- **Evidence:** Chravel's live AASA claimed `/join/*` but not `/j/*`, so Slack-shared `https://chravel.app/j/...` invites were not eligible for Universal Link handoff even though `api/aasa.ts` already listed `/j/*`. Updating the shipped `public/.well-known/apple-app-site-association` restored parity with actual invite URLs.
- **Provenance:** April 2026 invite auth/deep-link regression fix.
- **Confidence:** high

### Fire-and-forget sync paths must emit structured failure signals
- **Tip:** If a non-critical sync step intentionally runs fire-and-forget (for example membership projection into Stream after a successful Supabase mutation), never leave `.catch(() => {})` empty. Emit structured logs with operation + identifiers so support can trace drift and replay safely.
- **Applies when:** Client-side best-effort projections to external systems (Stream membership sync, analytics mirrors, webhook side effects).
- **Avoid when:** The operation is fully deterministic/idempotent and already has server-side retry + alerting with equivalent context.
- **Evidence:** Join/leave/member-removal flows were swallowing Stream membership sync failures, creating silent drift and low operator visibility. Adding centralized `reportStreamMembershipSyncFailure(...)` at call-sites restored debuggability without changing user-facing success flow.
- **Provenance:** April 2026 Stream chat hardening follow-up.
- **Confidence:** high

### Edge Function "Failed to fetch" in browser is usually a CORS-origin drift, not a DB insert bug
- **Tip:** When a core mutation fails with a raw browser `TypeError: Failed to fetch` (especially via `supabase.functions.invoke`), verify the frontend origin against Edge Function CORS allowlist first. If the origin is missing, the network call is blocked before your handler/DB code runs.
- **Applies when:** A user-facing mutation to an Edge Function fails with generic fetch error and no structured JSON error body.
- **Avoid when:** The function responds with a normal 4xx/5xx payload (that indicates handler executed and CORS likely passed).
- **Evidence:** Trip creation path (`CreateTripModal -> useTrips -> tripService -> create-trip`) surfaced only `Failed to fetch` until `.lovable.dev` was re-added to shared CORS origins and error mapping was made actionable.
- **Provenance:** March 2026 trip creation forensic fix.
- **Confidence:** high

### OAuth callbacks should preserve same-origin session context by carrying redirect URI in signed state
- **Tip:** For web OAuth flows triggered from multiple approved origins (production, localhost, preview), generate redirect URI from the initiating origin and include it in the signed state payload. Reuse that URI during code exchange so users return to the same origin where their auth session exists.
- **Applies when:** Edge function handles OAuth `connect` + `callback` for browser clients across multiple environments.
- **Avoid when:** Native mobile deep-link flows that use custom URL schemes instead of same-origin web callbacks.
- **Evidence:** Gmail connector intermittently failed because connect flow could fall back to a hardcoded production callback URL; preview/local users were redirected to a different origin and arrived unauthenticated at callback. Whitelisting additional redirect URIs and validating/echoing the URI via signed state removed cross-origin session drift.
- **Provenance:** April 2026 Gmail OAuth reliability hardening.
- **Confidence:** high

### Secured Supabase storage buckets require signed URLs for client previews
- **Tip:** When a storage bucket transitions from public read to RLS-protected read, any UI code still using `getPublicUrl()` will silently regress into broken images/files. Resolve previews via `createSignedUrl()` (or a shared resolver) at read time.
- **Applies when:** Rendering files from `trip-media` (or any bucket with authenticated `SELECT` policies) in event tabs, galleries, chat attachments, or media cards.
- **Avoid when:** The bucket is intentionally public and policy explicitly allows anonymous read for that path.
- **Evidence:** Line-up file thumbnails showed broken image placeholders while metadata loaded correctly because `useEventLineupFiles` used public object URLs after `trip-media` hardening.
- **Provenance:** March 2026 Line-up image loading bug fix.
- **Confidence:** high

### Gate third-party SDK boot on preview/runtime compatibility
- **Tip:** If the Lovable preview looks blank or unstable after a dependency/config change, check startup SDKs first (analytics, billing, native wrappers). A web preview can break or flood logs when a browser-only bundle boots with a native/mobile API key or unsupported runtime. Add a small compatibility gate at the SDK entrypoint instead of scattering checks across the app.
- **Applies when:** App initializes RevenueCat, native plugins, analytics, or other third-party SDKs during `main.tsx` startup
- **Avoid when:** The SDK is already lazy-loaded behind an explicit user action
- **Evidence:** Chravel preview was throwing `Invalid API key. Use your Web Billing API key.` from `@revenuecat/purchases-js` during startup until web initialization was skipped for Lovable preview and non-`rcb_` keys
- **Provenance:** March 2026 preview recovery fix — `src/config/revenuecat.ts`
- **Confidence:** high

## Optimization Tips

### Thread badge UX in Stream timelines depends on parent-level metadata projection, not child message inclusion
- **Tip:** Keep timeline filtering to top-level Stream messages (`!parent_id` / `!reply_to_id`), but explicitly project parent thread fields (`reply_count`, `latest_replies`, and unread/participant markers) into UI view models so thread badges/snippets can render without leaking child replies into the main feed.
- **Applies when:** Trip/pro chat timelines show thread indicators while thread replies are rendered in a separate thread view/modal.
- **Avoid when:** The product intentionally mixes child replies into the main timeline.
- **Evidence:** Parent messages were visible but thread metadata could be empty/zero unless `reply_count` and `latest_replies` were mapped in `streamMessageViewModel`; after projection, `MessageBubble` thread badge/snippet renders from existing props without timeline behavior changes.
- **Provenance:** April 23, 2026 thread metadata adapter hardening.
- **Confidence:** high

### Avoid default `[]` prop literals when callbacks/effects depend on that prop
- **Tip:** If a component prop defaults to `[]` inline (`prop = []`) and that prop is in hook dependency arrays, React creates a fresh array every render and can retrigger callbacks/effects indefinitely. Use a module-level `const EMPTY_LIST = []` (typed) for stable identity.
- **Applies when:** Data-driven components with memoized loaders (`useCallback`) and `useEffect` that depends on props like `members`, `filters`, or `options`.
- **Evidence:** `ThreadView` pagination test surfaced a max-update-depth loop until `tripMembers` default moved to a stable module-level `EMPTY_TRIP_MEMBERS` constant.
- **Provenance:** April 2026 ThreadView pagination/backfill hardening.
- **Confidence:** high


### Bounded chunk concurrency is the safest first optimization for sequential external API loops
- **Tip:** For loops that call external APIs per item (Gmail message fetch + downstream parsing), replace fully sequential `for await` flow with chunked `Promise.all` using a conservative concurrency cap. This reduces wall time dramatically without opening unlimited parallelism that can trigger rate limits or memory spikes.
- **Applies when:** Worker pipelines that process up to N items with independent I/O-bound requests and tolerate out-of-order completion.
- **Avoid when:** Steps depend on strict ordering or mutate shared resources that require serial consistency.
- **Evidence:** `gmail-import-worker` processed up to 120 messages sequentially; switching to `processInChunks(..., 6, ...)` cut a synthetic 120-item 25ms/request benchmark from ~3048ms to ~510ms (~83.3% faster) while preserving existing per-message logging/error handling.
- **Provenance:** April 2026 Gmail import worker performance pass.
- **Confidence:** high

### Parallelizing handlers can break check-then-insert dedupe paths without DB uniqueness
- **Tip:** Before parallelizing workloads, identify any `SELECT existing` -> `INSERT` dedupe logic. If the table lacks a unique constraint, parallel handlers can both observe “empty” and insert duplicates. Protect with DB uniqueness + `ON CONFLICT` when possible; otherwise serialize only the critical dedupe write section with an app-level mutex.
- **Applies when:** Background workers, importers, and parsers move from sequential loops to chunked/parallel handlers.
- **Avoid when:** You already have strict DB uniqueness + conflict handling on the dedupe key.
- **Evidence:** `gmail-import-worker` parallel message processing introduced a race on `smart_import_candidates` dedupe check (`trip_id` + `dedupe_key`) because no unique DB constraint exists. Serializing the check+insert critical section removed cross-message duplicate risk while preserving parallel fetch/parse stages.
- **Provenance:** April 2026 Gmail import worker follow-up hardening.
- **Confidence:** high

### useEffect dependencies on array state cause O(N) re-execution storms
- **Tip:** When a useEffect depends on a TanStack Query array (like `liveMessages`), it fires on every cache update. If the effect does work proportional to array length (fetching reactions for all messages, marking all as read), it creates O(N) work on every INSERT. Use a ref to track what's already been processed and only handle new items.
- **Applies when:** Any useEffect that processes a growing array of messages, notifications, or list items
- **Avoid when:** The effect truly needs to reprocess all items (e.g., full re-render)
- **Evidence:** Chat reaction refetch + read receipt storms both caused by this pattern
- **Provenance:** March 2026 chat reliability audit
- **Confidence:** high

### Supabase realtime subscriptions without table-column filters receive ALL events globally
- **Tip:** `postgres_changes` subscriptions with no `filter` parameter on tables like `message_read_receipts` (which lack a `trip_id` column) receive INSERT events for ALL rows across ALL trips. This is invisible at low scale but becomes a bandwidth/CPU problem. Either add a filterable column to the table or use client-side filtering with a Set of known IDs.
- **Applies when:** Subscribing to any table that doesn't have the scoping column (trip_id) needed for a filter
- **Evidence:** read_receipts and reactions subscriptions both had this issue
- **Provenance:** March 2026 chat reliability audit
- **Confidence:** high

### Always backfill on realtime channel reconnect — Supabase does not replay missed events
- **Tip:** Supabase realtime `postgres_changes` does NOT buffer or replay events missed during a websocket disconnection. On reconnect (channel status returns to SUBSCRIBED), you must fetch the gap yourself using the last known server timestamp. Also handle `visibilitychange` for mobile background/foreground transitions.
- **Applies when:** Any feature using Supabase realtime where data loss during connectivity gaps is unacceptable
- **Evidence:** Chat messages were silently lost during websocket drops with no user-visible indication
- **Provenance:** March 2026 chat reliability audit
- **Confidence:** high


### Explicit `reconnecting` state prevents misleading voice UX
- **Tip:** For realtime voice sessions, avoid overloading `requesting_mic` during auto-reconnect. Use a dedicated `reconnecting` state so the UI can communicate retry intent and avoid permission confusion after mid-session socket failures.
- **Applies when:** WebSocket reconnect loops in live audio/chat interfaces
- **Avoid when:** First session initialization before any successful connection
- **Evidence:** Gemini Live auto-reconnect paths were previously mapped to `requesting_mic`; inline status looked like fresh mic permission setup instead of network recovery. Adding `reconnecting` improved state-machine clarity and user feedback while preserving containment in the chat window.
- **Provenance:** March 2026 concierge live-mode hardening
### Ship live voice behind a hard UI kill switch until control-plane and data-plane checks both pass
- **Tip:** Keep a simple top-level UI gate (for example `DUPLEX_VOICE_ENABLED`) for live voice CTA rendering so product can instantly hide entry points without deleting architecture when external dependencies are unstable.
- **Applies when:** Voice stacks that depend on external worker infrastructure (LiveKit workers, third-party AI keys, service-role tool bridges).
- **Avoid when:** The voice path is fully offline/local and has no external control-plane dependencies.
- **Evidence:** Live voice failures can originate outside frontend code (missing LiveKit/Supabase secrets, worker offline, agent-dispatch mismatch). Hiding the CTA prevented repeated user-facing breakage while preserving the existing LiveKit hooks and edge functions for rapid re-enable.
- **Provenance:** April 2026 LiveKit forensic pass + fallback hardening.
### Notification deep-link mappers should read both metadata and first-class columns
- **Tip:** When notification rows store routing identifiers in both dedicated columns (e.g., `notifications.trip_id`) and metadata JSON, mapping code should prefer metadata but fall back to column values. Legacy rows and mixed writer paths (RPC helper vs direct inserts) often populate only one.

### Requests dashboard should render from pending trip projections, not join-request rows alone
- **Tip:** For “My pending join requests” UX, use pending trip rows already projected by `useTrips` (`membership_status='pending'`) as the primary card source and stat counts. Keep raw `trip_join_requests` rows only for request-id actions (cancel) and fallback rendering.
- **Applies when:** Home dashboard Requests tab/cards/counts in `Index` + `TripGrid`.
- **Avoid when:** Building admin moderation queues where requester-centric metadata is the primary object.
- **Evidence:** `useDashboardJoinRequests` relation-heavy fetch can fail/partially hydrate in schema/RLS drift scenarios, yielding zero visible requests; pending trip projections remained aligned with card rendering requirements and enabled consistent card parity across dashboard sections.
- **Provenance:** April 2026 requests-tab regression fix.
- **Confidence:** high

### Keep OG proxy rewrites on share entry paths only, never on SPA destination paths
- **Tip:** If OG HTML uses meta-refresh/CTA to a SPA route, do not also rewrite that SPA route back to the OG proxy. Otherwise you create a deterministic redirect/render loop.
- **Applies when:** Vercel/edge rewrites for share surfaces like `/t/:tripId` and interactive routes like `/trip/:tripId/preview`.
- **Avoid when:** The rewritten destination is pure API and never used as a browser navigation target.
- **Evidence:** `/trip/:tripId/preview` rewrite to `api/trip-preview` caused infinite refresh: proxy served HTML that redirected back to `/trip/:tripId/preview`, which was rewritten again.
- **Provenance:** April 2026 trip preview loop hotfix.
- **Confidence:** high
- **Applies when:** Building in-app notification lists, badge payload mappers, or tap-to-route logic.
- **Avoid when:** The schema enforces a single canonical field and legacy data is guaranteed migrated.
- **Evidence:** Join approval notifications were visible but lacked actionable routing in-app because mapper read only `metadata.trip_id` and ignored `trip_id` column from direct inserts.
- **Provenance:** March 2026 join approval forensic fix (`useNotificationRealtime` mapping hardening).
- **Confidence:** high

### Notification click routing should be metadata-first and carry chat bootstrap context
- **Tip:** Resolve notification route from explicit metadata keys (`trip_id`, `trip_type`, `channel_type`) before falling back to inferred fields, and attach a route-state chat context marker when deep-linking to chat tabs. This keeps mention taps deterministic across consumer/pro/event routes and reduces chat boot timing races after auth/trip hydration.
- **Applies when:** Notification list click handlers, push-notification deep-links, in-app mention routing.
- **Avoid when:** Notifications intentionally target non-trip destinations.
- **Evidence:** `NotificationsDialog` previously preferred `notification.tripId` inference and omitted route-state chat context; mention notifications could route inconsistently across trip shells. Metadata-first route resolution plus `chatNavigationContext` state made mention routing uniform and added a post-navigation handshake marker.
- **Provenance:** April 2026 notification click-path hardening (`src/components/home/NotificationsDialog.tsx`, `src/components/__tests__/NotificationsDialog.test.tsx`).
- **Confidence:** high

### Kill-switched write features should be gated in both UI and service layers
- **Tip:** For operational kill switches (for example feature flags in `feature_flags`), disable the UI entry point and also hard-stop the write service call path. UI-only gates can be bypassed via stale tabs/devtools/manual invocation, while service-only gates create confusing UX.
- **Applies when:** Temporarily disabling mutation flows like scheduled broadcasts, AI write tools, or admin-only batch actions.
- **Evidence:** Broadcast scheduling was disabled in Admin Dashboard via `broadcast-scheduling-enabled` and additionally short-circuited in `unifiedMessagingService.scheduleMessage` to return `false` before auth/insert.
- **Provenance:** April 2026 broadcast scheduling kill-switch hardening.
- **Confidence:** high
### Treat schema migrations as a product compatibility API, not just SQL files
- **Tip:** In large Supabase/Postgres repos, migration safety is mostly about compatibility windows and operational sequencing, not syntax correctness. Enforce expand/contract phases, one concern per migration, and dual-version app/schema test windows. Without that, even “idempotent” SQL can break rolling deploys.
- **Applies when:** Any migration touches shared high-traffic tables (`trips`, `trip_members`, `trip_chat_messages`, `notifications`) or changes RLS/enum/status behavior
- **Avoid when:** Local-only prototypes not shipped to shared environments
- **Evidence:** Repo migration corpus shows repeated edits of critical tables and mixed-purpose migrations, increasing rollout coupling risk.
- **Provenance:** 2026-03 data evolution hardening audit
- **Confidence:** high

### Internal admin surfaces need route-level role guards, not auth-only protection
- **Tip:** Treat internal pages as production-critical privileged surfaces. `ProtectedRoute` (auth only) is insufficient for `/admin/*`; use explicit role guard components and test redirects for non-admin users.
- **Applies when:** Adding or updating any internal/admin route in `App.tsx`
- **Evidence:** `/admin/scheduled-messages` was reachable by any authenticated account until `InternalAdminRoute` hardening.
- **Provenance:** March 2026 support/admin hardening pass
### QA confidence drift happens when docs describe planned suites as implemented
- **Tip:** Keep E2E documentation split into explicit implemented vs planned sections and enforce with a lightweight CI doc-drift script.
- **Applies when:** Large test architecture transitions where some suites are roadmap-only.
- **Evidence:** Chravel had roadmap-level suite structure in E2E docs; guardrails were added to validate documented implemented suites.
- **Provenance:** March 2026 QA governance hardening pass.
### Reliability posture audits must separate “controls exist” from “controls are exercised”
- **Tip:** In resilience reviews, never treat documented backup/DR procedures as operational readiness. Grade each control on two axes: presence (configured?) and proof (drilled recently with pass/fail evidence?). Mark unexercised controls as risk, not mitigation.
- **Applies when:** SLO/DR/capacity audits, production-readiness reviews, launch gating for pro/event usage
- **Avoid when:** Throwaway prototypes with no continuity commitments
- **Evidence:** March 2026 reliability constitution audit found multiple backup/DR docs present but explicit “action required” status and missing drill evidence.
- **Provenance:** `docs/audits/reliability-resilience-constitution-2026-03-16.md`
- **Confidence:** high

### Vertex Live setup payloads should omit optional objects when unset
- **Tip:** For Gemini/Vertex Live setup, avoid sending empty objects for optional fields (e.g., `sessionResumption: {}`); include optional sections only when populated.
- **Applies when:** Building setup envelopes for bidirectional WS sessions with optional resumption handles/features.
- **Evidence:** Chravel voice sessions had intermittent setup instability while always sending empty sessionResumption; hardening changed to conditional inclusion only.
- **Provenance:** March 2026 Gemini Live production hardening.
- **Confidence:** medium

### URL import modals stay stable when UI gating and submit normalization share one helper
- **Tip:** Put URL trimming, protocol normalization, and scheme validation in one small utility used by both button-disabled logic and submit handlers; this prevents Enter-key/programmatic bypasses and keeps UX messages consistent.
- **Applies when:** Import flows accept pasted URLs and have both click + keyboard submit paths.
- **Evidence:** Calendar import modal had separate checks (`trim`, `new URL`, submit path) causing weak gating and inconsistent enabled state; consolidating with `validateImportUrl()` aligned UI state, Enter behavior, and submit normalization.
- **Provenance:** March 2026 Calendar Import modal forensic fix.
- **Confidence:** high

### Demo-mode media should not depend on external uptime without a local fallback path
- **Tip:** For demo-critical visuals (trip cards, hero surfaces), keep remote URLs as primary if needed but always provide deterministic local fallbacks and use a single automatic retry at the image component boundary.
- **Applies when:** Demo mode relies on externally hosted images (Supabase Storage/CDN/third-party assets) that may be unavailable in some environments.
- **Evidence:** Demo trip covers intermittently failed, showing broken alt text/empty headers. Adding `fallbackSrc` in `OptimizedImage` plus id-based local cover mapping restored card visuals without touching demo data semantics.
- **Provenance:** March 2026 demo trip cover resilience hardening.
- **Confidence:** high

### CSS multi-background layering is a low-risk fallback for background-image cards
- **Tip:** When cards use CSS `background-image` (not `<img>`), use layered values (`url(primary), url(fallback)`) via a shared helper to get graceful visual fallback without introducing extra runtime state/effects.
- **Applies when:** Hero/media backgrounds are rendered as `div` overlays and you need fallback parity across desktop + mobile card variants.
- **Evidence:** Pro/Event/Mobile event cards had direct `url(primary)` styles and could still show missing covers after TripCard image fallback improvements. Shared `buildCoverBackgroundImage` restored parity with minimal diff.
- **Provenance:** March 2026 demo cover resilience follow-up.
### Never block chat delivery on preview metadata fetch
- **Tip:** Link unfurl/OG fetch must run asynchronously after message persistence. Composer-level preview fetches in the critical send path can deadlock both Enter and send-button flows when the metadata request hangs or fails.
- **Applies when:** Any chat surface supports URL previews.
- **Evidence:** Main chat web send path was blocked by `isFetchingPreview` in `ChatInput`, causing Enter/button sends to appear nonfunctional for link messages.
- **Provenance:** March 2026 chat send + unfurl forensic fix.
### Remove visual effects at the trigger class, not with clipping overrides
- **Tip:** When a conditional animation class is the sole activation path for a decorative effect, remove the class usage in the component and delete the paired keyframes/utilities instead of masking with `overflow-hidden`/z-index patches.
- **Applies when:** UI regressions from over-scoped pseudo-element effects tied to active/listening states.
- **Evidence:** AI Concierge dictation regression came from `.dictation-ring-active` + `::after` conic-gradient rotation mounted during listening; removing class wiring and CSS definitions fully eliminated the oversized gold sweep without touching dictation behavior.
- **Provenance:** March 2026 AI Concierge dictation visual rollback.
### For event-scale chat gating, enforce threshold as both mode-resolution and write-validation
- **Tip:** For size-based permission limits, add a single shared resolver (effective mode) for UI/runtime behavior and pair it with backend write validation (trigger/check) + send-path authorization. This prevents stale legacy values from silently bypassing product rules when group size changes.
- **Applies when:** Permission mode validity depends on dynamic counts (members/attendees) and legacy records may become invalid over time.
- **Evidence:** Event chat `everyone` mode now degrades to effective `admin_only` above 50 members while DB trigger blocks setting invalid `chat_mode='everyone'` for large events.
- **Provenance:** March 2026 event chat permission scaling implementation.
### Replace-mode imports should be insert-first, delete-last
- **Tip:** For "replace all" import flows, do not execute `DELETE existing` before `INSERT new` from the client. Build a replace plan, insert missing rows first, and only then delete stale rows. This converts transient insert failures from destructive data loss into safe no-op retries.
- **Applies when:** Any bulk replace import (lineup/agenda/tasks/contacts) that mutates shared records.
- **Evidence:** `useEventLineup.importMembers` previously deleted all lineup members first; an insert/network failure left events with empty lineup data. Insert-first + stale-delete sequencing removed the destructive failure mode.
- **Provenance:** March 2026 lineup replace-import correctness fix.
### AI concierge tool declarations must be maintained as a single source of truth
- **Tip:** When a tool-calling AI system has multiple entrypoints (text chat, voice, demo), define tool schemas once in a shared registry and import/filter as needed. Inline declaration in endpoint files causes drift — Chravel's text path had 19 tools while voice had 31, with ~12 voice tools having no backend implementation.
- **Applies when:** Adding, modifying, or removing AI concierge tools; auditing tool parity across entrypoints
- **Avoid when:** Tools are truly exclusive to one entrypoint with no shared backend
- **Evidence:** `lovable-concierge/index.ts` defines 19 tools inline; `voiceToolDeclarations.ts` defines 31. Tools like `getWeatherForecast`, `convertCurrency`, `browseWebsite`, `settleExpense`, `generateTripImage` exist in voice declarations with no matching `case` in `functionExecutor.ts`, causing silent failures.
- **Provenance:** March 2026 AI Concierge architecture & prompt audit
- **Confidence:** high

### Conditional tool exposure beats always-on tool exposure for latency and accuracy
- **Tip:** Exposing all tools to the model on every query wastes ~2000 tokens and forces the model to evaluate irrelevant options. Classify queries into classes (weather, restaurant, calendar, payment, etc.) in code before model invocation, then only expose relevant tool subsets. This is the single highest-leverage optimization for token cost and tool selection accuracy.
- **Applies when:** AI concierge performance optimization, adding new tools, investigating wrong tool selection
- **Avoid when:** Queries that genuinely span multiple domains (rare)
- **Evidence:** A weather question currently forces Gemini to evaluate all 19+ tool schemas including payment, calendar, poll, and import tools. The model's context includes ~2000 extra tokens of irrelevant tool descriptions.
- **Provenance:** March 2026 AI Concierge architecture & prompt audit
- **Confidence:** high

### Always-on prompt layers should be audited for conditional value
- **Tip:** Prompt blocks that are injected into every request (few-shot examples, user preferences, action plan schemas) accumulate into bloat over time. Audit each block and ask: "Does this help for this specific query class?" Few-shot examples for payment queries are noise when the user asks about weather. User dietary preferences are noise when the user asks what time their reservation is.
- **Applies when:** Prompt optimization, investigating slow first-token time, reviewing system prompt length
- **Avoid when:** The prompt is already small (<500 tokens)
- **Evidence:** Chravel's trip-related system prompt injects few-shot (~300 tokens), preferences (~200 tokens), and action plan schema (~280 tokens) on every trip query regardless of relevance. Total system prompt reaches 3000-3500 tokens.
- **Provenance:** March 2026 AI Concierge architecture & prompt audit
- **Confidence:** high

### Mention chips inside themed chat bubbles should be bubble-context aware, not brand-accent aware
- **Tip:** Keep mention styling separate from hyperlink styling and derive mention colors from bubble context (own/broadcast vs incoming) so text remains readable on colored surfaces; use font-weight + subtle background chip for distinction instead of a hardcoded accent text color.
- **Applies when:** Chat/message renderers that support mentions inside multiple bubble themes.
- **Evidence:** Outgoing blue bubbles rendered mentions in blue (`text-blue-400`), causing severe contrast loss. Moving mention classes into a shared helper keyed by bubble context fixed readability while preserving visual distinction.
- **Provenance:** March 2026 forensic fix for mention rendering in `MessageBubble`.
- **Confidence:** high

### Resolve trip-media URLs at shared renderer boundaries
- **Tip:** When `trip-media` storage is private, always run URL signing/resolution in shared media renderers (tile + fullscreen modal), not only in one legacy surface. This prevents preview drift where one screen works and another shows "Unable to preview."
- **Applies when:** Any UI renders records from `trip_media_index` using `media_url` (`MediaGrid`, mobile media tiles, media viewer modals).
- **Avoid when:** Demo/local blob URLs (resolver already no-ops safely).
- **Evidence:** Media tab thumbnails failed for chat-uploaded photos while chat rendering still worked because `MediaTile`/`MediaViewerModal` used raw URLs and bypassed `useResolvedTripMediaUrl`.
- **Provenance:** March 2026 forensic fix for media preview failure in `UnifiedMediaHub`.
### Keep hidden file inputs mounted when multiple CTAs share one upload ref
- **Tip:** If more than one button triggers `fileInputRef.current?.click()`, mount the hidden `<input type="file">` outside transient UI branches (modals/forms/toggles) so the ref remains live across layout state changes.
- **Applies when:** Upload flows have both header-level and inline "Add more" actions, or when upload controls remain visible while another panel/form opens.
- **Evidence:** Event Line-up tab rendered "Add more" while the add-member form was open, but the hidden file input lived inside `!isAddingMember` and unmounted. Result: click no-op with no error.
- **Provenance:** March 2026 Line-up file upload bug fix in `LineupTab`.
### Dark-themed native time inputs need an explicit affordance when browser indicators look ambiguous
- **Tip:** If a dark, rounded custom input uses `type="time"` and the native picker indicator becomes a tiny square/blank artifact, keep native time behavior but hide the browser indicator and render a clear explicit clock affordance in the component. Scope CSS to a local class instead of globally restyling every time input.
- **Applies when:** Modal/forms with branded input styling that wraps native time controls.
- **Evidence:** Calendar Add Event modal showed a confusing blue square/blank indicator slot in the Start Time field; adding a scoped `.calendar-time-input` style plus explicit `Clock3` icon resolved clarity without changing time data semantics.
- **Provenance:** March 2026 calendar invite time-input forensic fix.
- **Confidence:** high

### Hover actions in dense message stacks must share the same pointer-ownership container
- **Tip:** If chat hover controls are rendered outside the hovered message hitbox (especially below the bubble), cursor travel to the controls can trigger row handoff to the adjacent message. Keep action controls as descendants of the same row container and place them laterally (`left/right`) to avoid vertical collision.
- **Applies when:** Reaction trays, kebab menus, or inline controls in stacked chat/message timelines.
- **Evidence:** Trip chat reaction shortcuts rendered below bubbles and repeatedly "fell" to the next message; side-attached absolute pill under the same `MessageBubble` container removed hover handoff.
- **Provenance:** March 2026 chat reaction hover forensic fix.
### App Store launch audits should separate code blockers from operator/App Store metadata blockers
- **Tip:** During launch-readiness reviews, classify each issue by fix channel (code, config, App Store Connect metadata, legal/policy, ops). This prevents engineering from over-indexing on code-only fixes while submission blockers remain in metadata/compliance queues.
- **Applies when:** Pre-TestFlight and pre-App Store readiness gates for mobile apps with subscriptions, account deletion, and legal obligations.
- **Avoid when:** Narrow feature bugs where submission/compliance scope is irrelevant.
- **Evidence:** 2026-03-19 boring-killers audit found high-risk blockers split across Apple IAP implementation, restore-purchase UX, and App Store Connect policy disclosures.
- **Provenance:** `docs/audits/launch-readiness-boring-killers-2026-03-19.md`
- **Confidence:** high

### App Store billing compliance needs both client-side and server-side enforcement
- **Tip:** When iOS consumer IAP is not live yet, blocking only the frontend CTA is insufficient; also enforce policy server-side in checkout/session creation so stale clients or direct calls cannot trigger non-compliant flows.
- **Applies when:** Consumer digital subscriptions have mixed Stripe + IAP architecture during migration.
- **Avoid when:** Native IAP is fully implemented and server routes are intentionally platform-agnostic.
- **Evidence:** March 2026 remediation added iOS consumer checkout guards in `useConsumerSubscription`, `ConsumerBillingSection`, and `supabase/functions/create-checkout/index.ts`.
- **Provenance:** 2026-03-19 launch blocker remediation pass.
- **Confidence:** high

### Never put AI/parser enrichment ahead of chat mutation kickoff
- **Tip:** In messaging flows, any enrichment call (message parser, link preview, NLP extraction) must run after the send mutation starts (preferably after optimistic render). If enrichment is awaited first, users experience severe perceived send lag despite healthy realtime infrastructure.
- **Applies when:** Chat composer pipelines with pre-send parsing, link unfurling, moderation, or AI extraction.
- **Avoid when:** Validation/security checks that must block invalid payloads (empty content, oversized payloads).
- **Evidence:** `TripChat.handleSendMessage` awaited `useChatComposer.sendMessage`; that function awaited `useChatMessageParser.parseMessage` (edge function) before `sendTripMessage`, delaying optimistic insert and making send appear stalled.
- **Provenance:** March 2026 Stream migration forensic audit (`docs/audits/stream-migration-forensic-plan-2026-03-30.md`).
### Never apply keyframe `transform` animations on the same node dnd-kit uses for drag transforms
- **Tip:** If sortable items feel jittery or "glitchy" in mobile reorder mode, check whether CSS animation classes (wiggle/float/pulse) are attached to the same element receiving dnd-kit inline `transform`. Move decorative animation to an inner wrapper so drag translation remains authoritative.
- **Applies when:** dnd-kit sortable cards need an iOS-like wiggle/edit mode.
- **Evidence:** Dashboard trip reorder still felt unstable after overlay/sync fixes; moving `animate-wiggle-subtle` from sortable root node to inner child removed transform contention and improved drag smoothness.
- **Provenance:** April 2026 trip reorder follow-up hardening (`SortableCardWrapper`).
- **Confidence:** high
### For reorder "edit mode" motion, prefer micro-float over rotation when users request calmer affordance
- **Tip:** If users describe wiggle as distracting/glitchy, keep motion but switch to low-amplitude float (`translateY` ~1–2px) to preserve edit-mode affordance with lower visual noise.
- **Applies when:** Mobile card/icon reordering where product asks for iOS-like ease without aggressive motion.
- **Evidence:** Dashboard trip reorder feedback explicitly preferred float over wiggle/pulse; `animate-float-subtle` improved perceived smoothness while keeping transform isolation.
- **Provenance:** April 2026 dashboard reorder follow-up.
- **Confidence:** medium-high
### Cover-image storage should have a single bucket/path helper shared by all upload entrypoints
- **Tip:** When the same asset type can be uploaded from multiple surfaces (create modal, header editor, AI tools), centralize bucket id + object path construction in one helper and import it everywhere; avoid hardcoding bucket/path literals in components.
- **Applies when:** Trip/event cover uploads, avatars, receipts, or any storage object with security-sensitive RLS path checks.
- **Evidence:** TripHeader used `trip-media` + `trip-covers/...` while CreateTripModal used `trip-covers` bucket. After RLS hardening, TripHeader uploads failed, so cover updates never persisted and homepage cards appeared stale/blank.
- **Provenance:** April 2026 trip cover forensic fix (`tripCoverStorage` shared helper).
- **Confidence:** high
### Preserve fixed cover-card layouts with a two-layer image strategy (blur-fill + contain foreground)
- **Tip:** If product wants fixed-size hero/card shells but users complain about crop loss, keep the layout frame and render two layers from the same source: blurred `object-cover` background for full bleed + sharp `object-contain` foreground for content fidelity.
- **Applies when:** Trip cover photos, event hero headers, and dashboard cards where aspect ratio mismatch is common.
- **Evidence:** Trip cover sections were cropping most uploads; switching to contain foreground with blurred backdrop showed more of landscape photos without redesigning layout or breaking text contrast.
- **Provenance:** April 2026 trip cover composition follow-up.
- **Confidence:** high
### For edge-function auth bugs, fail early on malformed Bearer headers before calling `auth.getUser`
- **Tip:** Centralize bearer parsing in one helper and reject missing/malformed headers with explicit 401 responses; do not rely on `replace('Bearer ', '')` because non-bearer values become opaque token-debugging noise.
- **Applies when:** Supabase Edge Functions accept browser JWTs and/or service-role bearer tokens.
- **Evidence:** Concierge tool-call failures were hard to debug because malformed headers could flow to `auth.getUser` as invalid token strings; explicit parser + dedicated error responses made the failure mode obvious in logs/clients.
- **Provenance:** April 2026 execute-concierge-tool auth hardening.
- **Confidence:** high

### For merge-heavy weeks, treat `npm run validate` as the deployment gate even when `npm run build` is green
- **Tip:** A green Vite production bundle is not sufficient to restore deployability in this repo; the `validate` chain (`lint:check` + `typecheck` + `format:check`) can fail on formatting drift introduced by concurrent PR merges. Run `npm run validate` first during outage triage to separate true compile/runtime faults from gate drift.
- **Applies when:** Post-merge stabilization, release cut prep, "site not loading after PR flurry" reports.
- **Avoid when:** Quick local prototyping where CI/deploy gates are intentionally bypassed.
- **Evidence:** April 4, 2026 recovery pass: build/typecheck were green while deployment gate failed on Prettier drift in `TripChat.tsx`, `useStreamTripChat.ts`, and Supabase generated types; format-only fix restored full gate.
- **Provenance:** 2026-04-04 build recovery triage.
- **Confidence:** high

### Split flaky E2E signal from required PR gates and reuse build artifacts
- **Tip:** Keep PR required checks focused on deterministic gates (lint/typecheck/unit/build + tiny smoke E2E) and move full E2E to main/nightly/manual runs. Reuse a built `dist` artifact across jobs to avoid redundant builds and reduce E2E startup variance.
- **Applies when:** CI pipelines for React/Vite apps where Playwright suites are broader/slower than PR feedback needs.
- **Evidence:** CI reliability pass added `static-checks`, `unit-tests`, `build`, `e2e-smoke` (PR), and `e2e-full` (main/nightly), plus `PLAYWRIGHT_SKIP_BUILD=1` path in Playwright config and shared `web-dist` artifact.
- **Provenance:** April 2026 CI reliability hardening.
- **Confidence:** high

### Client-side deletes on RLS-protected tables must never assume success without row-level confirmation
- **Tip:** If a mutation target has restrictive DELETE policies (e.g., admin-only), requester-facing “cancel” flows should use a narrowly scoped `SECURITY DEFINER` RPC that codifies authorization/ownership rules and returns explicit success/failure payloads. Avoid direct `.delete()` from the browser for these cases because RLS no-op/deny can produce misleading UX if local state is optimistically removed.
- **Applies when:** Building user-owned cancellation paths on shared moderation tables like `trip_join_requests`.
- **Evidence:** Dashboard outbound cancel path in PR #137 originally used client DELETE (`id + user_id + pending`) but conflicted with admin-only DELETE policy; replacing with `cancel_own_join_request` RPC resolved correctness risk.
- **Provenance:** April 2026 PR #137 merge-readiness audit and fix.
### Stream chat hooks should react to client connection events, not one-time client snapshots
- **Tip:** If a chat hook checks `getStreamClient()?.userID` only once during mount, it can permanently miss initialization when auth/token connection finishes later. Expose a small `onStreamClientConnected` subscriber in the singleton client module and re-run channel bootstrap when the callback fires.
- **Applies when:** Stream-backed hooks mount before `connectUser()` resolves (slow auth, mobile resume, reconnect cycles).
- **Avoid when:** The hook itself owns/awaits the client connection promise directly.
- **Evidence:** Trip chat mounted before Stream connect, hit early return, and stayed blank until hard refresh; adding connection subscriber + readiness state + timeout restored automatic history bootstrap and send readiness.
- **Provenance:** April 2026 GetStream trip chat race-condition fix (`streamClient.ts`, `useStreamTripChat.ts`).
- **Confidence:** high

### During chat backend migrations, hydrate from both old and new stores with deterministic dedupe
- **Tip:** For phased messaging migrations (Supabase -> Stream), treat history as a dual-source read problem until a full backfill is complete: load from both stores, normalize shape, dedupe by stable fingerprint, and sort by server timestamp. This prevents silent history gaps for pre-migration conversations.
- **Applies when:** Users can have conversation history written before and after a backend cutover.
- **Avoid when:** Historical data has already been fully copied and validated in the destination store.
- **Evidence:** Trip chat and concierge showed post-migration messages but could miss pre-migration history when Stream-only hydration paths were used.
- **Provenance:** April 2026 Stream continuity hardening (`useStreamTripChat`, `useStreamConciergeHistory`, `AIConciergeChat`).
- **Confidence:** high

### Standalone agents need their own deployment pipeline — edge function CI does not cover them

- **Tip:** When a feature depends on a separately-deployed backend process (LiveKit agent, background worker, external service), always create dedicated CI/CD and verify the deployment pipeline before considering the feature "code-complete." Code that is correct in isolation is worthless if it never runs.
- **Applies when:** Introducing any backend component that runs outside Supabase Edge Functions (LiveKit agents, Temporal workers, standalone Node.js services).
- **Avoid when:** The component is a Supabase Edge Function already covered by `deploy-functions.yml`.
- **Evidence:** The `agent/` directory had complete, well-written code but no Dockerfile, no CI workflow, and was never deployed to LiveKit Cloud — making the entire voice feature non-functional.
- **Provenance:** April 2026 LiveKit voice stack forensic audit.
- **Confidence:** high

### Never use `(x as any).property = value` to set SDK configuration — verify the API surface

- **Tip:** When an SDK class doesn't expose a property you need, that's a signal to use a different API (e.g., `RoomServiceClient.createRoom()` instead of `AccessToken.roomConfig`). Type assertions that bypass the type system to set properties are almost always dead code — serialization methods only process known fields.
- **Applies when:** Configuring third-party SDK objects, setting JWT claims, building protobuf messages.
- **Avoid when:** The `as any` cast is for reading an untyped property that demonstrably exists at runtime.
- **Evidence:** `(token as any).roomConfig = {...}` in `livekit-token/index.ts` was dead code — `AccessToken.toJwt()` ignored it, causing voice to silently fail.
- **Provenance:** April 2026 LiveKit voice stack forensic audit.
### In network-isolated Playwright environments, use app demo mode for UI-layer messaging verification
- **Tip:** When Playwright fixtures call Supabase APIs (signUp, signIn) in a network-isolated sandbox, they throw `ConnectTimeoutError`. Wrap fixture auth calls in try/catch returning null, then call `test.skip()` when auth is null. For UI-layer verification (trip chat, concierge, pro channels), navigate to `/demo` — it boots the app with local mock data and no network calls. Tab panels in TripTabs all stay mounted with `display:none` when inactive, so use class discriminators to target textareas (e.g., `textarea[class*="rounded-2xl"]` for Concierge, not `.first()` which returns the hidden Chat input).
- **Applies when:** CI/staging Playwright suites, PR smoke tests, network-isolated sandbox environments, local development without Supabase credentials.
- **Avoid when:** Tests must verify actual Stream message delivery or real DB writes — those require staging with `SUPABASE_SERVICE_ROLE_KEY`.
- **Evidence:** GetStream messaging e2e suite: 8 CHAT-SMOKE tests pass in isolation using `/demo` mode; 8 CHAT-001/002/003 authenticated tests skip gracefully with clear message when credentials are unavailable. `data-testid="chat-send-btn"` added to `ChatInput` for stable send button targeting.
- **Provenance:** April 2026 GetStream messaging e2e suite (`claude/fix-getstream-messaging-xmHa9`).
- **Confidence:** high

### Pending-buffer write tools require 5-file sync — 3-file assumption breaks confirms

- **Tip:** The AI concierge has two write patterns: (1) **direct execution** — tool logic runs immediately in `functionExecutor.ts`; (2) **pending buffer** — tool inserts a row to `trip_pending_actions` and the user must confirm via the chat card. Pending-buffer tools require 5 files to work end-to-end: `toolRegistry.ts`, `agent/src/tools.ts`, `functionExecutor.ts` (the 3-file assumption), **plus** `usePendingActions.ts` (confirm handler that executes the actual DB write) and `PendingActionCard.tsx` (TOOL_CONFIG for icon/label display). Omitting either frontend file means confirms silently fail with "Unknown tool: X" or render as "Unknown action". For tools where the pending_action row IS the record (e.g., `addReminder`, `setTripBudget`) — no secondary DB write on confirm; just break.
- **Applies when:** Adding any pending-buffer write tool to the AI concierge; auditing why a tool's confirm card doesn't create data.
- **Avoid when:** Direct-execution tools (`updateCalendarEvent`, `deleteTask`, `settleExpense`, `moveCalendarEvent`) — these run entirely in `functionExecutor.ts` and never touch the frontend confirm flow.
- **Evidence:** `addReminder` and `setTripBudget` were silently broken since their addition (60-tool expansion). Discovered during 74-tool gap analysis in April 2026. Fixed by adding cases to `usePendingActions.ts` and entries to `PendingActionCard.tsx`.
- **Provenance:** April 2026, 74→75 tool expansion (`0d9bed1`).
- **Confidence:** high

### trip_payment_messages.trip_id is TEXT, not UUID

- **Tip:** Unlike every other `trip_*` table which uses `UUID` for `trip_id`, `trip_payment_messages.trip_id` is `TEXT NOT NULL` (per migration `20250902153921_...`). Any direct insert or filter must pass a string, not expect UUID coercion. This will silently succeed on insert (Postgres accepts UUID strings as TEXT) but will cause type mismatches if you attempt JOIN operations expecting UUID equality.
- **Applies when:** Inserting to or joining `trip_payment_messages`; building expense tools; writing payment-related migrations.
- **Avoid when:** Reading — selects work fine since UUID strings are valid TEXT.
- **Evidence:** Discovered when implementing `addExpense` confirm handler in `usePendingActions.ts` (April 2026).
- **Provenance:** April 2026, 74-tool expansion.
- **Confidence:** high
### For invite conversion CTAs, never let a secondary client lookup overwrite invite context derived from edge previews
- **Tip:** If a preview edge function already has service-role access, return the canonical active invite code in that payload and use it directly for join CTA routing. Do not fetch `trip_invites` again client-side as a second authority; policy drift can return `null` and break conversions.
- **Applies when:** Public/anonymous trip preview pages that route users into authenticated join flows.
- **Evidence:** `TripPreview` was nulling `activeInviteCode` via client invite query and showing "ask for invite link" toast after login even when invite context existed.
- **Provenance:** April 2026 invite flow deep-dive (`get-trip-preview` + `TripPreview` fix).
- **Confidence:** high
### Retiring a deprecated service should be enforced with an import-level guard, not just file deletion
- **Tip:** When deprecating a previously shipped service, pair deletion/move with a lint-level `no-restricted-imports` rule so future code cannot silently reintroduce old architecture paths.
- **Applies when:** Promoting a single-source-of-truth module and removing legacy alternatives.
- **Evidence:** `EnhancedTripContextService` was unreferenced and removed; adding lint restrictions for common relative/alias import paths hardens `TripContextAggregator` as the sole concierge context path.
- **Provenance:** April 2026 concierge context hardening.
- **Confidence:** high

### Decompose god-components by extracting stateful domains before moving large async pipelines
- **Tip:** For very large React components, extract independent state/effect domains first (messages, voice, attachments, action-state), then move the largest async handler (stream/send pipeline) last. This shrinks orchestration complexity while preserving behavior and makes the final high-risk move mostly parameter threading.
- **Applies when:** A single component mixes UI render, realtime/streaming callbacks, and multiple feature domains.
- **Evidence:** `AIConciergeChat.tsx` reduction from 2,306 lines to 540 lines succeeded by first wiring `useConciergeMessages/useConciergeVoice/useConciergeAttachments/useSmartImportActions`, then extracting `handleSendMessage` into `useConciergeStreaming`.
- **Provenance:** April 2026 concierge refactor completion.
- **Confidence:** medium

### Stream message edits should use the singleton client API, not channel-level casts
- **Tip:** For message edit flows, call `getStreamClient()` and `client.updateMessage({ id, text })` instead of `(activeChannel as any).updateMessage(...)`. This removes unsafe casts, centralizes connection readiness checks, and gives a single place to handle unavailable-client UX.
- **Applies when:** Editing existing chat messages in TripChat/Channel surfaces that already depend on the Stream singleton lifecycle.
- **Avoid when:** The code path intentionally operates on detached channel objects outside the singleton lifecycle (rare in this repo).
- **Evidence:** `TripChat` edit handler previously used a channel-level `any` cast; replacing it with singleton `updateMessage` plus guard toast preserved UX while improving type-safety and testability.
- **Provenance:** April 2026 TripChat edit-path hardening.
### Stream connection lifecycle hooks require companion test-mock exports
- **Tip:** When introducing `onStreamClientConnected`/status subscriptions in hooks, update existing Vitest module mocks to include the new exported subscription function; otherwise hooks fail at mount with missing export errors.
- **Applies when:** Stream hook changes add new imports from `streamClient` (or any shared service module) in files with explicit `vi.mock(...)` fixtures.
- **Avoid when:** Tests use `importOriginal` partial mocks that already forward untouched exports.
- **Evidence:** `useStreamBroadcasts` readiness guard update caused `useStreamBroadcasts.priority.test.tsx` failures until the mock included `onStreamClientConnected: vi.fn(() => () => undefined)`.
- **Provenance:** April 2026 Stream migration hardening pass.
- **Confidence:** high

### Unread badge splits must never override Stream total unread when history is partially loaded
- **Tip:** When unread totals come from Stream (`countUnread` / read state), keep that total authoritative and treat per-type (broadcast vs message) split as an estimate from loaded unread messages. Never set total to zero just because the local message window is empty.
- **Applies when:** Infinite-scroll or partial-history chat views with server-side unread counters.
- **Evidence:** Initial Stream unread migration incorrectly zeroed unread when `messages.length === 0`; follow-up hardening preserved Stream total and clamped split logic safely.
- **Provenance:** April 2026 Stream migration follow-up.
- **Confidence:** high

### Stream webhook channel identity should be parsed from event root, not nested message object
- **Tip:** For Stream `message.new` webhooks, resolve channel identity from root-level `cid` (or `channel_type` + `channel_id`) first. Do not rely on `message.cid` being present.
- **Applies when:** Translating Stream webhook payloads into app-specific IDs for notification fanout/reconciliation.
- **Evidence:** `stream-webhook` notification path failed because trip id derivation used `event.message.cid` and skipped inserts when that field was absent.
- **Provenance:** April 2026 PR #229 cursor review remediation.
### Never split unread subclasses from count-only tails when a read marker exists
- **Tip:** If backend chat state exposes explicit per-user read markers (`last_read`), derive unread sets from that marker instead of approximating with `messages.slice(-unreadCount)`. Tail-slice heuristics silently misclassify message types when message ordering or visibility diverges from raw unread totals.
- **Applies when:** Stream/chat UIs that show unread sub-counts (e.g., broadcast vs standard) in addition to total unread.
- **Avoid when:** The product intentionally renders only a total unread badge with no subclass split.
- **Evidence:** `useUnreadCounts` switched from tail approximation to marker-based split plus low-confidence fallback-to-total path when marker data is unavailable or mismatched.
- **Provenance:** April 2026 unread-count hardening.
### Stream read-receipt hooks should no-op when channel is unavailable
- **Tip:** In Stream-backed chat, schedule read receipts only when an `activeChannel` instance exists and exposes `markRead`. If no channel is mounted yet (or demo mode is active), skip entirely instead of falling back to legacy DB receipt writes.
- **Applies when:** Migrated chat surfaces where Stream channel lifecycle can lag behind initial message hydration.
- **Evidence:** `useChatReadReceipts` previously ran fallback `markMessagesAsRead` when `activeChannel` was missing, causing split-path behavior and regression risk. Wiring `activeChannel` from `TripChat` and guarding on channel availability removed this mismatch.
- **Provenance:** April 2026 TripChat/useChatReadReceipts regression fix.
- **Confidence:** high

### Separate installed-app entry policy from browser marketing entry at the root route
- **Tip:** For web apps embedded in native WebViews or installed as PWAs, decide launch context (`browser` vs `installed_app`) before rendering the marketing shell. In installed contexts, gate on auth hydration first, then route to auth/app; in browsers, keep marketing UX unchanged.
- **Applies when:** One codebase serves desktop/mobile web marketing and installed app experiences simultaneously.
- **Avoid when:** Marketing and app are fully separate codebases/domains.
- **Evidence:** Chravel native users were seeing marketing homepage because `/` entry treated native WebView the same as browser; a centralized launch context utility plus early Index gate removed flash and preserved browser SEO routes.
- **Provenance:** April 2026 installed app entry routing hardening (`launchContext` + Index gate).
### Entitlement upserts should conflict on purchase domain, not user identity alone
- **Tip:** For mixed purchase models (recurring subscription + one-time pass), key `user_entitlements` writes by `(user_id, purchase_type)` so webhook retries/updates stay idempotent without cross-overwriting another entitlement track.
- **Applies when:** Any Stripe/RevenueCat/admin write path updates `user_entitlements`.
- **Evidence:** User-only conflict targets overwrite pass/subscription state for dual-entitled users; switching upserts and selectors to purchase-scoped rows preserves both and enables deterministic client prioritization.
- **Provenance:** April 2026 composite entitlement key hardening.
### Checkout creation should enforce cross-provider overlap guards before payment session creation
- **Tip:** Before creating a Stripe Checkout session, read `user_entitlements` and explicitly block overlapping active paid access (active/trialing/past_due/canceled-with-future-end) from any provider. This prevents accidental dual billing when users can arrive from multiple billing channels (web Stripe + native RevenueCat).
- **Applies when:** Mixed-provider billing stacks where at least one client can initiate purchases without central provider reconciliation.
- **Evidence:** Added guardrails in `supabase/functions/create-checkout/index.ts` that stop overlapping subscription/pass purchases based on existing entitlement state.
- **Provenance:** April 2026 subscription architecture hardening.
- **Confidence:** high

### Stream finalization should treat rich-card-only tool results as successful output
- **Tip:** In streamed concierge/chat flows, `onDone` fallback logic must check for all non-text renderable payloads (flight cards, hotel cards, place cards, pending action cards, import previews/status, reservation drafts), not just assistant text.
- **Applies when:** Tool calls can complete before any natural-language chunk is emitted.
- **Avoid when:** Responses are guaranteed to include assistant text.
- **Evidence:** Concierge stream finalizer was only checking hotels/places/actions, so flight-only turns were marked as failures and overwritten with a generic error message despite valid cards.
- **Provenance:** April 2026 concierge refactor follow-up (`useConciergeStreaming` onDone guard hardening).
- **Confidence:** high


### Pick one billing runtime adapter per app surface and route all entitlement sync through it
- **Tip:** In mixed web/native repositories, choose a canonical billing runtime per surface (e.g., native bridge for mobile shell, Stripe for web) and expose one adapter function for configure → customerInfo → backend sync. Avoid parallel direct SDK calls from hooks/components because they drift and silently disagree on support/runtime.
- **Applies when:** RevenueCat/Purchases integrations exist in both app shell code and feature hooks/components.
- **Evidence:** Consolidating `useUnifiedEntitlements` to `syncRevenueCatEntitlementsForUser(...)` and removing startup `initRevenueCat()` from web shell eliminated contradictory Purchases-js and adapter paths in April 2026.
- **Provenance:** April 2026 RevenueCat architecture consolidation.
- **Confidence:** high

### Keep founder/super-admin bypass identity in one shared module across edge functions
- **Tip:** Centralize bypass email parsing/normalization in a shared edge-function helper and import it everywhere (`check-subscription`, creation flows, entitlement-gated functions, admin-read helpers) instead of duplicating hardcoded arrays.
- **Applies when:** Role/entitlement bypass checks use founder/admin email allowlists and env-driven extensions.
- **Evidence:** `demo@chravelapp.com` and founder lists drifted across multiple functions; consolidation in `_shared/superAdmins.ts` removed drift and documented demo bypass as explicit opt-in only.
- **Provenance:** April 2026 super-admin source-of-truth hardening.
### Entitlement-read APIs should prefer normalized `user_entitlements` and treat provider APIs as stale-data reconciliation only
- **Tip:** For user-facing entitlement checks, read `user_entitlements` first and apply shared primary-selection + effective-access logic before calling Stripe/RevenueCat. Invoke provider APIs only when rows are missing or stale, then upsert normalized state once.
- **Applies when:** Building “check status” endpoints/hooks that can be called frequently from clients.
- **Evidence:** `check-subscription` previously called Stripe first and only consulted pass entitlements as a secondary branch; this caused unnecessary external calls and inconsistent response shapes. Entitlement-first flow reduced blast radius and kept trip-pass handling native to entitlements.
- **Provenance:** April 2026 `check-subscription` hardening.
### Keep plan quotas in one canonical module consumed by both client and server
- **Tip:** Usage ceilings that affect both UI counters and backend enforcement must come from one shared policy map. Duplicated constants drift silently and create trust-breaking mismatches (UI says asks remain while server rejects).
- **Applies when:** Per-plan limits (trip query caps, export caps, seat caps) are shown in frontend and enforced in edge functions/RPC paths.
- **Avoid when:** A limit is intentionally runtime-only (e.g., server cost circuit-breaker not exposed in UI).
- **Evidence:** Concierge trip query policy diverged (`useConciergeUsage` 10/25 vs server `usagePolicy` 5/10); canonicalizing to shared `getConciergeTripQueryLimit(...)` removed mismatch and synchronized trip-limit response copy.
- **Provenance:** April 2026 concierge usage policy consolidation.
### Smart-import limits should return machine-readable paywall metadata, not generic parser errors
- **Tip:** For quota-gated ingestion surfaces, always return a structured payload (`error_code`, `upgrade_required`, `remaining`) from edge functions and let frontend parser adapters map that to contextual CTA copy.
- **Applies when:** URL/file/text import flows that can hit monthly/plan-based limits.
- **Avoid when:** Purely transient failures (network timeout, malformed input) where retry guidance is more appropriate than upgrade CTA.
- **Evidence:** Smart Import scrape/parser functions now gate via shared usage RPC and return a consistent 402 payload; parser utilities use a shared helper to preserve paywall context instead of collapsing into generic “AI parsing failed”.
- **Provenance:** April 2026 Smart Import usage quota hardening.
### Realtime model drift needs a literal-level CI guard, not just env convention
- **Tip:** For voice stacks spanning frontend, edge functions, and external workers, enforce a single canonical model literal in code and fail CI if alternate model literals/deprecated transport tokens appear in production paths.
- **Applies when:** Realtime model identifiers are configurable via env and can silently drift across repos/services.
- **Avoid when:** The system intentionally runs multiple production realtime models by design.
- **Evidence:** Chravel had mixed comments/env references around Gemini 3.1 vs 2.5 while production flows remained on 2.5. Adding `voice-model-guard.cjs` plus one canonical constant (`agent/src/voiceModel.ts`) prevented accidental reintroduction of unsupported `media_chunks`/`generateReply` assumptions and model-string drift.
- **Provenance:** April 2026 LiveKit/Gemini voice contract hardening.
- **Confidence:** high

### Prefer semantic foreground tokens over fixed light text for selected controls
- **Tip:** In shared toggle/tab primitives, avoid hardcoding selected-state text colors like `text-white` or forcing `data-[state=on]:text-accent-foreground` globally. Set state text explicitly at the consuming component using semantic tokens (`text-foreground`, `text-muted-foreground`) so both light and dark themes remain readable.
- **Applies when:** Building `Toggle` / `ToggleGroup` based segmented controls and tab rails used across multiple themed surfaces.
- **Avoid when:** A control has a strictly fixed brand background with a guaranteed contrast contract and dedicated visual tests.
- **Evidence:** Light mode trip toggles/tabs became unreadable due to shared toggle on-state text override; removing the primitive-level override and explicitly setting per-surface token-safe state classes fixed contrast while preserving dark mode parity.
- **Provenance:** April 2026 trip view toggle and mobile tab parity fix.
- **Confidence:** high

### Keep Stream channel state and role-channel state as separate identifiers in mixed chat UIs
- **Tip:** When a screen combines Stream trip chat and role-channel chat, never reuse the same `activeChannel` variable name for both. Alias them (`streamActiveChannel`, `roleActiveChannel`) at destructuring time and pass each only to its owning hooks/components.
- **Applies when:** A component consumes both `useTripChat` (Stream `Channel`) and `useRoleChannels` (`TripChannel`) in one render path.
- **Evidence:** `TripChat` passed Stream `Channel` into `MessageTypeBar` (expects `TripChannel`), causing `Cannot read properties of undefined (reading 'toLowerCase')` on `channelName`.
- **Provenance:** April 2026 Messages-tab stability fix after Stream membership self-heal rollout.
- **Confidence:** high

### Keep edge-function CORS allowlist aligned with active production domains
- **Tip:** When production web domains change/expand (e.g., `chravel.app` → `chravelapp.com`), update `_shared/cors.ts` allowlist immediately and add explicit unit coverage for each domain.
- **Applies when:** Any feature depends on browser → Supabase Edge Function calls (OAuth init, billing, concierge, imports).
- **Avoid when:** Server-to-server calls where browser CORS is irrelevant.
- **Evidence:** Gmail connect failed from `https://chravelapp.com` with “Failed to send a request to the Edge Function” because CORS echoed fallback origin (`https://chravel.app`) instead of request origin.
- **Provenance:** April 2026 Gmail connector deep-dive and fix.
- **Confidence:** high

### Stream search results for thread replies should deep-link to parent message IDs
- **Tip:** When using Stream `channel.search`, reply hits often return the reply message ID (`parent_id` populated). For a thread-first UX, route users to the parent message and auto-open the thread instead of scrolling to the reply row in the main timeline.
- **Applies when:** Chat search overlays, notification deep-links, and any jump-to-message feature in threaded timelines.
- **Avoid when:** The destination surface is a dedicated thread-only list where reply IDs are directly rendered.
- **Evidence:** Chravel TripChat search could find replies but only attempted main-list scroll by reply ID; since replies are filtered out of top-level timeline, navigation looked broken. Mapping `parent_message_id` + `openThread` restored deterministic navigation.
- **Provenance:** April 2026 thread UX adoption instrumentation pass.
- **Confidence:** high
### Canary incident auto-disable should live server-side behind service-role updates
- **Tip:** If a rollout requires automatic kill-switch behavior, push threshold evaluation into an authenticated edge function that can atomically mutate `feature_flags` instead of relying on client-only counters.
- **Applies when:** Shipping canary rollouts for realtime/chat systems where failures must disable rollout globally.
- **Evidence:** `stream-canary-guard` now records rolling incident windows in `app_settings` and disables `stream_changes_canary` once metric thresholds are exceeded.
- **Provenance:** April 2026 Stream canary hardening.
- **Confidence:** high

### Treat first 24–72 hours as an hourly reliability gate, not a daily dashboard check
- **Tip:** For high-risk realtime chat rollouts, explicitly split monitoring into an hourly 24–72h phase (send failures, ReadChannel recovery failures, webhook 401/500s) and a daily day-4–7 phase. Keep a pre-defined rollback toggle and only expand rollout after stability across all chat surfaces (trip, pro, reactions, mentions, threads).
- **Applies when:** Canary/gradual rollout of Stream transport or webhook-dependent notification flows.
- **Evidence:** Daily-only triage docs can miss fast-moving regressions during initial rollout windows; explicit hourly gate + rollback criteria reduces mean time to contain.
- **Provenance:** April 2026 Stream reliability runbook hardening pass.
- **Confidence:** medium-high

### Thread-reply success UX should derive from pre-send reply context, not post-send composer state
- **Tip:** If the composer clears `replyingTo` optimistically on send, capture the parent message id before dispatch and derive the success CTA state from that captured value. Otherwise post-send CTA logic cannot reliably determine whether the sent message was a thread reply.
- **Applies when:** Chat composers clear input/reply state immediately for optimistic UX.
- **Evidence:** `useChatComposer.sendMessage` resets `replyingTo` before transport send completes; TripChat now uses `createThreadReplySuccessState(repliedParentMessageId)` to ensure thread-reply success CTA is shown only for replies.
- **Provenance:** April 23, 2026 thread reply CTA enhancement.
- **Confidence:** high

### Stream message pin/unpin should use partial update mutations, not full update payloads
- **Tip:** For pin state changes, call `partialUpdateMessage({ id, set: { pinned } })` instead of `updateMessage({ id, pinned, ... })` so message text/attachments are never accidentally overwritten by sparse payloads.
- **Applies when:** Chat UIs expose pin/unpin actions on existing Stream messages.
- **Avoid when:** You intentionally need a full message content update (editing text/attachments).
- **Evidence:** Trip chat pin toggle path was using `updateMessage` directly from UI; moving to hook-level `togglePin` with partial updates preserved timeline body while keeping real-time `message.updated` propagation.
- **Provenance:** April 27, 2026 TripChat pin/unpin integrity fix.
- **Confidence:** high

### OG/share proxy endpoints must fail over to HTML redirect pages when upstream returns JSON errors
- **Tip:** For branded unfurl proxies (`/t/:tripId`, `/join/:code`), never pass through non-HTML upstream payloads directly. If upstream returns non-2xx or non-HTML (for example Supabase edge runtime degradation JSON), return deterministic HTML with meta-refresh and a visible fallback CTA to the primary app URL.
- **Applies when:** A proxy endpoint is used by both social crawlers and human taps, and upstream preview generation depends on edge runtime health.
- **Avoid when:** The endpoint is API-only and intentionally returns machine-readable JSON.
- **Evidence:** `api/trip-preview` previously surfaced raw `SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED` JSON in mobile browser, blocking join conversion. HTML fallback restored continuation into `/trip/:id/preview` while keeping normal upstream HTML pass-through behavior.
- **Provenance:** April 2026 branded trip invite flow degradation hardening.
- **Confidence:** high

### Shared trip preview flows should self-heal missing active invites before exposing join CTA
- **Tip:** When `/trip/:id/preview` is the conversion bridge to `/join/:code`, treat missing `active_invite_code` as a recoverable backend state, not a terminal UX. Add an explicit server-side invite bootstrap path and invoke it from preview fetch + one user-triggered retry.
- **Applies when:** A shareable trip URL must remain joinable even if legacy/manual invite rows were deactivated, expired, or deleted.
- **Avoid when:** Product policy explicitly requires hosts to manually create every invite and rejects auto-provisioning.
- **Evidence:** Trip preview previously returned no invite and blocked Join CTA. Adding `ensureInvite` to `get-trip-preview` plus a retry call from `TripPreview` restored deterministic join routing for existing shared trips.
- **Provenance:** April 2026 trip invite bootstrap hardening.
- **Confidence:** high

### When duplicated handlers exist across components, fixes that target one path leave the others broken — unify before patching
- **Tip:** When you find the same multi-step pipeline (`upload + persist + cleanup`, `fetch + transform + commit`, etc.) in three or more places, do not patch one location. Extract a single owner (hook or utility) and migrate every call site to it before fixing the underlying bug. Otherwise each "fix" silently regresses the unfixed paths.
- **Applies when:** Multi-step async pipelines appear in more than two components, especially when their cache invalidation or error handling differs.
- **Avoid when:** Components have legitimately different requirements — unify only the truly shared steps.
- **Evidence:** Trip cover photo upload had three call sites (`CreateTripModal`, `EditTripModal`/`TripCoverPhotoUpload`, `TripHeader`) with subtly different invalidation footprints. Past fixes touched one path each and never resolved the underlying beta complaint. Unification under `useCoverPhotoUpload` (`src/features/trips/hooks/useCoverPhotoUpload.ts`) eliminated the drift surface in a single PR.
- **Provenance:** May 2026 cover photo upload definitive fix (branch `claude/fix-cover-photo-upload-RodMM`).
- **Confidence:** high

### Never persist cache-busting query params into canonical DB columns
- **Tip:** Cache-busters (`?v=${Date.now()}`) belong in in-memory state only — never in the column you treat as canonical. Persisting them dirties the column with timestamps, breaks string-equality dedup, and forces every reader to strip the param. Apply the cache-buster after the DB write returns the canonical URL, not before.
- **Applies when:** Any flow that updates a media/asset URL column where browser/CDN caching is a concern.
- **Avoid when:** The "?v=" param is part of upstream signed-URL semantics (then it must be stored verbatim).
- **Evidence:** `TripHeader.tsx:377` and `TripCoverPhotoUpload.tsx:104` prepended `?v=${Date.now()}` BEFORE calling `updateCoverPhoto`, which then wrote the buster-decorated URL into `trips.cover_image_url`. Fix: pass canonical `publicUrl` to the persist step; let `appendCoverCacheBust` decorate only the local state URL post-write.
- **Provenance:** May 2026 cover photo upload definitive fix.
- **Confidence:** high

### Cache invalidation footprint is the contract — extract it once, reference it everywhere
- **Tip:** When multiple mutation hooks render the same logical entity across different list keys (e.g., `trips`, `proTrips`, `events`, `pending-request-trip-cards`), centralize the invalidation set in one utility and have every mutator call it. Inline invalidation in mutators is the #1 source of "feature works in path A but not path B" bugs.
- **Applies when:** A single underlying resource is rendered by 3+ list query keys after converter mapping.
- **Avoid when:** Lists are genuinely independent and a mutation legitimately affects only one.
- **Evidence:** `useTripCoverPhoto.invalidateTripCoverQueries` covered 6 keys; `useTrips.updateTripMutation` covered 1. `CreateTripModal` called the latter, leaving pro/event/pending-request lists stale on every new trip with cover. Extraction to `src/lib/tripCoverInvalidation.ts` made the contract explicit and re-usable for the new `useCoverPhotoUpload` hook.
- **Provenance:** May 2026 cover photo upload definitive fix.
- **Confidence:** high
