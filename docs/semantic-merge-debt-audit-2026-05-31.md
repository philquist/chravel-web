# Semantic Merge Debt Audit

Audit date: 2026-05-31
Branch: `cursor/semantic-merge-debt-audit-efb1`
Scope: static, code-level post-merge conflict debt audit across frontend, edge functions, hooks, services, stores, types, and critical product flows.

## Executive Summary

Overall assessment: **Tangled, with several production-risk merge-debt seams.** The codebase shows clear evidence of partial migrations where both old and replacement implementations were preserved: TanStack Query layered over local state, Stream layered over legacy Supabase chat, unified billing layers left beside older subscription providers, AI pending-action cards layered beside DB auto-confirm, and desktop fixes not consistently propagated to mobile/pro/event shells.

Severity score: **78 / 100**. Higher is worse: 0-20 is clean, 21-40 is manageable drift, 41-65 is material debt, 66-85 is high-risk semantic debt, and 86-100 is systemic production instability. This audit lands at 78 because several findings are confirmed user-facing bugs or critical-path conflicts, but the codebase is not in a complete outage state.

Confidence level: **High**. The highest-risk findings were verified directly in source files. Some lower-priority findings are architectural smells rather than confirmed current bugs.

Top 10 highest-risk areas:

1. `ProUpgradeModal` sends `pro-growing`, while `create-checkout` only prices `pro-growth`.
2. Consumer trip detail loads members through three active paths with separate cache, realtime, and mutation semantics.
3. Trip chat edit/delete handlers are Stream-backed, but `MessageItem`/`MessageActions` default to legacy transport unless explicitly overridden.
4. AI pending actions have three orchestration models: server fast-path, DB auto-confirm hook, and message-embedded confirmation cards.
5. Billing and entitlements have five client read paths and several server selectors with conflicting semantics.
6. Quota and feature limits are duplicated with conflicting numbers, and trip payment split limits are not server-enforced.
7. Demo mode is determined by multiple flags and incompatible trip-ID heuristics.
8. Authenticated trip detail still uses `generateTripMockData` for tab context, preserving demo scaffolding on real trips.
9. Mobile media link deletion merges two link tables but deletes only from `trip_links`.
10. AI voice and Smart Import flows preserve multiple partially migrated execution stacks.

Remediation decision vocabulary used below:

- **Immediate:** confirmed production-risk bug or safety issue; fix before related work proceeds.
- **Phase 1:** critical cleanup batch for active high-risk paths.
- **Phase 2:** architecture consolidation after immediate production risks are stabilized.
- **Phase 3:** dead code, stale type, and adapter cleanup once ownership is clear.
- **Conditional blocker:** must be resolved before the named feature or release path is enabled.

## Findings

### 1. Pro Checkout Tier Drift Breaks Growth Upgrade

Severity: **Critical**  
Category: **Actual bug / API contract drift / revenue path**

Files involved:

- `src/components/ProUpgradeModal.tsx`
- `src/constants/stripe.ts`
- `supabase/functions/create-checkout/index.ts`

Why this looks like merge debt:

The product-facing tier name `growing` was mapped to a legacy API tier `pro-growing`, while the edge checkout function prices the canonical tier `pro-growth`. `src/constants/stripe.ts` also contains both old and new naming concepts, suggesting a tier rename was resolved by preserving both sides.

Exact conflicting logic or duplicated responsibility:

`ProUpgradeModal` sends `SUBSCRIPTION_TIER_MAP.growing`. That map returns `pro-growing`. `create-checkout` has price IDs for `pro-starter`, `pro-growth`, and `pro-enterprise`, but not `pro-growing`.

User-facing risk:

Users selecting the Pro Growth/Growing plan hit checkout failure instead of Stripe. This is direct conversion and revenue loss.

Engineering risk:

Every billing surface can drift if local string maps remain the contract. It also makes tests pass when they mock the edge response but production rejects the payload.

Recommended fix:

Create one canonical billing tier enum and map UI labels to `pro-growth` everywhere. If backward compatibility is required, normalize `pro-growing` to `pro-growth` at the edge and add a test proving both map to the same price.

Fix now or later:

**Fix now.** This is a confirmed production-risk bug.

### 2. Trip Members Have Three Active Sources Of Truth

Severity: **Critical**  
Category: **Duplicate logic paths / conflicting state management / performance**

Files involved:

- `src/pages/TripDetailDesktop.tsx`
- `src/hooks/useTripDetailData.ts`
- `src/hooks/useTripMembers.ts`
- `src/hooks/useTripMembersQuery.ts`
- `src/components/TripHeader.tsx`
- `src/components/payments/PaymentsTab.tsx`
- `src/components/mobile/MobileTripPayments.tsx`

Why this looks like merge debt:

`TripDetailDesktop` comments say trip data moved to a unified TanStack Query hook, but `useTripMembers` remains mounted for actions. A newer `useTripMembersQuery` also exists and is used by tab surfaces. Each path answers the same question: who are the trip members?

Exact conflicting logic or duplicated responsibility:

`useTripDetailData` fetches members via `tripService.getTripMembersWithCreator` and stores them in a query. `useTripMembers` uses local React state, direct Supabase reads, and a background creator auto-fix write. `useTripMembersQuery` uses TanStack Query, a direct Supabase realtime channel, and a smaller `TripMember` type without `role`.

User-facing risk:

Member count, roster, payments, permissions, and chat can disagree. Users may see a creator or role in one tab but not another, especially after remove/leave or realtime updates.

Engineering risk:

Every trip open can do redundant network work. Cache invalidation in one path does not reliably update the other paths. Tests can cover one hook while production uses another.

Recommended fix:

Collapse to one canonical `useTripMembers` built on TanStack Query. Port role, creator display fallback, mutations, Stream membership sync, and realtime invalidation into that hook, then delete the local-state hook.

Fix now or later:

**Fix now.** This touches trip access, payments, chat permissions, and member management.

### 3. Trip Detail Query Keys Drift From Prefetch And Invalidation

Severity: **High**  
Category: **Cache contract drift / performance regression**

Files involved:

- `src/hooks/useTripDetailData.ts`
- `src/hooks/usePrefetchTrip.ts`
- `src/lib/queryKeys.ts`
- `src/components/EditTripModal.tsx`

Why this looks like merge debt:

Auth-scoped query keys were added to the detail hook to prevent anon cache poisoning, but prefetch still writes to the older bare `tripKeys.detail(tripId)` key. Members have the same problem: the active hook includes a demo-member revision suffix and fetches `getTripMembersWithCreator`, while prefetch uses the older bare key and `getTripMembers`.

Exact conflicting logic or duplicated responsibility:

`useTripDetailData` uses `tripKeys.detail(tripId)` plus `authUserId`; `usePrefetchTrip` uses only `tripKeys.detail(tripId)`. `useTripDetailData` member query uses `getTripMembersWithCreator`; `usePrefetchTrip` uses `getTripMembers`.

User-facing risk:

Hover/tab prefetch can miss the query actually used at render time. Retry and invalidation paths can refresh stale keys without updating visible UI.

Engineering risk:

Performance work looks implemented but is ineffective. Cache bugs become hard to diagnose because keys are visually similar but semantically different.

Recommended fix:

Move key construction into typed factory functions such as `tripKeys.detail(tripId, userId)` and `tripKeys.members(tripId, options)`. Require every prefetch, invalidation, mutation, and hook to use those factories.

Fix now or later:

**Fix in Phase 1.** It should be part of trip-member consolidation.

### 4. Stream Chat Edit/Delete Can Fall Back To Legacy Mutations

Severity: **Critical**  
Category: **Actual bug / conflicting side effects / transport migration debt**

Files involved:

- `src/features/chat/components/TripChat.tsx`
- `src/features/chat/components/MessageItem.tsx`
- `src/features/chat/components/MessageActions.tsx`
- `src/features/chat/services/legacyMessageMutations.ts`
- `src/services/chatService.ts`

Why this looks like merge debt:

The parent chat surface has Stream edit/delete callbacks, but the shared message action component defaults to `legacy` transport. Pro channel chat passes transport mode explicitly; trip chat does not. This is a classic preserved-both migration seam.

Exact conflicting logic or duplicated responsibility:

`TripChat` passes `onEdit` and `onDelete` to `MessageItem` but does not pass `transportMode="stream"`. `MessageItem` defaults `transportMode` to `legacy`. `MessageActions` then calls `editLegacyMessage` or `deleteLegacyMessage`, which reaches `chatService` legacy guards when Stream is configured.

User-facing risk:

Edit/delete actions can fail in the main trip chat even though the Stream callbacks are present. In some cases users may see error handling from the legacy guard rather than the Stream operation.

Engineering risk:

Tests that call callbacks directly can pass while the real UI path routes through the wrong transport. Stream migration remains incomplete and fragile.

Recommended fix:

Pass the canonical transport mode through every TripChat message action path, including replies. Then remove the legacy default from Stream-mounted surfaces and add a component-level test that exercises `MessageActions`, not only parent callbacks.

Fix now or later:

**Fix now.** This is a high-use critical path.

### 5. Stream Mutation Error Contract Causes Double Or False Toasts

Severity: **High**  
Category: **Conflicting side effects / inconsistent UX**

Files involved:

- `src/features/chat/components/MessageActions.tsx`
- `src/features/chat/components/TripChat.tsx`
- `src/components/pro/channels/ChannelChatView.tsx`

Why this looks like merge debt:

One layer treats Stream callbacks as fire-and-throw operations; another layer catches and toasts errors without rethrowing. Both layers also own success/error UX.

Exact conflicting logic or duplicated responsibility:

`MessageActions` treats `await onEdit()` and `await onDelete()` as success if the promise resolves. Parent handlers catch Stream errors and toast failure but do not consistently rethrow. Pin toggles can toast in the parent and again in `MessageActions`.

User-facing risk:

A failed Stream edit/delete can show a success toast after an error toast. Pin failure can produce duplicate error messages.

Engineering risk:

The shared component cannot know whether the parent handled the side effect. This invites more double-toasts and masked failures as actions expand.

Recommended fix:

Make one layer own mutation UX. Prefer parent Stream hooks returning a typed result and `MessageActions` displaying exactly one toast based on that result, or parent handlers throwing and `MessageActions` owning all toasts.

Fix now or later:

**Fix in Phase 1.** It should be paired with the transport-mode fix.

### 6. Share/Upload Sends Can Fall From Stream Into Guarded Legacy Chat

Severity: **High**  
Category: **Conflicting side effects / migration fallback bug**

Files involved:

- `src/hooks/useShareAsset.ts`
- `src/services/stream/tripMessageTransport.ts`
- `src/services/chatService.ts`
- `src/services/stream/streamTransportGuards.ts`

Why this looks like merge debt:

The upload/share path added a Stream-first helper but preserved the old Supabase send fallback. The fallback conflicts with the Stream guard that intentionally disables legacy chat mutations when Stream is configured.

Exact conflicting logic or duplicated responsibility:

`sendTripMessageViaStream` returns `null` when Stream is not active or the channel is unavailable. `useShareAsset` then calls `sendChatMessage`. `chatService` throws when Stream is configured.

User-facing risk:

Uploads or shared assets can complete storage/index writes but fail to post the companion chat message, especially during connection or Stream initialization races.

Engineering risk:

Fallback logic that used to be defensive now routes into a deliberately disabled transport. This makes outages look like upload failures rather than transport readiness failures.

Recommended fix:

When Stream is configured, treat inactive Stream as a retryable Stream error instead of falling back to legacy chat. Only allow legacy fallback when the environment explicitly enables legacy chat.

Fix now or later:

**Fix in Phase 1.** It is a critical chat/media path.

### 7. AI Pending Actions Are Split Across DB Auto-Confirm And Message Cards

Severity: **Critical**  
Category: **Conflicting state management / double side effects / AI write safety**

Files involved:

- `src/hooks/usePendingActions.ts`
- `src/pages/TripDetailDesktop.tsx`
- `src/components/AIConciergeChat.tsx`
- `src/features/chat/components/ChatMessages.tsx`
- `src/features/chat/components/PendingActionCard.tsx`
- `supabase/functions/_shared/functionExecutor.ts`

Why this looks like merge debt:

The original human-confirmation model writes `trip_pending_actions` and renders cards. Later fast-path server promotion and client auto-confirm were layered in without removing or redefining the confirmation UI contract.

Exact conflicting logic or duplicated responsibility:

The trip shell mounts `usePendingActions` to auto-confirm actions even when Concierge is not open. `AIConciergeChat` mounts the same hook again. `ChatMessages` renders confirmation cards only from `message.pendingActions`, not from the hook's `pendingActions`. Each hook instance has separate `autoConfirmedIds` and `inFlightConfirms` refs.

User-facing risk:

AI-created events/tasks/polls can silently write without visible confirmation, or confirmation cards can appear after the DB row was already confirmed. Duplicate hook mounts can race to confirm the same pending row.

Engineering risk:

The safety boundary described in comments is no longer a single design. UI, hook, and server disagree about whether AI writes are pending, confirmed, or promoted.

Recommended fix:

Pick one orchestration model. Either render DB-backed pending-action cards from a single shell-owned hook, or remove DB-backed confirmation UX and make server fast-path explicit. Do not mount auto-confirm in multiple places. Add a test proving one pending action produces one mutation.

Fix now or later:

**Fix now.** This is an AI mutation safety issue.

### 8. LiveKit Agent Tools Bypass The Canonical Concierge Executor Shape

Severity: **High**  
Category: **API contract drift / duplicate tool executors**

Files involved:

- `agent/src/tools.ts`
- `supabase/functions/_shared/functionExecutor.ts`
- `src/hooks/usePendingActions.ts`
- `supabase/functions/_shared/concierge/toolRegistry.ts`

Why this looks like merge debt:

The registry says tool declarations are canonical, but the LiveKit agent reimplements write-tool execution and inserts raw payloads into `trip_pending_actions`. The edge executor partially normalizes payloads into the shapes the client confirm switch expects, but even the canonical path still has task-assignee shape drift that needs to be resolved at the same boundary.

Exact conflicting logic or duplicated responsibility:

For `addToCalendar`, the agent schema uses `datetime` and `notes`; `functionExecutor` writes `start_time`, `end_time`, and `description`. `usePendingActions` confirms by reading `start_time`, `end_time`, and `description`. For `createTask`, the agent uses `assignee`; the confirm hook reads `assignedTo`.

User-facing risk:

If the voice/agent path is re-enabled, pending confirms can create invalid or incomplete tasks/events even though the text path works.

Engineering risk:

Parity tests can pass at tool-name level while payload shape is broken. Two executors will drift on every new tool.

Recommended fix:

Route agent writes through `execute-concierge-tool` or import the same normalization layer, and explicitly normalize task assignees into the shape `usePendingActions` consumes. Add payload-shape parity tests for each mutating tool, not just name parity.

Fix now or later:

**Conditional blocker:** decide the voice product path in Phase 1. If LiveKit/agent voice remains a release path, route agent writes through the canonical executor and fix task-assignee normalization before enabling it. If voice remains dictation-only, remove the agent path in Phase 3.

### 9. Pending-Action Renderer Covers Fewer Tools Than The Confirm Switch

Severity: **High**  
Category: **UI/UX conflict debt / partial migration**

Files involved:

- `src/features/chat/components/PendingActionCard.tsx`
- `src/hooks/usePendingActions.ts`
- `supabase/functions/_shared/functionExecutor.ts`

Why this looks like merge debt:

The confirm switch grew to cover many tool types, while the card title/icon/detail logic covers a smaller subset. This indicates separate branches extended execution and rendering independently.

Exact conflicting logic or duplicated responsibility:

`usePendingActions` handles tools such as `updateTask`, `deleteTask`, `closePoll`, `saveLink`, `createBroadcast`, `createNotification`, and `settleExpense`. `PendingActionCard` renders known labels/details for a smaller set and falls through to `Unknown action` for others.

User-facing risk:

Users may be asked to confirm an ambiguous AI write with no useful title or details, or may not see a card at all if the action only exists in the DB-backed path.

Engineering risk:

Adding a new tool can be “implemented” in executor and confirm switch while shipping poor or missing UX.

Recommended fix:

Generate pending-action display metadata from the tool registry or add a coverage test requiring every confirmable tool to have card title/detail metadata.

Fix now or later:

**Fix in Phase 2.** Pair with pending-action consolidation.

### 10. Smart Import Has Four Pipelines And Multiple Payload Contracts

Severity: **High**  
Category: **Data-flow inconsistency / duplicate services / API drift**

Files involved:

- `supabase/functions/_shared/functionExecutor.ts`
- `src/features/smart-import/`
- `src/components/SmartImport.tsx`
- `supabase/functions/file-ai-parser/index.ts`
- `supabase/functions/enhanced-ai-parser/index.ts`
- `supabase/functions/scrape-schedule/index.ts`
- `supabase/functions/scrape-agenda/index.ts`
- `supabase/functions/scrape-lineup/index.ts`
- `src/utils/calendarImportParsers.ts`
- `src/utils/agendaImportParsers.ts`
- `src/utils/lineupImportParsers.ts`

Why this looks like merge debt:

Concierge preview, modal imports, file upload parsing, and URL scraping all parse and commit trip data with overlapping but different contracts. This looks like feature branches adding import capabilities to different surfaces and accepting both implementations.

Exact conflicting logic or duplicated responsibility:

Concierge preview emits camelCase `startTime`/`endTime`; pending-action confirmation writes snake_case `start_time`/`end_time`; artifact import uses `ReservationData`; scraper and parser functions maintain separate prompt and JSON parsing helpers.

User-facing risk:

The same itinerary source can import with different categories, duplicate detection, paywall behavior, or event fields depending on entry point.

Engineering risk:

Bug fixes to parsing, usage charging, or idempotency must be repeated across several functions.

Recommended fix:

Define one Smart Import extraction contract and one commit service. Make Concierge preview, file upload, URL scrape, and modal review thin adapters into that contract.

Fix now or later:

**Fix in Phase 2.** It is a significant architectural consolidation.

### 11. Voice AI Stack Is Partially Removed But Backend Paths Remain

Severity: **High**  
Category: **Zombie code / architectural regression**

Files involved:

- `src/features/concierge/hooks/useConciergeVoice.ts`
- `src/hooks/useWebSpeechVoice.ts`
- `agent/src/tools.ts`
- `agent/src/prompt.ts`
- `agent/src/dataMessages.ts`
- `supabase/functions/livekit-token/index.ts`
- `supabase/functions/create-openai-realtime-session/index.ts`
- `supabase/config.toml`

Why this looks like merge debt:

Frontend voice currently resolves to Web Speech dictation, but LiveKit/Gemini agent code, token functions, and OpenAI realtime session infrastructure remain. Supabase config still references deleted Gemini voice functions.

Exact conflicting logic or duplicated responsibility:

Voice has at least three historical execution models: frontend dictation, LiveKit/Gemini agent, and OpenAI realtime session. The visible UI no longer clearly owns the backend stacks.

User-facing risk:

Re-enabling voice could activate the wrong backend or a stale prompt/tool path. Users may expect conversational voice while the product only supports dictation.

Engineering risk:

Dead or half-dead infrastructure increases deployment/config drift and confuses future work.

Recommended fix:

Make an explicit product decision: dictation-only, LiveKit, or OpenAI realtime. Delete or quarantine every other path, and align docs/config with the selected path.

Fix now or later:

**Conditional blocker:** make the voice product-path decision in Phase 1. Keep only the selected path active; delete or quarantine stale voice infrastructure in Phase 3.

### 12. Billing Entitlements Have Five Client Read Paths

Severity: **Critical**  
Category: **Multiple sources of truth / API contract drift**

Files involved:

- `src/App.tsx`
- `src/hooks/useConsumerSubscription.tsx`
- `src/hooks/useUnifiedEntitlements.ts`
- `src/store/entitlementsStore.ts`
- `src/hooks/useSubscription.ts`
- `src/billing/hooks/useBilling.ts`
- `src/billing/hooks/useEntitlements.ts`
- `src/hooks/useConciergeUsage.ts`
- `src/services/entitlementService.ts`

Why this looks like merge debt:

A newer “unified” entitlements layer exists, but the app root still mounts `ConsumerSubscriptionProvider`. Other screens use direct `user_entitlements`, legacy profile fallback, billing hooks, or concierge-specific queries.

Exact conflicting logic or duplicated responsibility:

The same question, “what can this user access?”, is answered by `useConsumerSubscription`, `useUnifiedEntitlements`, `entitlementsStore`, `useSubscription`, `useBilling`, `useConciergeUsage`, and service-level selectors.

User-facing risk:

A user who has paid can be unlocked in billing settings but locked in concierge, storage, calendar import, or trip creation. Super-admin and pro-tier handling can differ by surface.

Engineering risk:

Every new plan, pass, grace status, or provider requires edits in too many places. The unused unified layer creates false confidence that the architecture is consolidated.

Recommended fix:

Pick one canonical client entitlement provider and mount it at the root. Migrate all gates to that provider, then turn deprecated hooks into thin wrappers or remove them.

Fix now or later:

**Immediate:** do not add or modify billing gates through noncanonical hooks. **Phase 2:** migrate existing gates to the selected root entitlement provider.

### 13. Feature Limits Conflict Across Client And Server

Severity: **Critical**  
Category: **Policy drift / missing server enforcement**

Files involved:

- `src/billing/entitlements.ts`
- `src/utils/featureTiers.ts`
- `src/services/uploadService.ts`
- `supabase/functions/_shared/concierge/usagePolicy.ts`
- `supabase/migrations/20251119053411_4ace55c3-740e-496e-a16e-1367f1e47f73.sql`

Why this looks like merge debt:

Newer plan limits and older freemium constants both remain active. Some limits exist only client-side, while server RPCs do not enforce matching constraints.

Exact conflicting logic or duplicated responsibility:

Payment splitting is `3` for free users in `FEATURE_LIMITS`, `5` in `FREEMIUM_LIMITS`, and not enforced by the payment split RPC. Explorer storage is `2000 MB` in one map and `50000 MB` in another. `uploadService` collapses every non-free/non-explorer tier to `frequent-chraveler`.

User-facing risk:

Users can hit different limits depending on the screen. Free users may exceed payment request limits through API paths. Pro users may receive consumer storage limits.

Engineering risk:

Plan policy changes cannot be reasoned about safely because display, client enforcement, and server enforcement are separate.

Recommended fix:

Create one plan/limit module consumed by client and edge code, or generate per-runtime artifacts from one source. Enforce mutation limits at the RPC or edge-function boundary.

Fix now or later:

**Fix now for payment split and storage enforcement; Phase 2 for all limits.**

### 14. Platform And RevenueCat Gating Disagree

Severity: **High**  
Category: **Payment platform drift / inconsistent UX**

Files involved:

- `src/billing/providers/index.ts`
- `src/integrations/revenuecat/revenuecatClient.ts`
- `src/components/consumer/ConsumerBillingSection.tsx`
- `src/hooks/useUnifiedEntitlements.ts`
- `src/utils/platformDetection.ts`

Why this looks like merge debt:

Native platform detection and RevenueCat handling were added in several layers, but one wrapper hardcodes native as false while other code expects platform-aware behavior.

Exact conflicting logic or duplicated responsibility:

`revenuecatClient` returns web and `false` for native platform. Billing provider selection uses `platformDetection`. Consumer billing UI has its own native assumptions. `useUnifiedEntitlements` conditionally syncs RevenueCat only when native detection allows it.

User-facing risk:

Native users may be routed to web checkout or never sync RevenueCat entitlements. This creates App Store / Play policy and entitlement reliability risk.

Engineering risk:

Fixing one platform detector may not fix the billing UI or RevenueCat sync path.

Recommended fix:

One platform capability module should drive billing provider selection, UI gating, and RevenueCat sync. Remove hardcoded native false paths unless the mobile shell owns them entirely.

Fix now or later:

**Conditional blocker:** resolve before any native billing or IAP release. Track the shared platform/billing detector work in Phase 1.

### 15. Demo Mode Has Multiple Flags And ID Heuristics

Severity: **High**  
Category: **Demo/auth data isolation / contract drift**

Files involved:

- `src/store/demoModeStore.ts`
- `src/hooks/useDemoMode.ts`
- `src/services/demoModeService.ts`
- `src/services/secureStorageService.ts`
- `src/utils/demoMode.ts`
- `src/hooks/useTripDetailData.ts`
- `src/hooks/useTripMembers.ts`
- `src/hooks/useTripMembersQuery.ts`
- `src/pages/MobileTripDetail.tsx`
- `src/components/TripCard.tsx`
- `src/components/ProTripCard.tsx`
- `src/pages/EventDetail.tsx`

Why this looks like merge debt:

The app appears to have migrated from `TRIPS_DEMO_MODE` to `TRIPS_DEMO_VIEW`, while old fallbacks and ID-shape checks remain in services and UI.

Exact conflicting logic or duplicated responsibility:

Some hooks treat demo trip IDs as numeric-only via a regex. Other surfaces treat any ID without a hyphen as demo/non-UUID. Demo state can come from Zustand/localStorage, secure storage, legacy boolean flags, or service-level async checks.

User-facing risk:

Demo and authenticated data paths can disagree. A real trip with an unusual ID shape or stale demo flag may render mock data, while another surface calls Supabase.

Engineering risk:

Demo contamination is documented as a zero-tolerance risk, but the code still allows multiple branches to decide demo state independently.

Recommended fix:

Create one `isDemoTripId` and one demo-mode source of truth. All services should receive explicit demo context instead of querying legacy storage fallbacks.

Fix now or later:

**Fix in Phase 1.**

### 16. Authenticated Trip Detail Still Uses Mock Trip Context

Severity: **High**  
Category: **Zombie code / data-flow inconsistency**

Files involved:

- `src/pages/TripDetailDesktop.tsx`
- `src/pages/MobileTripDetail.tsx`
- `src/data/tripsData.ts`
- `src/services/tripPlacesService.ts`

Why this looks like merge debt:

The real trip/members migration added Supabase data for shell fields but kept mock trip-context generation for tab scaffolding. That preserves old behavior beside new authenticated paths.

Exact conflicting logic or duplicated responsibility:

Authenticated trip detail receives real trip and member data, but some tab context still comes from generated mock trip data. Places/links/export paths can still use mock-flavored structures.

User-facing risk:

Real trips can display demo-like calendar/link/broadcast scaffolding or export wrong supporting data.

Engineering risk:

Missing real-data integrations are masked because mock data fills the gaps, making bugs intermittent and hard to detect.

Recommended fix:

Restrict `generateTripMockData` to explicit demo mode. Authenticated trip tabs should load from real per-feature hooks or render true empty states.

Fix now or later:

**Fix in Phase 2.**

### 17. Consumer Trip Detail Got Auth-Hydration Fixes, Pro/Event Did Not

Severity: **High**  
Category: **Conflicting loading/error states / route drift**

Files involved:

- `src/pages/TripDetailDesktop.tsx`
- `src/pages/MobileTripDetail.tsx`
- `src/hooks/useTripDetailData.ts`
- `src/pages/ProTripDetailDesktop.tsx`
- `src/pages/MobileProTripDetail.tsx`
- `src/pages/EventDetail.tsx`
- `src/pages/MobileEventDetail.tsx`
- `src/App.tsx`

Why this looks like merge debt:

Historical “Trip Not Found flash” fixes landed in the consumer trip detail hook, while pro and event detail still use list scanning and bespoke loading/not-found behavior.

Exact conflicting logic or duplicated responsibility:

Consumer detail has an auth-hydrated state matrix. Pro/event detail derive from `useTrips().find()` and page-local member loading. Routes for `/trip/:tripId`, `/tour/pro/:proTripId`, and `/event/:eventId` are not protected by the same wrapper and implement access UX locally.

User-facing risk:

Pro/event users may see false not-found or inconsistent login/access states during auth hydration.

Engineering risk:

Every trip access fix must be applied across desktop/mobile and consumer/pro/event shells.

Recommended fix:

Generalize `useTripDetailData` into a type-aware trip access hook and extract a shared `TripAccessGate` for all trip-like routes.

Fix now or later:

**Fix in Phase 2.**

### 18. Pro Trip Pipelines And Mappers Drift

Severity: **High**  
Category: **Duplicate data pipelines / field drift**

Files involved:

- `src/hooks/useTrips.ts`
- `src/hooks/useProTrips.ts`
- `src/pages/Index.tsx`
- `src/pages/ProTripDetailDesktop.tsx`
- `src/pages/MobileProTripDetail.tsx`
- `src/utils/tripConverter.ts`
- `src/components/ProTripCard.tsx`

Why this looks like merge debt:

Pro trips can come from filtering the generic trips list or from a dedicated `useProTrips` hook. The dedicated hook has its own mapper and query key, while pages use `tripConverter`.

Exact conflicting logic or duplicated responsibility:

`useProTrips` maps `trip.title`, while Supabase trip rows use `name` in the canonical converter path. Index/detail pages use `convertSupabaseTripToProTrip`; cards and admin paths can use the dedicated pro hook.

User-facing risk:

Pro trip titles or cards can render blank or stale in one surface while another is correct. Archive/hide mutations can invalidate one cache but not the other.

Engineering risk:

Two query keys and two mappers exist for the same entity. Field mismatches bypass compile-time checks because one mapper accepts `Record<string, unknown>`.

Recommended fix:

Use one pro-trip query under the shared `tripKeys` factory and one typed mapper from Supabase `Trip` to `ProTripData`.

Fix now or later:

**Fix in Phase 2.**

### 19. Mobile Media Hub Deletes Links From The Wrong Table

Severity: **Critical**  
Category: **Actual bug / desktop-mobile parity drift**

Files involved:

- `src/hooks/useMediaManagement.ts`
- `src/components/mobile/MobileUnifiedMediaHub.tsx`
- `src/components/media/MediaUrlsPanel.tsx`

Why this looks like merge debt:

The hook now merges links from `trip_link_index` and `trip_links`, but mobile delete only targets one table. Desktop and mobile implement deletion separately.

Exact conflicting logic or duplicated responsibility:

`useMediaManagement` returns link items from both `trip_link_index` and `trip_links` and marks their source. `MobileUnifiedMediaHub` deletes every link from `trip_links`. Desktop `MediaUrlsPanel` deletes indexed links from `trip_link_index`.

User-facing risk:

Chat-extracted links shown in the mobile media hub fail to delete, or the wrong row is targeted.

Engineering risk:

Media CRUD behavior is split between desktop UI, mobile UI, and the hook. More link sources will worsen the drift.

Recommended fix:

Create a shared link deletion service that branches by source/table and use it from both desktop and mobile media surfaces. Add a regression test for chat-indexed and manual links.

Fix now or later:

**Fix now.** This is a confirmed mobile bug.

### 20. Mobile Media Delete Bypasses The Canonical Media Service

Severity: **High**  
Category: **Duplicate side effects / data integrity**

Files involved:

- `src/components/UnifiedMediaHub.tsx`
- `src/components/mobile/MobileUnifiedMediaHub.tsx`
- `src/services/mediaService.ts`

Why this looks like merge debt:

Desktop media deletion was moved to a service, while mobile preserved inline storage and database deletion logic.

Exact conflicting logic or duplicated responsibility:

Desktop calls `mediaService.deleteMedia`. Mobile manually parses storage URLs, removes from the `trip-media` bucket, and deletes `trip_media_index` rows.

User-facing risk:

Mobile can report success while leaving orphaned rows or blobs, or fail differently from desktop under RLS/storage edge cases.

Engineering risk:

Media deletion invariants live in two places. Service-level fixes do not protect mobile.

Recommended fix:

Make mobile call the same `mediaService.deleteMedia` path and keep layout differences only in the shell.

Fix now or later:

**Fix in Phase 1.**

### 21. Notification Settings Are Triplicated And Bypass The Canonical Hook

Severity: **Medium**  
Category: **UI/UX conflict debt / duplicated state orchestration**

Files involved:

- `src/components/consumer/ConsumerNotificationsSection.tsx`
- `src/components/enterprise/EnterpriseNotificationsSection.tsx`
- `src/components/events/EventNotificationsSection.tsx`
- `src/hooks/useNotificationPreferences.ts`
- `src/services/userPreferencesService.ts`
- `src/components/settings/NotificationsSection.tsx`

Why this looks like merge debt:

Three large notification sections independently call `userPreferencesService`, maintain local settings state, SMS state, quiet hours, category lists, and toggles, while a canonical preferences hook exists and is used elsewhere.

Exact conflicting logic or duplicated responsibility:

Consumer, enterprise, and event sections each fetch and update notification preferences directly. `useNotificationPreferences` already owns mapping/error state for other surfaces.

User-facing risk:

SMS eligibility, quiet hours, push toggles, and categories can drift by trip type or settings surface.

Engineering risk:

Notification bugs require fixes across several long components. New preference fields will be easy to miss.

Recommended fix:

Extract a shared `NotificationSettingsPanel` powered by `useNotificationPreferences`, with only category config varying by surface.

Fix now or later:

**Fix in Phase 2.**

### 22. Duplicate `MobileTeamMemberCard` Components With Different Contracts

Severity: **Medium**  
Category: **Dead/zombie code / duplicate UI implementation**

Files involved:

- `src/components/MobileTeamMemberCard.tsx`
- `src/components/mobile/MobileTeamMemberCard.tsx`
- `src/pages/OrganizationDashboard.tsx`

Why this looks like merge debt:

Two components with the same export name exist in adjacent component trees. One is used; the other has a different prop shape and no imports.

Exact conflicting logic or duplicated responsibility:

The root component expects `member.name`, `role`, and status. The mobile-folder component expects `member.full_name`, `email`, `user_id`, and `avatar_url`.

User-facing risk:

Low today because one appears unused. Future imports can pick the wrong component and silently mismatch data.

Engineering risk:

Duplicate names increase merge conflict and wrong-autocomplete risk.

Recommended fix:

Delete the unused duplicate or merge the useful behavior into one canonical mobile card.

Fix now or later:

**Fix in Phase 3.**

### 23. Calendar Desktop And Mobile Duplicate Mutation Orchestration

Severity: **Medium**  
Category: **Data flow inconsistency / UI state drift**

Files involved:

- `src/components/GroupCalendar.tsx`
- `src/features/calendar/hooks/useCalendarManagement.ts`
- `src/components/mobile/MobileGroupCalendar.tsx`
- `src/features/calendar/hooks/useCalendarEvents.ts`
- `src/features/calendar/components/CalendarLoadingState.tsx`
- `src/features/calendar/components/CalendarEmptyState.tsx`

Why this looks like merge debt:

Desktop and mobile share some query keys but have separate action hooks, mutation flows, and loading/empty/error presentation.

Exact conflicting logic or duplicated responsibility:

Desktop uses `useCalendarManagement` and shared calendar states. Mobile uses `useCalendarEvents` and bespoke UI logic.

User-facing risk:

Create/update/delete and empty/error UX can behave differently on mobile vs desktop.

Engineering risk:

Calendar bug fixes must land in two hooks. Query key sharing alone does not guarantee mutation parity.

Recommended fix:

Extract a shared `useCalendarActions` or unify the two hooks so mobile and desktop differ only by layout.

Fix now or later:

**Fix in Phase 2.**

### 24. Chat Mapping Layers Preserve Legacy And Stream Shapes Simultaneously

Severity: **Medium**  
Category: **API/type drift / architectural regression**

Files involved:

- `src/hooks/stream/useStreamTripChat.ts`
- `src/services/stream/adapters/mappers/messageMapper.ts`
- `src/features/chat/adapters/streamMessageViewModel.ts`
- `src/lib/adapters/messageAdapter.ts`
- `src/services/stream/streamMessagePayload.ts`

Why this looks like merge debt:

Stream migration retained DB-shaped message adapters, Stream view models, and payload builders with overlapping responsibilities.

Exact conflicting logic or duplicated responsibility:

The trip Stream hook returns native Stream messages even though comments reference transformation via `messageMapper`. UI uses `streamMessageViewModel`. Legacy adapters still export DB/unified message shapes. A second payload builder in `messageMapper` lacks parity with `streamMessagePayload`.

User-facing risk:

Edited flags, reactions, link previews, quoted replies, and idempotency can drift depending on which mapper built the message.

Engineering risk:

New message fields must be added in multiple transformations. Some adapters are test-only, creating false confidence.

Recommended fix:

Keep one Stream-to-UI view model and one DB adapter only where Supabase reads remain. Delete or quarantine unused adapters and fix comments to match the live path.

Fix now or later:

**Fix in Phase 3 after P0 chat behavior is fixed.**

### 25. Type Safety Is Used As A Merge Bandaid Around Pending Actions And Feature Flags

Severity: **Medium**  
Category: **Type-safety erosion / schema drift**

Files involved:

- `src/hooks/usePendingActions.ts`
- `src/lib/featureFlags.ts`
- `src/services/stream/streamCanary.ts`
- `src/integrations/supabase/types.ts`

Why this looks like merge debt:

Comments say some tables or fields are not in generated types yet, followed by broad casts. This indicates migrations or type regeneration did not land with consumers.

Exact conflicting logic or duplicated responsibility:

`usePendingActions` casts the Supabase client to `any` for `trip_pending_actions` and several inserts. Feature flag clients also cast because generated types lack the table. Hashing and fetch behavior are duplicated in feature flag and Stream canary utilities.

User-facing risk:

Runtime shape mismatches can reach production before TypeScript catches them.

Engineering risk:

Schema/client drift becomes normalized, and future refactors will build on untyped boundaries.

Recommended fix:

Regenerate Supabase types for missing tables and create typed wrappers for pending actions and feature flags. Add a CI check that blocks `(supabase as any)` in new code except in approved boundary files.

Fix now or later:

**Fix in Phase 3.**

### 26. Poll Types Exist In Multiple Incompatible Shapes

Severity: **Medium**  
Category: **Type/API drift**

Files involved:

- `src/hooks/useTripPolls.ts`
- `src/services/pollStorageService.ts`
- `src/components/poll/types.ts`
- `src/types/tripContext.ts`
- `src/types/tripExport.ts`

Why this looks like merge debt:

Polls have DB-shaped, offline-storage-shaped, UI-shaped, AI-context-shaped, and export-shaped interfaces with overlapping fields and different naming conventions.

Exact conflicting logic or duplicated responsibility:

Some shapes use snake_case such as `total_votes` and `created_by`; others use camelCase such as `totalVotes` and `createdAt`.

User-facing risk:

Poll counts, creators, or export data can drift if one mapper changes and the others do not.

Engineering risk:

Adding a poll field requires changes across many types and transforms.

Recommended fix:

Use generated DB row types at the boundary and one `toPollViewModel` mapper for UI. Make AI/export schemas explicit derived contracts rather than duplicate domain types.

Fix now or later:

**Fix in Phase 3.**

### 27. Duplicate Currency Formatting Has Different Semantics

Severity: **Low**  
Category: **Duplicate helper / inconsistent UX**

Files involved:

- `src/constants/currencies.ts`
- `src/services/currencyService.ts`
- `src/components/payments/CreatePaymentModal.tsx`
- `src/components/payments/PaymentsTab.tsx`

Why this looks like merge debt:

Currency metadata and formatting appear to have grown independently in constants and service layers.

Exact conflicting logic or duplicated responsibility:

One `formatCurrency` manually prefixes symbols and formats decimals. The other uses `Intl.NumberFormat`.

User-facing risk:

Payments can display currency differently across surfaces.

Engineering risk:

Localization and rounding fixes may land in only one helper.

Recommended fix:

Keep currency metadata in constants and one formatter in `currencyService`.

Fix now or later:

**Fix in Phase 3.**

### 28. Legacy Chat Realtime And Cache Paths Remain Armed Beside Stream

Severity: **Medium**  
Category: **Zombie code / performance risk**

Files involved:

- `src/services/chatService.ts`
- `src/features/chat/services/legacyMessageMutations.ts`
- `src/services/chatBroadcastService.ts`
- `src/hooks/usePrefetchTrip.ts`
- `src/services/readReceiptService.ts`
- `src/features/chat/hooks/useChatReadReceipts.ts`
- `supabase/migrations/20260321000002_broadcast_trigger_for_chat_messages.sql`

Why this looks like merge debt:

Stream is documented as canonical, but Supabase chat prefetch, broadcast triggers, legacy mutation wrappers, and read receipt table writes still exist.

Exact conflicting logic or duplicated responsibility:

`usePrefetchTrip` prefetches `trip_chat_messages` for the chat tab while the UI reads Stream. Read receipts can fall back to Supabase rows when Stream channel read state is not active. Legacy broadcast infrastructure has no current client subscriber.

User-facing risk:

Redundant or stale chat data can be fetched. Read receipts may write orphaned rows with Stream message IDs.

Engineering risk:

Legacy paths increase the chance of accidental double-delivery or hidden cost. The migration boundary remains environment-sensitive.

Recommended fix:

Remove chat prefetch for Stream-only tabs, no-op Supabase read receipts when Stream is configured, and quarantine legacy chat code behind one explicit compatibility module.

Fix now or later:

**Fix in Phase 3 after Stream action bugs are fixed.**

## Pattern-Level Diagnosis

Recurring bad merge patterns:

- **Accept-both partial migrations:** new systems were added without deleting old systems. Examples: Stream plus Supabase chat, unified entitlements plus consumer subscription provider, TanStack members plus local-state members.
- **Branch-local fixes:** consumer trip detail got auth-hydration improvements, but pro/event/mobile variants kept older loading models.
- **Fallbacks turned into contradictions:** share/upload falls back to legacy chat even though legacy chat is guarded off when Stream is configured.
- **UI and data-layer ownership split:** pending actions, notification settings, media deletion, and calendar actions are each owned by multiple layers.
- **String contracts instead of typed contracts:** billing tiers, tool names, demo mode flags, poll shapes, and message shapes drift because strings or broad records cross subsystem boundaries.
- **Zombie code after migrations:** deleted or deprecated voice/chat paths still have config, services, adapters, or tests.

Main issue classification:

- Primary issue: **duplicated logic and architectural drift**.
- Secondary issue: **API/contract drift**, especially in billing tiers, AI tool payloads, and trip/member types.
- Tertiary issue: **dead code accumulation**, especially around chat legacy transport, voice infrastructure, and unused adapters/components.

Most affected subsystems:

1. Chat and realtime transport.
2. Trip loading, members, demo mode, and trip route shells.
3. Billing, entitlements, quotas, and platform payment boundaries.
4. AI Concierge pending actions, voice, and Smart Import.
5. Mobile/desktop parity for media, calendar, and notifications.

## Root-Cause Hypothesis

The codebase likely accumulated semantic merge debt through repeated large feature migrations where resolving conflicts favored preserving both sides:

- **Accepting both too often:** Stream and legacy Supabase chat remain active enough to conflict. Billing has both unified and legacy providers. AI pending actions use both DB and message-card models.
- **Preserving legacy and replacement logic simultaneously:** New hooks were layered over old hooks instead of replacing ownership boundaries.
- **Partial migrations:** Consumer trip detail received auth/cache fixes, but pro/event pages did not. Smart Import and AI Concierge each built import pipelines without collapsing contracts.
- **Inconsistent refactors:** Mappers and adapters were introduced but not wired through all call sites, leaving “canonical” code unused.
- **Unresolved ownership boundaries:** It is unclear whether hooks, services, UI components, or edge functions own certain responsibilities: media deletion, notification preferences, billing access, pending actions, and calendar mutations.
- **Branch-by-branch drift:** Desktop and mobile shells, consumer/pro/event variants, and text/voice AI paths repeatedly diverged after narrow fixes.

## Surgical Cleanup Plan

### Phase 1: Critical Production-Risk Fixes

1. Fix Pro checkout tier normalization: `pro-growing` must resolve to `pro-growth`.
2. Fix TripChat transport mode and mutation error contract.
3. Fix mobile media link deletion by routing through a shared service based on link source.
4. Migrate mobile media deletion to `mediaService.deleteMedia` so desktop and mobile share storage/index cleanup.
5. Stop share/upload from falling into legacy chat when Stream is configured but inactive.
6. Consolidate trip members into one TanStack-backed hook and align query keys/prefetch/invalidation.
7. Make pending-action confirmation single-owner: one mounted hook, one renderer, one mutation path.
8. Align payment split and upload quota enforcement with server-side policy.
9. Centralize demo-mode flag and demo ID detection.
10. Resolve the native billing platform detector before any IAP release.
11. Decide the voice product path: dictation-only, LiveKit, or OpenAI realtime.

### Phase 2: Architecture Consolidation

1. Migrate all billing gates to one root entitlement provider.
2. Generalize `useTripDetailData` and `TripAccessGate` across consumer, pro, and event routes.
3. Replace authenticated `generateTripMockData` usage with real tab hooks and true empty states.
4. Consolidate Smart Import around one extraction contract and one commit service.
5. Extract shared notification settings and calendar action hooks.
6. Unify pro trip data fetching/mapping under `tripKeys` and one typed converter.

### Phase 3: Dead Code And Type Cleanup

1. Delete unused duplicate components such as the extra `MobileTeamMemberCard`.
2. Quarantine or delete legacy chat adapters, broadcast services, and test-only adapter barrels.
3. Regenerate Supabase types and remove pending-action/feature-flag `any` casts.
4. Collapse poll, message, currency, and place type/formatter duplicates.
5. Delete or quarantine voice infrastructure that is not part of the Phase 1 voice decision.
6. Clean stale docs/config that reference deleted voice hooks or functions.

### Phase 4: Guardrails To Prevent Recurrence

1. Add drift checks for billing tier maps, Stripe product/price catalogs, and plan limits.
2. Add a duplicate hook/service inventory check for critical domains: trips, members, billing, chat, media, notifications.
3. Require merge-conflict PR checklist entries for semantic conflict resolution decisions.
4. Add tests that exercise shared child components, not only parent callback mocks.
5. Add architectural ownership docs for each critical domain: one hook, one service, one type, one edge contract.

## Guardrails

Recommended concrete prevention steps:

- **Lint rules:** ban `(supabase as any)` outside approved typed boundary files; ban duplicate exported component names under `src/components`; warn on direct Supabase calls in UI components for domains with services.
- **Type strictness:** regenerate Supabase types whenever migrations add tables/columns; add typed pending-action payload discriminated unions; replace string billing/tool tier contracts with literal unions.
- **Duplicate code checks:** add `jscpd` or a lightweight script for large duplicate blocks in `src/components`, `src/hooks`, and `src/services`; add a CI report for duplicate filenames/export names.
- **Architectural conventions:** each critical entity gets one owner: members (`useTripMembers`), entitlements (`useEntitlements`), media deletion (`mediaService`), chat transport (`StreamTransport`), pending actions (`PendingActionController`).
- **PR review checklist:** require reviewers to answer “what old path was removed?” for migrations. If no old path was removed, require a documented compatibility window and cleanup issue.
- **Merge conflict resolution workflow:** prohibit “accept both” on shared hooks/services without a semantic recomposition note. Require a local search for duplicate ownership after resolving conflicts in critical files.
- **CI protections:** run contract tests for billing tier maps, plan limits, concierge tool payloads, Stream/legacy transport guards, and trip query key factories. Add a failing test whenever a new tool/action/tier lacks renderer and executor coverage.

## Minimum Refactor Set

The smallest set of refactors that would collapse the most conflicting paths:

1. **Trip access refactor:** `useTripDetailData` + `useTripMembers` + `TripAccessGate` become the only trip detail and member entry points across consumer/pro/event.
2. **Chat transport refactor:** Stream becomes the only active trip chat mutation/read state path when configured; legacy stays isolated behind one compatibility adapter.
3. **Entitlements refactor:** one root provider, one selector, one plan limit module, one checkout action service.
4. **AI pending-action refactor:** one pending-action controller with typed payloads and generated renderer metadata.
5. **Media CRUD refactor:** one media/link service for desktop and mobile, with source-aware link deletion.

## Paste-Ready Follow-Up Issue Plans

### Issue Plan 1: Fix Pro Growth Checkout Tier Drift

**Why this matters:** The Pro Growth/Growing checkout path can send `pro-growing`, but the edge function prices `pro-growth`, creating direct revenue loss.

**Files likely involved:** `src/components/ProUpgradeModal.tsx`, `src/constants/stripe.ts`, `supabase/functions/create-checkout/index.ts`, related checkout tests.

**Current risk:** Users selecting the growth plan can fail to reach Stripe checkout.

**Recommended fix:** Normalize the UI tier map to `pro-growth`; optionally accept `pro-growing` at the edge as a compatibility alias that maps to `pro-growth`.

**Acceptance criteria:** Pro Growth checkout invokes `create-checkout` with a priced tier; a unit/contract test proves `growing` maps to `pro-growth`; no UI still sends `pro-growing` except an edge compatibility test.

**Test plan:** Add targeted unit tests for `SUBSCRIPTION_TIER_MAP`; add an edge-function test for `create-checkout` tier normalization; run `npm run lint && npm run typecheck && npm run build`.

**Rollback plan:** Revert the tier-map change and edge alias commit; no schema rollback required.

**Launch-blocking?** Yes for Pro checkout changes; this is a confirmed paid conversion path bug.

### Issue Plan 2: Consolidate Trip Members And Query Keys

**Why this matters:** Trip member data currently comes from `useTripDetailData`, `useTripMembers`, and `useTripMembersQuery`, causing stale rosters, duplicate fetches, and cache invalidation drift.

**Files likely involved:** `src/hooks/useTripDetailData.ts`, `src/hooks/useTripMembers.ts`, `src/hooks/useTripMembersQuery.ts`, `src/hooks/usePrefetchTrip.ts`, `src/lib/queryKeys.ts`, `src/components/TripHeader.tsx`, `src/features/chat/components/TripChat.tsx`, `src/components/payments/PaymentsTab.tsx`.

**Current risk:** Member count, roles, chat permissions, and payment participant lists can disagree across tabs.

**Recommended fix:** Make one TanStack-backed member hook the canonical owner. Move role, mutations, creator fallback, Stream membership sync, realtime invalidation, and query-key/prefetch parity into that owner; delete the local-state duplicate.

**Acceptance criteria:** Trip detail, chat, payments, and mobile payments all consume the same member hook; prefetch and invalidation use the same key factory as the hook; no remaining direct consumer uses the deleted local-state member hook.

**Test plan:** Add hook tests for canonical member loading, creator fallback, role preservation, remove/leave invalidation, realtime invalidation, and prefetch key parity. Add an integration test proving roster updates propagate to payments/chat consumers.

**Rollback plan:** Revert the hook consolidation commit and restore previous imports; no schema rollback required.

**Launch-blocking?** Yes for member-management or trip-access work; it touches trip permissions and payment/chat participants.

### Issue Plan 3: Complete Stream Chat Action Ownership

**Why this matters:** Main TripChat passes Stream callbacks but does not pass Stream transport mode, so shared message actions can route edit/delete through guarded legacy mutations.

**Files likely involved:** `src/features/chat/components/TripChat.tsx`, `src/features/chat/components/MessageItem.tsx`, `src/features/chat/components/MessageActions.tsx`, `src/components/pro/channels/ChannelChatView.tsx`, `src/hooks/useShareAsset.ts`, `src/services/stream/tripMessageTransport.ts`, `src/services/chatService.ts`.

**Current risk:** Edit/delete can fail in trip chat; failed Stream mutations can show false success or duplicate toasts; upload/share can fall into disabled legacy chat when Stream is configured but inactive.

**Recommended fix:** Pass explicit Stream transport mode through all TripChat message action paths; unify mutation result/error contracts; stop legacy send fallback when Stream is configured; keep legacy only behind an explicit compatibility path.

**Acceptance criteria:** TripChat edit/delete use Stream callbacks through `MessageActions`; failed Stream edit/delete/pin shows one failure toast and no success toast; Stream-configured inactive upload/share does not call `sendChatMessage`.

**Test plan:** Add component tests that render `MessageActions` through `MessageItem`; add failed Stream mutation toast tests; add `useShareAsset` tests for Stream inactive/configured mode; run relevant chat tests plus `npm run lint && npm run typecheck && npm run build`.

**Rollback plan:** Revert the transport-mode and fallback commits; Stream data remains unchanged.

**Launch-blocking?** Yes for chat action reliability and media share release paths.

### Issue Plan 4: Make AI Pending Actions Single-Owner And Typed

**Why this matters:** AI writes currently mix server fast-path promotion, DB auto-confirm hooks, and message-attached cards. This weakens the human-confirmation safety boundary.

**Files likely involved:** `src/hooks/usePendingActions.ts`, `src/pages/TripDetailDesktop.tsx`, `src/components/AIConciergeChat.tsx`, `src/features/chat/components/ChatMessages.tsx`, `src/features/chat/components/PendingActionCard.tsx`, `supabase/functions/_shared/functionExecutor.ts`, `agent/src/tools.ts`.

**Current risk:** AI actions can silently write without visible confirmation, duplicate hook mounts can race, and voice/agent payloads can miss normalized fields.

**Recommended fix:** Choose one pending-action controller mounted once per trip; render DB-backed cards or remove card UX explicitly; add typed discriminated payloads; route agent writes through the canonical executor and normalize task assignees.

**Acceptance criteria:** One pending row produces one mutation; every confirmable tool has typed payload metadata and card metadata; `addToCalendar` and `createTask` payloads match the confirm switch across text and agent paths.

**Test plan:** Add tests for duplicate hook mount prevention, one-action-one-mutation behavior, pending card coverage for every confirmable tool, `addToCalendar` payload normalization, and `createTask` assignee normalization.

**Rollback plan:** Revert pending-action controller changes and restore previous hook mounts; no schema rollback required unless new typed columns/migrations are introduced.

**Launch-blocking?** Yes for AI write tools and any realtime voice/agent release.

### Issue Plan 5: Normalize Billing Entitlements, Limits, And Platform Gates

**Why this matters:** Billing access is read through multiple hooks/stores and limit maps disagree across client and server.

**Files likely involved:** `src/App.tsx`, `src/hooks/useConsumerSubscription.tsx`, `src/hooks/useUnifiedEntitlements.ts`, `src/store/entitlementsStore.ts`, `src/hooks/useSubscription.ts`, `src/billing/hooks/useBilling.ts`, `src/billing/entitlements.ts`, `src/utils/featureTiers.ts`, `src/services/uploadService.ts`, `supabase/functions/_shared/concierge/usagePolicy.ts`, payment split RPC migrations, `src/utils/platformDetection.ts`, `src/integrations/revenuecat/revenuecatClient.ts`.

**Current risk:** Paid users can be unlocked in one surface and blocked in another; free users can bypass some limits at server boundaries; native billing/IAP routing can disagree by module.

**Recommended fix:** Select one root entitlement provider and selector; generate or share one plan-limit module; enforce payment split and upload quotas at server boundaries; route platform/IAP checks through one platform capability module.

**Acceptance criteria:** All billing gates consume the selected provider or a thin wrapper; one fixture suite proves client and edge entitlement selection parity; payment split and upload quota enforcement is covered for free, explorer, frequent traveler, and pro tiers; RevenueCat/native detection has one owner.

**Test plan:** Add shared entitlement selector fixture tests, plan-limit drift tests, payment split over-limit RPC tests, upload over-limit server-boundary tests, and native platform detector tests.

**Rollback plan:** Revert provider migration in chunks by surface; keep edge enforcement behind additive checks that can be reverted without data migration.

**Launch-blocking?** Yes for billing, quota, upload, trip-payment, or native IAP work.

### Issue Plan 6: Centralize Demo Mode And Remove Mock Leakage From Authenticated Trips

**Why this matters:** Demo mode is a zero-tolerance data-isolation path, but the codebase uses multiple flags and ID heuristics.

**Files likely involved:** `src/store/demoModeStore.ts`, `src/hooks/useDemoMode.ts`, `src/services/demoModeService.ts`, `src/services/secureStorageService.ts`, `src/utils/demoMode.ts`, `src/hooks/useTripDetailData.ts`, `src/hooks/useTripMembers.ts`, `src/hooks/useTripMembersQuery.ts`, `src/pages/TripDetailDesktop.tsx`, `src/pages/MobileTripDetail.tsx`, `src/data/tripsData.ts`.

**Current risk:** Demo and authenticated paths can disagree, and real trip tabs can receive mock-generated context.

**Recommended fix:** Create one demo-mode source and one `isDemoTripId` helper. Require authenticated trip tabs to use real hooks or true empty states, and restrict `generateTripMockData` to explicit demo paths.

**Acceptance criteria:** No service reads legacy demo keys except a migration shim; every demo ID check uses the shared helper; authenticated trip detail does not call mock trip generation for real trip data.

**Test plan:** Add demo/auth isolation tests for numeric demo trips, UUID authenticated trips, stale localStorage keys, and authenticated trip tabs with empty real data.

**Rollback plan:** Revert helper adoption by surface; preserve a migration shim for legacy localStorage keys.

**Launch-blocking?** Yes for demo, trip loading, and authenticated trip tab work.

### Issue Plan 7: Unify Media Link And Media Deletion Across Desktop And Mobile

**Why this matters:** Mobile media link deletion currently deletes every link from `trip_links` even though the hook merges `trip_link_index` and `trip_links`.

**Files likely involved:** `src/hooks/useMediaManagement.ts`, `src/components/mobile/MobileUnifiedMediaHub.tsx`, `src/components/UnifiedMediaHub.tsx`, `src/components/media/MediaUrlsPanel.tsx`, `src/services/mediaService.ts`, link service files.

**Current risk:** Mobile users cannot reliably delete chat-indexed links; mobile media deletion bypasses canonical storage/index cleanup.

**Recommended fix:** Add a source-aware link delete service and use `mediaService.deleteMedia` for mobile media deletes.

**Acceptance criteria:** Desktop and mobile delete the same link/media sources through shared services; chat-indexed links delete from `trip_link_index`; manual links delete from `trip_links`; media deletes run the canonical storage/index logic.

**Test plan:** Add tests for chat-indexed link delete, manual link delete, mobile media delete through `mediaService`, and RLS/storage error handling.

**Rollback plan:** Revert mobile service migration and restore previous inline handlers; no schema rollback required.

**Launch-blocking?** Yes for mobile media reliability.

### Issue Plan 8: Consolidate Smart Import Contracts

**Why this matters:** Concierge, modal import, file parsing, and URL scraping each parse and commit trip data through different shapes.

**Files likely involved:** `supabase/functions/_shared/functionExecutor.ts`, `src/features/smart-import/`, `src/components/SmartImport.tsx`, `supabase/functions/file-ai-parser/index.ts`, `supabase/functions/enhanced-ai-parser/index.ts`, scraper functions, `src/utils/calendarImportParsers.ts`, `src/utils/agendaImportParsers.ts`, `src/utils/lineupImportParsers.ts`.

**Current risk:** The same source can produce different event fields, categories, duplicate checks, or usage charging depending on import entry point.

**Recommended fix:** Define one extraction result contract and one commit service. Make Concierge preview, file upload, URL scrape, and modal review adapters into that contract.

**Acceptance criteria:** All import entry points produce the same normalized event/task/place payload shape; duplicate detection and usage charging run once at the shared boundary.

**Test plan:** Add fixtures that run the same itinerary source through Concierge, file, URL, and modal paths and compare normalized output and commit behavior.

**Rollback plan:** Keep old parsers behind adapter wrappers until fixtures prove parity; revert adapters independently if one path regresses.

**Launch-blocking?** Yes for broad Smart Import rewrites; not blocking unrelated non-import work.

### Issue Plan 9: Resolve Voice Product Path And Delete Stale Voice Infrastructure

**Why this matters:** Visible voice UX is dictation, while LiveKit/Gemini and OpenAI realtime backend paths remain in the repo/config.

**Files likely involved:** `src/features/concierge/hooks/useConciergeVoice.ts`, `src/hooks/useWebSpeechVoice.ts`, `agent/src/`, `supabase/functions/livekit-token/index.ts`, `supabase/functions/create-openai-realtime-session/index.ts`, `supabase/config.toml`, voice docs.

**Current risk:** Engineers can re-enable a stale voice stack with outdated tool payloads, prompts, or config.

**Recommended fix:** Choose dictation-only, LiveKit, or OpenAI realtime. Delete or quarantine all other paths and align docs/config with the selected product path.

**Acceptance criteria:** One voice path is documented as canonical; stale Supabase config entries are removed; all retained voice code has active frontend callers and passing tests.

**Test plan:** Add a voice-path smoke test for the selected path; add static assertions that deleted function names are absent from config and docs.

**Rollback plan:** Revert deletion/quarantine commits if the selected path changes; keep deletions isolated from Concierge text path changes.

**Launch-blocking?** Yes for voice release; not blocking text-only Concierge.

### Issue Plan 10: Share Notification And Calendar Surface Ownership

**Why this matters:** Notification settings and calendar actions are duplicated across consumer, enterprise, event, desktop, and mobile surfaces.

**Files likely involved:** notification section components, `src/hooks/useNotificationPreferences.ts`, `src/services/userPreferencesService.ts`, `src/components/GroupCalendar.tsx`, `src/components/mobile/MobileGroupCalendar.tsx`, `src/features/calendar/hooks/useCalendarManagement.ts`, `src/features/calendar/hooks/useCalendarEvents.ts`, calendar state components.

**Current risk:** SMS/push/quiet-hours and calendar create/update/delete behavior can drift by surface.

**Recommended fix:** Extract shared notification settings and calendar action owners; keep only category/layout config in surface-specific components.

**Acceptance criteria:** Notification surfaces use one hook/panel; calendar desktop and mobile share mutation actions and error/empty/loading contracts.

**Test plan:** Add shared notification preference tests across variants; add calendar mutation parity tests for desktop/mobile actions and empty/error states.

**Rollback plan:** Revert per-surface migrations independently.

**Launch-blocking?** No, unless the work touches notification delivery or calendar mutation paths.

### Issue Plan 11: Collapse Pro Trip Mapping And Route Loading Drift

**Why this matters:** Pro trips are fetched and mapped through both `useTrips` filtering and `useProTrips`, and pro/event detail pages do not share consumer auth-hydration handling.

**Files likely involved:** `src/hooks/useTrips.ts`, `src/hooks/useProTrips.ts`, `src/pages/Index.tsx`, `src/pages/ProTripDetailDesktop.tsx`, `src/pages/MobileProTripDetail.tsx`, `src/pages/EventDetail.tsx`, `src/pages/MobileEventDetail.tsx`, `src/utils/tripConverter.ts`.

**Current risk:** Pro/event pages can show stale or false not-found states, and pro trip fields can drift by mapper.

**Recommended fix:** Use one typed pro/event mapper and a type-aware trip access hook for consumer, pro, and event detail shells.

**Acceptance criteria:** Pro/event detail no longer list-scan for detail data; all pro cards/detail surfaces use the same typed converter; auth/loading/not-found states use one gate.

**Test plan:** Add auth-hydration tests for pro/event routes; add converter tests for DB `name` to ProTripData title; add cache invalidation tests for pro mutations.

**Rollback plan:** Revert per-route migrations independently.

**Launch-blocking?** Yes for pro/event route reliability work.

### Issue Plan 12: Remove Zombie Types, Adapters, And Duplicate Components

**Why this matters:** Duplicate components, poll types, chat adapters, feature-flag clients, and currency formatters create wrong-import and drift risk.

**Files likely involved:** `src/components/MobileTeamMemberCard.tsx`, `src/components/mobile/MobileTeamMemberCard.tsx`, `src/hooks/useTripPolls.ts`, `src/services/pollStorageService.ts`, `src/components/poll/types.ts`, `src/types/tripContext.ts`, `src/types/tripExport.ts`, chat adapter files, `src/constants/currencies.ts`, `src/services/currencyService.ts`, feature flag utilities.

**Current risk:** Low-to-medium immediate user risk, but high maintenance drag and future merge conflict risk.

**Recommended fix:** Delete unused duplicates, consolidate poll/message/currency types behind canonical mappers, and regenerate Supabase types for pending actions/feature flags.

**Acceptance criteria:** Duplicate `MobileTeamMemberCard` export is removed; poll types have one DB boundary and one UI mapper; one currency formatter remains; `(supabase as any)` for known tables is eliminated or isolated in approved boundaries.

**Test plan:** Run import grep checks, typecheck, relevant poll/chat/payment tests, and a duplicate export-name script.

**Rollback plan:** Restore deleted duplicate files only if a missing import is discovered; keep deletions in separate commits.

**Launch-blocking?** No, unless a deleted adapter is discovered to be active during migration.

## Merge Preflight Report

- **Base branch:** `main`
- **Merge-base SHA:** `9acb9d7e`
- **Changed files on branch:** 1 (`docs/semantic-merge-debt-audit-2026-05-31.md`)
- **Changed files on base since merge-base:** 0
- **Overlap:** none
- **Dry-run result:** clean
- **Conflict causes:** none found
- **Per-conflict decision:** none required
- **Residual merge risks:** low; this branch adds one docs file and base had no divergent changes since merge-base
- **Tests run:** `npm run merge:preflight`; `npm run lint && npm run typecheck && npm run build`
- **Commit/push safety verdict:** safe to push after semantic review findings are addressed

## Validation Notes

This audit used static analysis, code search, direct source verification, and subsystem exploration. No product code was changed. The generated audit document should be treated as an evidence-backed remediation backlog, not as proof that every issue is currently visible to users.

Recommended targeted validation before implementation:

- Add a regression test for Pro Growth checkout tier mapping.
- Add trip member hook/integration tests for canonical member loading, role preservation, mutation invalidation, realtime invalidation, and prefetch/query-key parity.
- Add a `TripChat` test that renders `MessageActions` and verifies Stream edit/delete callbacks are used.
- Add Stream mutation error-contract tests proving failed edit/delete/pin actions do not show success or duplicate toasts.
- Add `useShareAsset` tests proving Stream-configured inactive upload/share paths do not call legacy `sendChatMessage`.
- Add mobile media tests for deleting `trip_link_index` and `trip_links` entries.
- Add one pending-action test proving two hook mounts cannot double-confirm a row.
- Add entitlement fixture tests shared by client and edge selectors.
- Add server-boundary tests for over-limit payment splits and upload quotas across free, explorer, frequent traveler, and pro tiers.

