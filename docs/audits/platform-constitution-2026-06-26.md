# Chravel Platform Constitution Audit

Date: 2026-06-26
Branch: `cursor/chravel-platform-constitution-916e`

## 1. Executive Summary
- The biggest platform-wide structural risks are: fragmented permission models, shared-write paths that mix hardened RPCs with direct client writes, hybrid realtime without a universal reconnect contract, invite/join truth split across multiple states, and AI mutations that do not consistently obey the same safety rules as manual mutations.
- The platform is coherent where a single subsystem already established a local constitution: Stream trip-chat reconnect/backfill, payment settlement RPCs, notification fanout queues, and partial feature-flag/canary infrastructure. It is fragmented where similar concerns were solved per-feature instead of once for the platform: roles, shared-object writes, media uploads, event-scale rules, and access funnels.
- Safest current surfaces: core authenticated trip reads, Stream-backed trip chat reconnect on the main trip surface, payment settlement via atomic RPCs, and invite preview error taxonomy.
- Most dangerous surfaces under scale/concurrency: Pro/Event permissions, hot-trip/event realtime, AI cross-surface writes, media uploads/storage cleanup, invite/join acceptance, and any object family still using direct client writes with optimistic UI but no end-to-end idempotency or compare-and-swap.
- The architecture is salvageable with staged hardening. Chravel does not need a whole-platform rewrite, but it does need major redesign in five cross-cutting areas before high-stakes scale: one authorization resolver, one shared mutation contract, one realtime subscription/backfill contract, one upload/storage contract, and one AI mutation contract.

## 2. Full Platform System Map
### Major entities
- Identity and account lifecycle: `auth.users`, `profiles`, account-deletion flows in `docs/account-deletion.md`, `src/pages/DeleteAccountPage.tsx`, deletion workers/functions.
- Core trip supertype: `trips` with `trip_type` driving consumer, pro, and event shells. Current routes are in `src/App.tsx`.
- Membership and authority: `trip_members`, `trip_admins`, `trip_roles`, `user_trip_roles`, `channel_role_access`, `organization_invites`, `pro_trip_organizations`.
- Shared trip objects: `trip_tasks`, `trip_polls`, `trip_events`, `trip_links`, `trip_files`, `trip_media_index`, `trip_payment_messages`, `payment_splits`, `broadcasts`, `trip_join_requests`.
- Channel objects: `trip_channels`, `channel_members`, Stream channels, legacy `channel_messages`.
- AI and derived objects: `trip_pending_actions`, `concierge_tool_idempotency`, `kb_documents`, `kb_chunks`, `trip_embeddings`, `trip_artifacts`.

### Ownership model
- Canonical supertype is `trips`; subtype semantics are spread across route shells, hooks, RLS helpers, and sparse columns rather than clean subtype tables.
- `trip_members` is the closest thing to canonical membership truth, but authority is also encoded in `trip_admins`, `trip_roles`, and client-side role mapping hooks.
- Shared objects are mostly trip-scoped. Channel scoping exists for some media/link/file tables in schema, but client code does not populate `channel_id` consistently.
- User-private state exists in `notification_preferences`, personal basecamps, auth/session state, and local/demo stores. Private AI scratchpad is not rigorously separated from shared AI actions yet.

### Data flow boundaries
- Frontend app shell and routing: `src/App.tsx`, `src/pages/*`.
- Client permission shaping: `src/hooks/useMutationPermissions.ts`, `src/hooks/useRolePermissions.ts`, `src/hooks/useEventPermissions.ts`.
- Realtime transport: `src/hooks/stream/useStreamTripChat.ts`, `src/hooks/useNotificationRealtime.ts`, `src/hooks/useUserTripsRealtime.ts`, `src/hooks/useMediaManagement.ts`.
- Media/storage: `src/services/mediaService.ts`, `src/services/uploadService.ts`, `src/services/tripMediaService.ts`, `src/hooks/useResolvedTripMediaUrl.ts`.
- Invite/share/join: `src/pages/JoinTrip.tsx`, `src/pages/TripPreview.tsx`, `src/hooks/useInviteLink.ts`, `supabase/functions/join-trip/index.ts`, `supabase/functions/get-invite-preview/index.ts`, `supabase/functions/get-trip-preview/index.ts`.
- AI mutation path: `supabase/functions/_shared/concierge/toolRegistry.ts`, `supabase/functions/_shared/functionExecutor.ts`, `supabase/functions/lovable-concierge/index.ts`, `src/hooks/usePendingActions.ts`.
- Billing and quotas: `src/billing/entitlements.ts`, `src/billing/config.ts`, `src/utils/featureTiers.ts`, `supabase/functions/_shared/tripEntitlementPolicy.ts`, `supabase/functions/_shared/concierge/usagePolicy.ts`.

### Trust boundaries
- Browser client: untrusted for permissions, actor identity, shared-write ordering, and quota enforcement.
- Supabase RLS and SECURITY DEFINER RPCs: trusted data-plane enforcement when actually used.
- Edge functions: mixed quality. Some are strong gatekeepers; others use service role with ad-hoc validation and limited structured telemetry.
- Stream: separate transport/trust surface; membership repair exists, but Stream authorization must be kept in sync with Supabase membership truth.

### Shared state vs user-private state boundaries
- Trip-shared: tasks, polls, trip calendar, chat, broadcasts, payment requests, trip links, trip media, join requests.
- Channel-shared: chat/channel visibility and potentially media/files/links, but the implementation is partial.
- User-private: auth/session, profile/account settings, per-user notification prefs, personal basecamps, local offline queue, demo-mode state.
- Admin-only: trip admin controls, role assignment, channel creation, event moderation toggles, some cover/media controls.

### Invite/share access paths
- Invite link flow: `/join/:token`, `/j/:token` → `get-invite-preview` → auth → `join-trip` → `trip_join_requests` → `approve_join_request`.
- Share preview flow: `/t/:tripId`, `/trip/:tripId/preview` → `get-trip-preview`; it can mint or resolve invite context.
- Org invite flow: `/accept-invite/:token` and organization invite edge functions.

### Realtime boundaries
- Main trip chat: Stream WebSocket with reconnect backfill in `useStreamTripChat`.
- Pro channels: Stream without equivalent reconnect backfill.
- Everything else: Supabase `postgres_changes` listeners, usually per-hook and per-table, often invalidate-only.
- Several surfaces fake realtime by polling or by relying on query invalidation instead of event replay.

### AI mutation boundaries
- AI tools can read broadly across trip context and write across many shared object families.
- `trip_pending_actions` exists as a safety buffer, but many tools promote into shared tables immediately in `functionExecutor.ts`.
- AI rate limits and quotas exist, but tool execution cost and mutation semantics are not standardized per tool class.

### Likely scale bottlenecks
- Realtime/channel explosion per open trip, especially for event trips.
- Invite/join floods, because per-user rate limiting exists but per-trip burst containment is weak.
- Media upload/storage egress, because server-side quota enforcement is inconsistent and cleanup is fragmented.
- AI cost amplification, because one message can trigger multiple tools and external APIs under a single usage meter increment.
- Permission drift, because Pro/Event trust boundaries are not enforced through a single server-side resolver.

## 3. Platform Invariants
1. `trips` is the supertype. `trip_type` must be non-null and authoritative for route shell, permission template, fanout policy, and feature defaults.
2. `trip_members` is the only canonical membership table. Any admin/organizer/role abstraction must derive from or reference active membership rows.
3. Shared writes must never rely on client timing luck. Every shared create requires an idempotency key; every shared update requires compare-and-swap or an explicit serialized RPC.
4. RLS restricts visibility; it is not a substitute for lifecycle and integrity constraints. Load-bearing invariants belong in DB constraints/RPCs plus RLS.
5. Actor attribution is mandatory for every shared mutation: `actor_id`, `source_type`, `trip_id`, and object id must be recoverable.
6. AI and manual writes must obey the same permission and mutation rules. AI does not get a separate “faster” correctness model.
7. Invite acceptance truth must converge to: active invite exists, join request exists or active membership exists, and approval activates membership. Current repo reality is still split across `trip_invites`, legacy `invite_links` references, and multiple UI/docs assumptions; these states must not be inferred from UI alone.
8. Background/foreground reconnect must either backfill from a cursor or force a scoped refetch. “Realtime only” without a replay path is not allowed on collaborative surfaces.
9. Shared object deletion semantics must be explicit: archive, tombstone, or hard delete. Hidden rows are not “deleted” unless lifecycle says so.
10. Auditability is mandatory for money, access, admin actions, and AI-triggered shared writes; recommended for all trip-shared writes.

## 4. Object Scope Constitution
| Object class | Owner | Viewers | Editors | Mutation rules | Concurrency rules | Audit | Delete/archive |
|---|---|---|---|---|---|---|---|
| User-private objects | User | User, support/service-role if needed | User | Direct user action only | LWW acceptable for non-critical prefs; CAS for account/security state | Security/audit for auth/account changes | Soft delete or purge per account lifecycle |
| Trip-shared objects | Trip membership | Active trip members per RLS | Based on permission resolver | Must use canonical RPC/mutation service | Create: idempotency key. Update: CAS or serialized RPC | Required for payments, invites, admin, AI writes; preferred for tasks/polls/events | Archive where history matters; hard delete only via controlled job/RPC |
| Channel-scoped objects | Trip + channel membership | Channel audience | Channel-authorized members/mods/admins | Must carry `channel_id` and pass channel auth | Same as trip-shared plus channel membership checks | Required for moderation/admin actions | Archive with channel/thread context preserved |
| Event-wide objects | Event trip + organizer policy | Event attendees/read-only viewers | Organizers/admins by default; attendees only where explicitly allowed | Event defaults are restrictive at scale | No typing/presence dependency at large scale; posting rules tier by attendance | Required for moderation, roster, agenda imports, event announcements | Archive after event; cold-read path preferred |
| Admin-only objects | Trip/event/org admins | Admins/service-role | Admins/service-role | SECURITY DEFINER or hardened edge only | Serialized or CAS with audit | Mandatory | Append-only audit; soft delete preferred |
| Ephemeral state | Client/session/runtime | Current user/session | Current user/session/system | Never authoritative | Best effort; no business truth | Optional telemetry only | Expire automatically |
| Durable state | DB/storage canonical tables | Per RLS | Per permission resolver | One canonical write path | Explicit idempotency/CAS rules | Required on high-risk families | Lifecycle-specific |

## 5. Permission Model Constitution
### Roles
- Consumer trips: `creator`, `admin` (optional), `member`, `pending`, `left`.
- Pro trips: `creator`, `admin`, `editor`, `viewer`, plus optional custom roles mapped to a generated permission manifest.
- Event trips: `creator`, `organizer`, `moderator`, `attendee`, `pending`, `left`.

### Distinctions
- `admin`/`organizer` means operational authority: invites, role/channel changes, moderation, join approvals, read-only mode overrides.
- `moderator` is channel/content moderation only, not global trip administration.
- `viewer`/`attendee` can read shared state and only mutate the few families explicitly allowed by policy.

### Read-only vs full participation
- Pro viewer and Event attendee are server-enforced roles, not UI-only hints.
- Read-only mode must block shared mutations in RLS/RPCs, not just hide buttons.
- Event attendee posting permissions are explicit per event mode, not inferred from UI shell.

### Channel model
- Channels are trip-local children with explicit mode: `default`, `announcements`, `staff`, `role-gated`, or `custom`.
- Membership inheritance: by default, trip membership implies channel readability for public/default channels; posting authority depends on channel mode.
- User-created channels are off by default for events and on by explicit admin policy for Pro.
- Announcement channels are read-mostly; only organizers/admins/mods can post.

### Invite/share authority
- Only creator/admin/organizer may mint or revoke invite links.
- Share preview links are marketing/read-only surfaces; they are not join authority.
- Join approvals: consumer should move from “any member” to explicit approver set; pro/event approvers are creator/admin/organizer only.

### Explicit confirmation
- Destructive actions, membership-affecting actions, mass fanout, money actions, and AI writes to shared state require explicit confirm or a policy-backed auto-apply toggle.

### Server-side expectations
- One server-side resolver must answer `can(actor, trip, resource, action)` and be reused by RLS helpers, RPCs, edge functions, and AI executor guards.

## 6. Concurrency + Mutation Constitution
1. Required end state: every shared create gets a stable `mutation_id` and `idempotency_key`. Retries must reuse the same key.
2. Required end state: every shared update uses a version number or `updated_at` compare-and-swap. No silent last-write-wins fallback in production code.
3. Required end state: multi-table writes are one RPC or one edge transaction boundary. Client-orchestrated “insert A then insert B/C” is not acceptable for critical shared objects.
4. Last-write-wins is acceptable only for low-risk private preferences and ephemeral client state.
5. Merge policies:
   - Money: serialize and lock.
   - Membership/invite approval: serialize and audit.
   - Tasks/polls/calendar: CAS with conflict UI or deterministic retry.
   - Chat messages: idempotent append-only.
   - Media indexes: idempotent create plus storage cleanup on partial failure.
6. Duplicate suppression must be standardized, not ad hoc by feature. Content-window dedupe is not enough for shared integrity.
7. AI-triggered writes must reserve idempotency before side effects and must hit the same canonical RPCs/manual services as user-triggered writes.
8. Optimistic UI must carry a mutation id and reconcile against server truth; realtime must never regress a confirmed optimistic write without a conflict signal.
9. Audit trail fields for high-risk objects: `trip_id`, `object_type`, `object_id`, `actor_id`, `source_type`, `mutation_id`, `idempotency_key`, `before_version`, `after_version`.

## 7. Access Funnel Constitution
1. Target state: `trip_invites` is the only canonical invite table. Current repo reality still contains legacy `invite_links` references in docs/tests, so removal must happen through an explicit compatibility window or a compatibility view rather than by assuming the split-brain is already gone.
2. Invite links create join intent; share links create preview intent. These are separate trust boundaries.
3. Account creation during invite acceptance must preserve invite context through one canonical storage/redirect mechanism.
4. Membership truth:
   - active: `trip_members.status in (null,'active')`
   - pending: `trip_join_requests.status='pending'`
   - left: not active; may rejoin through request path
5. Duplicate joins must be idempotent and should reactivate `status='left'` memberships on approval instead of silently no-oping.
6. `current_uses` counts one event only, ideally approval/member activation, not both request submission and approval.
7. Expired/invalid/revoked links must always resolve to structured error UI with recovery CTA; never raw JSON or ambiguous redirects.
8. Wrong-trip/wrong-event routing must be prevented by canonical trip-type route resolution after preview or join.
9. Public preview surfaces may expose only deliberately public metadata; auth-less preview must be rate-limited and privacy-reviewed.
10. Join flood controls must include per-user and per-trip rate limits, plus organizer-side throttles for notifications.

## 8. Realtime + Sync Constitution
1. Every collaborative surface must declare a transport class: Stream, Supabase Realtime, polling, or eventual-only.
2. One realtime hub per `trip_id` and one per `user_id`; hooks should multiplex table listeners instead of opening many independent channels.
3. Reconnect/backfill is mandatory:
   - Stream chat: cursor replay
   - invalidate-only surfaces: reconnect refetch
   - high-frequency collaborative lists: cursor/backfill where practical
4. Multi-device consistency requires that unread state, notification state, and chat read state share clear source-of-truth rules.
5. Hot event defaults:
   - no typing/presence at high attendance
   - announcements/read-only channels by default
   - admin-only or rate-limited posting above thresholds
6. Background/foreground lifecycle must use the same backfill contract on web and native shell.
7. Eventual consistency is acceptable for analytics, derived search/tagging, and non-critical enrichment; not for membership, money, invites, or moderation.

## 9. Scale-Tier Architecture Plan
### Stage A: 100–1,000 active users
- Primary bottlenecks: permission drift, direct client shared writes, invite context loss, AI mutation inconsistency.
- Required infra changes: none dramatic; focus on canonical RPC/resolver adoption and feature-flag wiring.
- Required integrity changes: idempotency keys on all creates, CAS on updates, unify `trip_invites`, remove LWW fallbacks.
- Required observability: mutation ids, request ids, journey telemetry for auth/join/open/send.
- First risky surfaces: invite/join, tasks/polls/calendar writes, AI fast-paths.
- Acceptable now but will fail later: many per-table realtime listeners, client-side quota enforcement, UI-only read-only rules.

### Stage B: 1,000–10,000
- Primary bottlenecks: hot trips, media egress, notification fanout, Stream/Supabase sync drift.
- Required infra changes: trip realtime hub, priority queues for notifications, unified upload pipeline, per-trip rate limits.
- Required integrity changes: transaction-bound task/poll/calendar/payment creates, channel-scoped enforcement.
- Required observability: queue depth, reconnect/backfill rates, upload failures, invite conversion, cost-per-feature.
- First risky surfaces: media, event chat, notifications, org invites, join floods.
- Acceptable now but will fail later: invalidate-only realtime for hot collaborative surfaces, no backlog-aware degradation.

### Stage C: 10,000–100,000
- Primary bottlenecks: event-scale fanout, search/index drift, backlog growth, hot-channel moderation.
- Required infra changes: queue priority lanes, event-mode throttles, server-side media quota enforcement, union pagination RPCs, possibly dedicated workers for AI/import.
- Required integrity changes: subtype extension tables for trip variants, normalized poll vote model, trip mutation audit log.
- Required observability: tier-based SLIs, burn-rate alerts, per-trip hotness metrics, and generalized canary automation beyond the currently partial chat-focused machinery.
- First risky surfaces: event trips, Pro channels, AI tools, mass notifications.
- Acceptable now but will fail later: sparse columns for subtype behavior, client-orchestrated multi-step writes.

### Stage D: 100,000–1,000,000+
- Primary bottlenecks: global cost exposure, historical data size, broad multi-tenant contention, provider dependency concentration.
- Required infra changes: partition/cold storage strategy, stronger bulkheads by feature class, priority lanes by plan, DR drills, formal incident automation.
- Required integrity changes: fully standardized mutation contracts, strict downstream contract versioning, storage/object reconciliation jobs.
- Required observability: end-to-end tracing/correlation, automated restore verification, mature event-launch stress gates.
- First risky surfaces: all hot realtime and storage/AI paths if not redesigned earlier.
- Acceptable now but will fail later: fail-open quota checks, manual ops playbooks, no event-specific degrade modes.

## 10. Free vs Paid QoS Constitution
- Free usage must never consume the same operational headroom as premium/pro event operations on Tier-0 and Tier-1 surfaces.
- Plan-aware protections:
  - stricter AI/import/voice/media rate limits for free
  - reserved capacity for Pro/Event admin controls, join approvals, and notification delivery
  - faster or higher retry budgets for paid on core operational surfaces, not on cost-heavy optional features
- Degraded behavior:
  - Free loses Tier-2 features first
  - paid consumer loses enrichment next
  - Pro/Event should preserve auth, trip reads, admin controls, approvals, and core announcement/chat surfaces as long as possible
- Feature-level limits must be server-enforced for AI, voice, uploads, payment actions, invites, and event attendee operations.
- Event-host/admin protections: protected quotas for announcement posting, roster access, join approvals, and moderation during spikes.
- Abuse containment: per-trip and per-user limits for join floods, AI spam, upload storms, and notification fanout.

## 11. Dangerous Surface Ranking
1. Chat and channels — Severity: Critical. Failure shape: missed messages, permission drift, hot-channel saturation. Blast radius: full trip/event collaboration.
2. AI Concierge writes — Severity: Critical. Failure shape: duplicate/shared-state corruption, ungoverned fanout, cost spikes. Blast radius: many object families at once.
3. Invites/shares/join flow — Severity: High. Failure shape: conversion loss, unauthorized access, duplicate membership, exhausted links. Blast radius: onboarding and trust.
4. Tasks/polls/calendar/basecamp shared writes — Severity: High. Failure shape: conflicting updates, partial creates, stale optimistic UI. Blast radius: trip planning integrity.
5. Media uploads/storage — Severity: High. Failure shape: quota bypass, orphaned blobs, broken previews, event upload storms. Blast radius: cost and user trust.
6. Payments/expense actions — Severity: High. Failure shape: inconsistent settlement/accounting. Blast radius: financial correctness.
7. Auth/account lifecycle — Severity: High. Failure shape: session drift, deletion cleanup gaps, reset/revoke inconsistencies. Blast radius: platform-wide access and compliance.
8. Account deletion — Severity: High. Failure shape: incomplete purge, retained blobs, broken attribution retention. Blast radius: compliance and trust.

## 12. Recommended Immediate Platform Changes
1. Consolidate authorization into one shared server-side resolver and rewire RLS helpers/RPCs/edge functions to it.
2. Standardize shared mutation semantics: mutation ids, idempotency keys, CAS, and canonical RPCs for shared object families.
3. Replace AI fast-path promotions with one explicit AI mutation pipeline that can either auto-apply by policy or require confirm by contract.
4. Unify invite/share truth around `trip_invites`, fixed membership-state semantics, and one invite-context persistence mechanism.
5. Build a single upload/storage pipeline with server-side quota enforcement, normalized metadata, and cleanup guarantees.
6. Build a trip-scoped realtime hub and a common reconnect/backfill wrapper for all collaborative hooks.
7. Wire feature flags/kill switches into core AI, voice, payments, and notification surfaces, not just optional UI features.
8. Add a platform mutation/audit log for payments, invites, admin actions, and AI-triggered shared writes.
9. Add per-trip hotness rate limits and event-mode defaults for chat/posting/media.
10. Expand observability to include request ids, mutation ids, channel ids, degraded-mode events, and event/join funnel telemetry.

## 13. Exact Platform Changes
### Code areas to modify
- Routing and shell resolution: `src/App.tsx`, trip detail pages, notification/join/share routers.
- Permissions: `src/hooks/useMutationPermissions.ts`, `src/hooks/useRolePermissions.ts`, `src/hooks/useEventPermissions.ts`, relevant RLS helpers and RPCs in `supabase/migrations/*`.
- Invites/join: `src/pages/JoinTrip.tsx`, `src/pages/TripPreview.tsx`, `src/hooks/useInviteLink.ts`, `supabase/functions/join-trip/index.ts`, `approve_join_request` RPC migrations.
- AI executor: `supabase/functions/_shared/functionExecutor.ts`, `toolRegistry.ts`, `lovable-concierge`, `src/hooks/usePendingActions.ts`.
- Realtime: `src/hooks/stream/useStreamTripChat.ts`, `useStreamProChannel.ts`, `useUserTripsRealtime.ts`, `useNotificationRealtime.ts`, `useMediaManagement.ts`, and a new trip realtime hub module.
- Media/storage: `src/services/mediaService.ts`, `src/services/uploadService.ts`, `src/services/tripMediaService.ts`, event agenda/lineup upload hooks, deletion/account cleanup paths.
- Feature flags and telemetry: `src/lib/featureFlags.ts`, `src/telemetry/*`, `supabase/functions/_shared/featureFlags.ts`, `supabase/functions/_shared/telemetry.ts`.

### Schema / index / policy changes
- Enforce `trips.trip_type` non-null with controlled compatibility migration.
- Add or complete unique idempotency indexes for shared object families.
- Add canonical permission resolver functions and rebind policies to them.
- Normalize invite/join approval semantics and usage counters.
- Add server-side upload quota checks and storage-path canonical columns if needed.
- Add `trip_mutation_log` (or equivalent) for high-risk objects.
- Seed missing kill-switch flags such as `stream_changes_canary` and any referenced but unseeded flags. Current repo evidence suggests partial canary infrastructure exists for chat, but broader release documentation still treats the wider canary story as incomplete, so this should be treated as a cleanup-and-generalization task rather than a solved platform capability.

### Env / infra changes
- Ensure feature-flag checks exist on edge hot paths.
- Introduce queue priority metadata for notification and other async work.
- Add event hotness metrics and load thresholds to ops dashboards.
- Define voice/AI cost ceilings and enforce them per tier.

### Migration order
1. Expand: add new resolver/RPCs/columns/indexes without removing old paths.
2. Dual-read/write: update client and edge paths to use new contracts while tolerating old state.
3. Observe: run telemetry and parity checks.
4. Contract: remove legacy tables/paths (`invite_links`, unused upload paths, stale permission branches, LWW fallbacks).

### Repo-mandated paired artifacts and gates
- Any schema migration must follow the repo's two-phase expand/contract discipline, use backward-compatible DDL, and pass the migration lint gate (`npx tsx scripts/lint-migrations.ts`) plus the migration safety rules documented in `CLAUDE.md`.
- Any schema change that affects generated DB types must regenerate `src/integrations/supabase/types.ts` in the same diff and satisfy `scripts/check-schema-drift.ts`.
- Any permission-model change that affects generated permission artifacts must regenerate `permissionMatrix.generated.ts` (or the repo's current generated permission artifact) and pass `scripts/check-permission-matrix-drift.mjs` in the same diff.
- Any feature-flag or kill-switch change must be wired in both client and edge code paths and documented as reversible.
- Any cross-boundary contract change should be paired with the repo's existing drift guards instead of living only in prose.

### Deployment order
1. DB expand migrations
2. Edge function updates
3. Client updates
4. Feature-flag/canary enablement
5. Cleanup/contract migrations

### Rollback plan
- Use feature flags to disable new write paths or AI/voice/event-scale behaviors.
- Keep old read compatibility during expansion window.
- For schema changes, prefer forward-fix rather than destructive rollback; no irreversible contract migration should ship without a documented forward-fix path.

## 14. Verification + Load Plan
### Contract tests
- Trip-type route resolver, permission resolver parity, invite/share route contract, kill-switch enforcement.

### Permission tests
- Role-based create/update/delete across consumer/pro/event.
- Read-only viewer/attendee enforcement.
- Channel posting restrictions and announcement modes.
- Admin-only operations and private-vs-shared isolation.

### Concurrency tests
- Duplicate create retries with same idempotency key.
- Multi-user concurrent edits on tasks, polls, calendar, basecamp.
- AI + manual concurrent writes to same object.
- Invite acceptance duplicates and left-member rejoin.
- Payment settlement/edit races.

### Realtime tests
- Stream reconnect/backfill for trip chat and pro channels.
- Background/foreground recovery.
- Multi-device consistency for unread state and notifications.
- Hot room/event subscription load and cleanup.

### Funnel + access tests
- Mass invite send and mass join spikes.
- Invalid/expired/revoked link paths.
- Wrong-object routing prevention.
- Signup/login from invite across OAuth and email/password.

### Media tests
- Concurrent upload stress.
- Partial upload failure cleanup.
- Auth correctness for signed URLs.
- Event-scale attachment load and media invalidation storms.

### Account lifecycle tests
- Signup/login spikes.
- Password reset/change.
- Account deletion with storage cleanup.
- Attribution preservation where required.

### Repro steps and rollout guardrails
- Local: deterministic demo/fixture scripts plus targeted edge/RPC tests.
- Staging: multi-user scripted scenarios, synthetic joins, seeded hot-trip/event fixtures.
- Synthetic load: k6/Artillery scenarios for join floods, chat bursts, media uploads, AI bursts.
- Success criteria: zero duplicate membership writes, zero unauthorized shared writes, bounded reconnect recovery, bounded queue age, bounded AI/tool spend, and predictable degraded-mode behavior.

## 15. Platform Scorecard
| Area | Score | Why it is below 95 |
|---|---:|---|
| Domain model coherence | 78 | Trip subtype semantics and channel/shared-object scopes are implied in multiple layers, not encoded once. |
| Scope/ownership clarity | 72 | `trip_members`, `trip_admins`, `trip_roles`, channel scopes, and media/file/index paths overlap. |
| Authorization model | 68 | UI guards are ahead of server truth; Pro/Event read-only is not consistently enforced server-side. |
| Shared-write safety | 70 | Good RPC pockets exist, but direct client multi-step writes and LWW fallbacks remain. |
| Idempotency/deduplication | 66 | Present in some domains, missing or unwired in many shared create paths and the main AI path. |
| Realtime architecture | 74 | Main trip chat is solid; the rest is fragmented, channel-heavy, and backfill-inconsistent. |
| Invite/share/join safety | 69 | Good edge validation exists, but membership truth, usage counters, and storage of invite context are inconsistent. |
| Media/storage robustness | 64 | Dual pipelines, fail-open quotas, orphan cleanup gaps, and private/public URL drift remain. |
| AI cross-surface mutation safety | 61 | Tool registry is strong, but mutation semantics, idempotency, and approval behavior are inconsistent. |
| Plan-aware traffic shaping | 58 | Limits exist, but QoS classes, reserved capacity, and paid-vs-free runtime isolation are weak. |
| Observability | 67 | Good client event schema and docs, but edge telemetry adoption, correlation ids, and alert automation lag. |
| Rollback readiness | 63 | Chat/Stream has the most mature canary shape in the repo, but most other surfaces still lack enforced kill-switch/canary/forward-fix patterns. |
| Production readiness | 71 | Salvageable with staged hardening, but not yet safe for high-stakes event/pro scale. |

### Recommended follow-up prompt sequence
1. Permission model hardening constitution → implement single resolver + RLS/RPC parity.
2. Shared mutation and idempotency hardening → tasks/polls/calendar/basecamp/payments.
3. Invite/share/join hardening → membership truth, counters, storage context, org invites.
4. Realtime hub and reconnect hardening → trip-scoped multiplexer + pro-channel backfill.
5. Media/storage hardening → one upload path, server quotas, cleanup, event file indexing.
6. AI mutation hardening → one execution path, policy-backed confirmation, idempotency.
7. QoS and event-scale mode hardening → per-plan headroom, hot-event throttles, queue priority.
8. Observability/rollback hardening → correlation ids, kill-switch wiring, load/drill gates.
