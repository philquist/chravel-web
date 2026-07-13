# Debug Patterns — Security

Known security anti-patterns discovered during audits. Reference this before introducing similar code.

---

## 1. Capability Token Default Secret Fallback

**Symptom:** Any unauthenticated user can forge tool execution tokens.
**Risk:** CRITICAL — arbitrary trip data access and mutation via AI tool calls.
**Root Cause:** `const secret = env.get('KEY') || 'default_for_tests'` pattern makes tokens signable with a known value when env is missing.
**How to Confirm:** Check if `SUPABASE_JWT_SECRET` is set in the edge function environment. If not, tokens signed with `'default_secret_for_tests'` would be accepted.
**Smallest Safe Fix:** Throw on missing secret instead of falling back. The env is always set in Supabase hosted environments.
**Required Tests:** Unit test that `verifyCapabilityToken` throws when secret is missing.
**Regression Surfaces:** Any edge function using capability tokens.
**Fixed in:** `supabase/functions/_shared/security/capabilityTokens.ts` (March 2026 audit)

---

## 2. CORS Wildcard Subdomain Matching

**Symptom:** Cross-origin requests succeed from unauthorized domains (e.g., attacker-controlled *.vercel.app site).
**Risk:** HIGH — edge functions callable from any project on allowed hosting platforms.
**Root Cause:** `.vercel.app` suffix matcher allows `evil-site.vercel.app` to pass CORS validation.
**How to Confirm:** Deploy a test page to a random *.vercel.app URL and attempt `fetch()` to a Chravel edge function.
**Smallest Safe Fix:** Replace suffix matchers with exact production origins. Use `ADDITIONAL_ALLOWED_ORIGINS` env var for preview deployments.
**Required Tests:** Unit test that `isOriginAllowed('https://random.vercel.app')` returns false.
**Regression Surfaces:** Vercel preview deployments, Lovable preview deployments — configure ADDITIONAL_ALLOWED_ORIGINS.
**Fixed in:** `supabase/functions/_shared/cors.ts` (March 2026 audit)

---

## 3. React Spread Props Silently Override Earlier Handlers

**Symptom:** Event handlers appear wired but silently never fire. Clicks or touches do nothing despite correct-looking code.
**Risk:** MEDIUM — broken interactivity with no error or warning.
**Root Cause:** When JSX spreads an object of event handlers (`{...handlers}`) and THEN sets explicit props with the same names (e.g., `onTouchStart`, `onMouseLeave`), the explicit props override the spread. The overridden handlers silently disappear.
**How to Confirm:** Check if the same element has both `{...handlerObject}` and explicit event props with overlapping keys. The later props win.
**Smallest Safe Fix:** Merge conflicting handlers into combined callbacks that call both. Never rely on spread + explicit prop coexistence for the same event name.
**Regression Surfaces:** Any component combining `useLongPress` handlers with custom touch/mouse handlers on the same element.
**Fixed in:** `src/features/chat/components/MessageBubble.tsx` (March 2026 — merged longPress + swipe-to-reply handlers)

---

## 4. Radix PopoverTrigger Intercepts Child Button Clicks on Mobile

**Symptom:** On mobile, clicking a button wrapped in `<PopoverTrigger asChild>` opens the popover but doesn't fire the button's onClick handler (or vice versa).
**Risk:** LOW — broken mobile interactivity for tooltip/popover-wrapped buttons.
**Root Cause:** Radix UI's `PopoverTrigger` with `asChild` composes event handlers with the child. On mobile, the popover toggle behavior can conflict with the child's onClick, especially when the click target needs to perform a data mutation.
**Smallest Safe Fix:** For buttons that must always fire onClick, don't wrap in PopoverTrigger. Use the `title` attribute or a separate tooltip mechanism for mobile.
**Fixed in:** `src/features/chat/components/MessageReactionBar.tsx` (March 2026 — removed PopoverTrigger on mobile, use title instead)

---

## 3. Client-Side Super Admin Bypass (Misleading Dead Code)

**Symptom:** Code appears to grant admin access based on client-side email comparison, but RLS actually blocks the operation.
**Risk:** MEDIUM — creates false confidence that client-side checks enforce access control. A future refactor might trust this pattern.
**Root Cause:** `SUPER_ADMIN_EMAILS.includes(user.email)` check was used to skip membership validation, but the underlying Supabase query still enforces RLS.
**How to Confirm:** Trace the data flow — the Supabase client uses the anon key, so all queries respect RLS policies. The `is_super_admin()` SQL function (only allows `ccamechi@gmail.com`) is the actual enforcement.
**Smallest Safe Fix:** Remove client-side admin bypass code. Let RLS be the single source of truth.
**Required Tests:** Verify admin users can still access their data via RLS. Verify non-admin cannot bypass membership.
**Regression Surfaces:** Trip creation limits (super admin still bypasses trip count limit via client-side check — this is intentional for the founder).
**Fixed in:** `src/services/calendarService.ts`, `src/services/tripService.ts` (March 2026 audit)

---

## 4. CronGuard Fail-Open on Missing Secret

**Symptom:** Cron-only edge functions (event-reminders, payment-reminders, send-scheduled-broadcasts, delete-stale-locations) are publicly callable without authentication.
**Risk:** HIGH — unauthenticated users can trigger cron jobs, causing spam notifications, data mutations, or cost amplification.
**Root Cause:** `verifyCronAuth()` returned `authorized: true` when `CRON_SECRET` env var was not set, as a "graceful degradation" during rollout.
**How to Confirm:** Call any cron-protected edge function without headers. If it returns 200, the guard is failing open.
**Smallest Safe Fix:** Return `authorized: false` with 503 when `CRON_SECRET` is missing. Never fail-open for auth guards.
**Required Tests:** Verify that requests without valid cron secret or service role key are denied (401/503).
**Regression Surfaces:** All cron-invoked edge functions. Ensure `CRON_SECRET` is set in all environments.
**Fixed in:** `supabase/functions/_shared/cronGuard.ts` (March 2026 audit)

---

## General Anti-Patterns to Avoid

- **Never use `|| 'default'` for security-sensitive env vars** — fail loudly instead
- **Never use wildcard subdomain matching in CORS** — allows any tenant on shared platforms
- **Never rely on client-side email checks for authorization** — RLS is the enforcement layer
- **Never return raw error messages to clients** — log server-side, return generic messages
- **Never inject unsanitized user content into AI prompts** — use boundary markers and strip tags
- **Never fail-open on missing auth secrets** — deny with 503, not allow with a warning log
# Debug Patterns

> Canonical memory for recurring bugs, root causes, regression risks, and proven fixes.
> Read relevant entries before debugging. Refine existing entries over creating duplicates.

---

## Trip Not Found flash during auth hydration
- **Status:** confirmed
- **Subsystem:** trip loading / auth
- **Bug class:** async/timing
- **Symptom:** User navigates to a valid trip URL and briefly sees "Trip Not Found" before the real trip data loads
- **User-facing impact:** Confusing error flash; users may navigate away thinking the trip doesn't exist
- **Trigger conditions:** Page load on an auth-gated trip route when auth session hasn't resolved yet
- **Known non-causes:** Trip actually deleted, RLS policy misconfigured (check these but they're usually not the issue)
- **Likely root cause:** Data fetch fires before auth state resolves, gets rejected/empty result, UI treats it as "not found"
- **Root cause chain:**
  - Immediate cause: Not Found component renders
  - Proximate cause: Trip query returns null/error before auth token is available
  - Underlying cause: No guard ensuring auth hydration completes before trip data fetch executes
- **How to reproduce:**
  1. Log in as a user with trip access
  2. Hard-refresh or navigate directly to `/trip/<valid-trip-id>`
  3. Observe brief flash of error/not-found state before trip loads
- **How to confirm:** Add logging to auth state and trip query — confirm query fires before auth session is established
- **Smallest safe fix:** Gate trip data fetch on auth session being resolved (not just present — fully hydrated)
- **Regression risks:** Introducing a loading delay on all trip pages; breaking unauthenticated/demo trip views
- **Related files:** Trip loading hooks, auth provider, trip page components
- **Evidence:** Documented as zero-tolerance path in CLAUDE.md. Referenced in CLAUDE.md § UI Safety: "No flashing error states during auth hydration"
- **Provenance:** CLAUDE.md § Security Gate; historical regression reports
- **Confidence:** high

## Demo mode data contamination
- **Status:** confirmed
- **Subsystem:** demo mode / data layer
- **Bug class:** schema/data
- **Symptom:** Authenticated user data appears in demo mode, or demo mock data gets modified/deleted
- **User-facing impact:** Demo experience breaks; real user data exposed in wrong context
- **Trigger conditions:** Code path that doesn't properly branch between demo and authenticated data sources
- **Known non-causes:** Supabase RLS issues (demo mode uses local mock data, not Supabase)
- **Likely root cause:** Shared data fetching path doesn't check demo mode flag, or mutation handler modifies mock data source
- **Root cause chain:**
  - Immediate cause: Wrong data appears in UI
  - Proximate cause: Data hook returns real data in demo context or vice versa
  - Underlying cause: Demo/auth data paths not fully isolated at the hook layer
- **How to reproduce:**
  1. Enter demo mode
  2. Verify only mock data appears
  3. Check that mutations don't persist to mock data source
- **How to confirm:** Trace data source selection in hooks — verify demo flag is checked before any fetch/mutation
- **Smallest safe fix:** Ensure data hooks branch on demo mode at the earliest possible point
- **Regression risks:** Breaking demo mode entirely; blocking authenticated features behind demo check
- **Related files:** Data hooks, demo mode provider, mock data files
- **Evidence:** AGENTS.md § 0.7: "Demo mode is sacred. Mock data is NEVER modified."
- **Provenance:** AGENTS.md § 0 Non-Negotiables
- **Confidence:** high

## Chat read receipt write amplification (N×M upserts)
- **Status:** fixed
- **Subsystem:** chat / read receipts
- **Bug class:** performance / write amplification
- **Symptom:** Every new message triggers marking ALL visible messages as read for every user — N users × M messages upserts per INSERT
- **User-facing impact:** DB write latency, potential 429 rate limits at scale, wasted bandwidth
- **Trigger conditions:** Any new message arriving via realtime subscription
- **Likely root cause:** useEffect dependency on `liveMessages` array (changes on every INSERT) triggering `markMessagesAsRead` for ALL messages, not just new ones
- **Root cause chain:**
  - Immediate: Supabase upsert storm on message_read_receipts
  - Proximate: useEffect fires on every liveMessages reference change
  - Underlying: No tracking of already-marked message IDs
- **Smallest safe fix:** Track marked IDs in a ref, debounce 1s, only mark new unread messages
- **Regression risks:** Delayed read receipts (1s debounce); stale read state if ref not reset on trip change
- **Related files:** `src/features/chat/components/TripChat.tsx`
- **Fixed in:** March 2026 chat reliability audit
- **Confidence:** high

## Chat reaction refetch storm on every message
- **Status:** fixed
- **Subsystem:** chat / reactions
- **Bug class:** performance / N+1
- **Symptom:** Full reaction fetch for ALL loaded messages fires on every new message arrival
- **Trigger conditions:** `useEffect` with `[liveMessages.length]` dependency
- **Smallest safe fix:** Fetch reactions once on initial load, rely on realtime subscription for incremental updates
- **Related files:** `src/features/chat/components/TripChat.tsx`
- **Fixed in:** March 2026 chat reliability audit
- **Confidence:** high

## Voice tool call fails silently due to unimplemented declaration
- **Status:** confirmed (latent)
- **Subsystem:** AI concierge / voice tools
- **Bug class:** declaration/implementation mismatch
- **Symptom:** Voice concierge says it completed an action but nothing happens in the trip. No error shown to user.
- **User-facing impact:** Lost trust — user thinks AI did something but no data was created/changed
- **Trigger conditions:** Model selects a tool from `voiceToolDeclarations.ts` that has no matching `case` in `functionExecutor.ts`
- **Known affected tools:** getWeatherForecast, convertCurrency, browseWebsite, makeReservation, settleExpense, generateTripImage, setTripHeaderImage, getDeepLink, explainPermission, verify_artifact, createBroadcast, createNotification
- **Likely root cause:** Voice tool declarations were expanded from a roadmap document without corresponding backend implementation
- **Smallest safe fix:** Remove unimplemented tools from `voiceToolDeclarations.ts`, or implement them in `functionExecutor.ts`
- **Regression risks:** Removing tools may cause model to verbally refuse requests it previously "handled" (but silently failed)
- **Related files:** `supabase/functions/_shared/voiceToolDeclarations.ts`, `supabase/functions/_shared/functionExecutor.ts`
- **Provenance:** March 2026 AI Concierge architecture & prompt audit
- **Confidence:** high

## Action Plan JSON mandate ignored by model
- **Status:** confirmed (design issue)
- **Subsystem:** AI concierge / prompt design
- **Bug class:** prompt compliance
- **Symptom:** System prompt mandates a JSON `plan_version: 1.0` block at the start of every response, but model frequently skips it for simple queries
- **User-facing impact:** Inconsistent response format; wasted tokens when model does comply; no functional benefit since the plan is not machine-parsed
- **Trigger conditions:** Any simple query where the model decides the JSON plan adds no value
- **Likely root cause:** Instruction conflicts — "be concise" vs "always output a JSON plan first"
- **Smallest safe fix:** Remove the Action Plan mandate from the system prompt entirely, or make it conditional for multi-action requests
- **Related files:** `supabase/functions/_shared/promptBuilder.ts` (lines 29-50)
- **Provenance:** March 2026 AI Concierge architecture & prompt audit
- **Confidence:** high

## Preference injection on irrelevant queries wastes tokens
- **Status:** confirmed (inefficiency)
- **Subsystem:** AI concierge / context injection
- **Bug class:** performance / token bloat
- **Symptom:** Dietary preferences, vibe preferences, budget preferences injected into every trip-related query, even "what time is our reservation?"
- **User-facing impact:** Slower time-to-first-token from larger prompt; no quality benefit for non-recommendation queries
- **Trigger conditions:** Any trip-related query for a paid user with preferences set
- **Likely root cause:** Preference injection in `promptBuilder.ts` is always-on when `tripContext.userPreferences` exists, with no query-type filter
- **Smallest safe fix:** Only inject preferences when query matches recommendation/food/activity/venue patterns
- **Related files:** `supabase/functions/_shared/promptBuilder.ts` (lines 101-117), `supabase/functions/_shared/contextBuilder.ts` (resolveUserPreferences)
- **Provenance:** March 2026 AI Concierge architecture & prompt audit
- **Confidence:** high

## Chat messages lost during websocket reconnect
- **Status:** fixed
- **Subsystem:** chat / realtime
- **Bug class:** eventual consistency / data loss
- **Symptom:** Messages sent by others during a websocket drop are never displayed
- **Trigger conditions:** Mobile background/foreground, poor connectivity, Supabase channel error/timeout
- **Smallest safe fix:** Track last known server timestamp; on channel SUBSCRIBED (after reconnect) and on visibilitychange, fetch messages since that timestamp and merge with dedupe
- **Regression risks:** Duplicate messages if dedupe fails; unnecessary fetches if called too frequently
- **Related files:** `src/features/chat/hooks/useTripChat.ts`
- **Fixed in:** March 2026 chat reliability audit
- **Confidence:** high

## Lineup "replace import" can hard-delete data on transient insert failures
- **Status:** fixed
- **Subsystem:** events / lineup import
- **Bug class:** multi-step mutation data loss
- **Symptom:** Using Smart Import with `replace` mode can wipe existing lineup rows when delete succeeds but insert fails.
- **User-facing impact:** High — lineup names/bios/avatars can disappear in one action; recovery may require manual reconstruction.
- **Trigger conditions:** Organizer runs replace import, network/API error occurs between delete and insert (or insert rejects).
- **Likely root cause:** Client performed destructive two-step mutation (`DELETE all` then `INSERT new`) without transaction safety.
- **Root cause chain:**
  - Immediate: Existing rows removed before replacement rows are persisted
  - Proximate: Insert error after successful delete
  - Underlying: No insert-first plan or server-side transactional replace
- **Smallest safe fix:** Compute replace plan from current rows, insert missing names first, then delete stale rows only after successful inserts.
- **Regression risks:** Replace mode now preserves existing metadata (bio/avatar/title) for unchanged names by design; this is safer than row recreation.
- **Related files:** `src/hooks/useEventLineup.ts`
- **Fixed in:** March 2026 forensic correctness audit
## Dashboard trip cards missing after join approval (status-column drift)
- **Status:** confirmed
- **Subsystem:** trip dashboard hydration / membership query
- **Bug class:** schema compatibility / source-of-truth drift
- **Symptom:** User receives "Join Request Approved" notification, but approved trip still does not appear on dashboard after refresh/sign-out/sign-in.
- **User-facing impact:** User appears approved in notifications but cannot access trip from dashboard.
- **Trigger conditions:** Environment where `trip_members.status` is unavailable (or querying it errors) while dashboard query uses `.or('status.is.null,status.eq.active')` without fallback.
- **Likely root cause:** `tripService.getUserTrips()` member-trip lookup fails on status-filter query and silently skips all member trips; approval notification path still succeeds.
- **Root cause chain:**
  - Immediate cause: dashboard member-trip query returns error/no rows
  - Proximate cause: `trip_members.status` filter executed with no compatibility retry
  - Underlying cause: inconsistent schema compatibility handling across trip member query paths
- **How to reproduce:**
  1. Mock/operate against schema where `trip_members.status` column is unavailable
  2. Approve a join request successfully (notification arrives)
  3. Load dashboard and observe missing member trip card
- **How to confirm:** Inspect `tripService.getUserTrips()` member query error; if it references missing `status` and no fallback runs, this is the cause.
- **Smallest safe fix:** Retry member lookup without `status` filter when the status-column query fails, then continue normal trip hydration.
- **Regression risks:** Potential inclusion of legacy rows in old schemas (acceptable compatibility tradeoff for environments without status semantics).
- **Related files:** `src/services/tripService.ts`
- **Fixed in:** March 2026 forensic join-approval dashboard fix
- **Confidence:** medium-high
## Media tab photo tiles show "Unable to preview" for chat uploads
- **Status:** fixed
- **Subsystem:** media hub / storage URL resolution
- **Bug class:** URL resolution drift
- **Symptom:** A photo uploaded from chat appears in Media tab counts but tile fails to load and renders "Unable to preview"
- **User-facing impact:** Photos look broken in Media while chat message may still render, reducing trust in upload reliability
- **Trigger conditions:** `trip-media` bucket is private or public URL access is restricted; media tile uses raw `media_url` without signing
- **Likely root cause:** New `MediaGrid` + `MediaTile` path bypassed `useResolvedTripMediaUrl`, while older paths still resolved signed URLs
- **Smallest safe fix:** Resolve signed URLs at the canonical tile/viewer boundary (`MediaTile`, `MediaViewerModal`, mobile `MediaGridItem`) before rendering `<img>/<video>`
- **Regression risks:** Signed URL expiration in long-lived sessions (mitigated by existing resolver cache/refresh logic)
- **Related files:** `src/components/media/MediaTile.tsx`, `src/components/media/MediaViewerModal.tsx`, `src/components/mobile/MediaGridItem.tsx`, `src/hooks/useResolvedTripMediaUrl.ts`
- **Fixed in:** March 2026 media forensic fix
- **Confidence:** high

## Legacy nullable event enabled_features disables attendee tabs
- **Status:** fixed
- **Subsystem:** event tabs / admin settings / mobile event detail
- **Bug class:** legacy schema compatibility / source-of-truth drift
- **Symptom:** Opening an event in mobile/Android shows the same "disabled by admin" state across event tabs even though the organizer never turned them off; admin settings can also render all optional tabs as off for older events.
- **User-facing impact:** Event surfaces look broken or unavailable for legacy events, especially on installed mobile apps where attendees primarily enter via the event detail tab rail.
- **Trigger conditions:** Existing event rows with `trips.enabled_features = NULL` after the feature-flag column rollout; attendee tab rendering uses live DB settings instead of seeded defaults.
- **Likely root cause:** Shared helper `buildEventEnabledTabs()` correctly treats missing settings as "all optional tabs enabled," but `useEventTabSettings` and `useEventAdmin` coerced `NULL` to `[]`, which the UI interpreted as "all optional tabs disabled."
- **Root cause chain:**
  - Immediate: Event tab settings hook resolves `chat/calendar/media/polls/tasks` to disabled.
  - Proximate: Hooks normalize `NULL enabled_features` to empty array.
  - Underlying: Legacy compatibility logic existed in one helper layer but not in the live data-fetch/admin mutation paths.
- **How to reproduce:**
  1. Use an event trip whose `enabled_features` column is `NULL`
  2. Open the event on mobile/Android
  3. Observe attendee-facing tabs appear disabled despite no organizer action
- **How to confirm:** Inspect the row in `trips`; if `enabled_features` is `NULL` and `useEventTabSettings` / `useEventAdmin` collapse it to `[]`, this is the cause.
- **Smallest safe fix:** Normalize `NULL` to "legacy defaults" at the shared event-tab helper boundary and route both attendee rendering and admin toggle logic through that helper.
- **Regression risks:** New events with explicit empty arrays would still behave as explicitly disabled; ensure tests cover `undefined` and `null` separately.
- **Related files:** `src/lib/eventTabs.ts`, `src/hooks/useEventTabSettings.ts`, `src/hooks/useEventAdmin.ts`
- **Fixed in:** April 2026 Android event-tab forensic fix
- **Confidence:** high

---

## LiveKit Token roomConfig Dead Code

- **Symptom:** Voice sessions always fail with "Agent did not join within timeout" — the room is created but has no metadata or agent dispatch instructions.
- **Risk:** HIGH — complete voice feature outage. Room connects but no agent is dispatched.
- **Root cause:** `livekit-token/index.ts` set `(token as any).roomConfig = {...}` on an `AccessToken` instance. `AccessToken.toJwt()` does not serialize arbitrary JS properties. Additionally, `RoomConfiguration` (the protobuf type) does not have a `metadata` field, so even the "correct" token-based approach cannot set room metadata.
- **Smallest safe fix:** Use `RoomServiceClient.createRoom()` to create the room with metadata and `agents: [{agentName: 'chravel-voice'}]` before returning the join token. Remove `roomCreate: true` from the token grant.
- **Why this persists:** The `(token as any)` cast bypasses type checking, and code review treated the comment "intentional cast" as sufficient justification. No integration test validates agent dispatch.
- **Related files:** `supabase/functions/livekit-token/index.ts`, `agent/src/index.ts` (reads `ctx.room.metadata`)
- **Fixed in:** April 2026 LiveKit voice stack audit
## Supabase Edge Function unclosed scope causes silent deploy failure
- **Status:** fixed
- **Subsystem:** any edge function / supabase/functions/
- **Bug class:** Deno TypeScript syntax / unclosed brace
- **Symptom:** Edge function deploys without error but throws a parse/runtime error at invocation; or `supabase functions deploy` succeeds but function body is structurally broken.
- **User-facing impact:** High — the entire function becomes non-functional at runtime.
- **Trigger conditions:** A helper function's closing `}` is missing, usually due to a refactor that moves code without closing the outer function. TypeScript compiler may not catch this if there are no type errors in the partial parse tree.
- **Likely root cause:** Manual editing of large edge functions without bracket-balance validation.
- **How to confirm:** `node -e "const fs=require('fs'); const c=fs.readFileSync('<function>/index.ts','utf8'); let d=0; c.split('').forEach(ch=>{if(ch==='{')d++;if(ch==='}')d--;}); console.log('brace balance:',d);"` — result must be 0.
- **Smallest safe fix:** Add the missing `}` after the last statement of the unclosed function.
- **Regression risks:** None — purely additive bracket.
- **Related files:** `supabase/functions/gmail-import-worker/index.ts` (fixed April 2026)
- **Confidence:** high

---

## Pending Action Confirm Throws "Unknown tool: X"

- **Symptom:** User clicks "Confirm" on an AI-generated pending action card (e.g., a reminder, budget, or new expense). The card dismisses but no data is created. Browser console shows `Error: Unknown tool: addReminder`.
- **Risk:** MEDIUM — silent data loss; user believes the action was confirmed.
- **Root cause:** `usePendingActions.ts` `confirmMutation` switch statement only had cases for `createTask`, `createPoll`, and `addToCalendar`. Any other `tool_name` hits the `default: throw new Error('Unknown tool: ...')` path. The confirm status update still fails because the throw propagates before the `trip_pending_actions` row is marked confirmed.
- **How to confirm:** Add a pending action via AI for any non-original-3 tool (e.g., "set a reminder", "set a trip budget", "log an expense"). Open DevTools Network tab. Click Confirm. Watch for the thrown error in the mutation's `onError` handler toast.
- **Smallest safe fix:** Add an explicit `case` for every tool that uses `insertPendingAction` in `functionExecutor.ts`. For tools where the pending action row IS the record (no secondary DB write needed), use `case 'toolName': { break; }`. For tools that do create data (addExpense → trip_payment_messages, duplicateCalendarEvent → trip_events), add the matching insert/update.
- **Also fix:** `PendingActionCard.tsx` `TOOL_CONFIG` — missing entries fall through to "Unknown action" label and default icon.
- **Regression surfaces:** Every future pending-buffer write tool added without updating `usePendingActions.ts`.
- **Related files:** `src/hooks/usePendingActions.ts`, `src/features/chat/components/PendingActionCard.tsx`
- **Fixed in:** April 2026, 74-tool expansion (`0d9bed1`)
- **Confidence:** high
## Invite CTA loops "ask for invite link" after auth (preview path)
- **Status:** fixed
- **Subsystem:** invite conversion / trip preview CTA routing
- **Bug class:** source-of-truth overwrite / permission drift
- **Symptom:** User opens invite flow, authenticates, then "Request to Join" repeatedly shows a toast asking for an invite link they already had.
- **Trigger conditions:** `TripPreview` loaded without membership and client-side `trip_invites` query returns null (RLS/policy mismatch, anon/auth context drift).
- **Likely root cause:** CTA routing depended on a client invite query that could overwrite valid invite context with `null`.
- **Smallest safe fix:** Return `active_invite_code` from service-role `get-trip-preview` and route CTA from that payload; avoid secondary client query as authority.
- **Related files:** `src/pages/TripPreview.tsx`, `supabase/functions/get-trip-preview/index.ts`
- **Fixed in:** April 2026 invite flow deep-dive pass
- **Confidence:** medium-high

## Branded trip-share proxy renders raw JSON when preview edge runtime is degraded
- **Status:** fixed
- **Subsystem:** trip invite/share preview proxy (`/t/:tripId` on branded host)
- **Bug class:** error-boundary / content-type fallback gap
- **Symptom:** Opening a branded trip share link shows raw JSON like `{"code":"SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED"...}` instead of redirecting into the app join flow.
- **User-facing impact:** High — users cannot continue through invite/join flow from branded link during upstream preview outages.
- **Trigger conditions:** `api/trip-preview` receives non-HTML response (often 503 JSON) from Supabase `generate-trip-preview`.
- **Likely root cause:** Proxy passed upstream body/status through verbatim without guarding for non-HTML degraded payloads.
- **Smallest safe fix:** In `api/trip-preview`, detect `!upstream.ok || !bodyLooksHtml` and return fallback HTML with meta-refresh + CTA to `https://chravel.app/trip/:tripId/preview`.
- **Regression risks:** None meaningful; successful HTML previews still pass through unchanged.
- **Related files:** `api/trip-preview.ts`, `src/__tests__/trip-preview-api.test.ts`
- **Fixed in:** April 2026 trip-join degradation hardening.
- **Confidence:** high

## Trip preview has no active invite code, blocking join CTA for shared UUID trip links
- **Status:** fixed
- **Subsystem:** trip preview → invite bridge (`get-trip-preview` + `TripPreview`)
- **Bug class:** missing invite bootstrap / stale preview state
- **Symptom:** User opens `/t/:tripId` or `/trip/:tripId/preview`, clicks “Join This Trip,” and gets “ask organizer for invite link” even though they already have the trip share link.
- **User-facing impact:** High — shared trip cannot convert to join-request flow without manual organizer intervention.
- **Trigger conditions:** Trip has no active row in `trip_invites` (inactive/expired/deleted historical links) when preview is fetched.
- **Likely root cause:** Preview flow treated existing active invite as required input but did not self-heal missing invite state for shared trip links.
- **Smallest safe fix:** Add optional `ensureInvite` behavior in `get-trip-preview` to auto-create one active invite when missing, and make `TripPreview` request with `ensureInvite: true` plus one retry on join click.
- **Related files:** `supabase/functions/get-trip-preview/index.ts`, `src/pages/TripPreview.tsx`, `src/pages/__tests__/TripPreview.inviteFlow.test.tsx`
- **Fixed in:** April 2026 trip invite bootstrap hardening.
- **Confidence:** high

## Shared invite link (`/j/:code`) unfurled generically and hard-loading `/join/:code` looped forever
- **Status:** fixed
- **Subsystem:** invite link OG preview proxy (`api/invite-preview.ts`, `vercel.json` rewrites)
- **Bug class:** missing rewrite + crawler/browser response conflation
- **Symptom:** Links shared from the app (`buildInviteLink` emits `/j/{code}`) unfurled with the generic branded card in Slack/iMessage instead of per-trip metadata, because only `/join/:code` had a Vercel rewrite. Separately, a real browser hard-loading `/join/:code` never reached the SPA: the OG HTML's `<meta http-equiv="refresh">` target was the same rewritten URL, so it bounced through the rewrite forever.
- **Root cause:** One handler served the same OG HTML (designed for crawlers, with an auto-refresh) to every user agent. Any URL shape that both (a) has an OG-preview rewrite and (b) meta-refreshes to a URL matching that same rewrite will loop for humans.
- **Smallest safe fix:** Branch on User-Agent (`isLikelyHtmlCrawler`) in the proxy: crawlers get the proxied OG HTML, browsers get the SPA shell (`index.html`) fetched directly so React Router renders the real page at that URL. Add the missing `/j/:code` rewrite. Critically, the degraded fallback for the browser branch (SPA fetch fails/non-ok) must NOT fall through to the crawler HTML — that reintroduces the identical loop on a rarer path. Give it its own static, non-refreshing fallback.
- **Regression risks:** `Vary: User-Agent` is required on every branch or the CDN can serve a cached OG response to a browser (or vice versa) — treat this as one response contract, not two independent code paths that happen to share a file.
- **Related files:** `api/invite-preview.ts`, `vercel.json`, `unfurl/crawlerDetection.ts`, `src/__tests__/invite-preview-api.test.ts`
- **Fixed in:** July 2026 invite flow audit.
- **Confidence:** high

## 5. Stream ReadChannel Permission Denial for Existing Trip Members

**Symptom:** Messages tab shows raw Stream error `GetOrCreateChannel failed ... ReadChannel` with retry loop.
**Risk:** HIGH — chat appears broken even when user is a valid `trip_members` row in Supabase.
**Root Cause:** Stream channel membership drift (historical members missing in Stream) causes `channel.watch()` authorization failure.
**How to Confirm:** Affected user exists in `trip_members` for trip but Stream channel membership lacks that user. Browser receives Stream error code 17 / ReadChannel.
**Smallest Safe Fix:** Add authenticated edge repair endpoint to verify Supabase trip membership and re-add user to `chravel-trip` + `chravel-broadcast`, then retry watch once in `useStreamTripChat`.
**Required Tests:** Unit test for Stream ReadChannel error classification helper; manual verification of self-heal on affected trip.
**Regression Surfaces:** Older trips created before Stream sync hardening and users added through non-standard flows.
**Fixed in:** `src/hooks/stream/useStreamTripChat.ts`, `supabase/functions/stream-ensure-membership/index.ts` (April 2026)

## 6. Mock-ID Tier Gate Disables Feature for All Real Trips

**Symptom:** A consumer-only feature (system message preferences, EventLogDrawer, activity emission) appears in Settings UI and persists state, but no behavior change is observed in the chat — toggles do nothing for real trips.
**Risk:** HIGH — the feature is fully cosmetic in production despite having a working UI, persistence, RLS, and render layer. Easy to ship and miss until customer reports.
**Root Cause:** `isConsumerTrip(tripId)` from `tripTierDetector.ts` returns `true` only for hardcoded mock IDs `'1'..'12'`. Real trips (UUIDs) always return `false`, so any `if (isConsumerTrip(id))` gate disables the feature for every production trip.
**How to Confirm:** Grep for `isConsumerTrip(` and look at each call site. If it gates production behavior (not demo content), the feature is dead in prod.
**Smallest Safe Fix:** Use the DB-backed `useTripType(tripId)` hook (returns `isConsumer` from `trips.trip_type`) for production gates; reserve `isConsumerTrip` for demo-content rendering only. For non-React contexts, query `trips.trip_type` directly with a short-lived cache.
**Required Tests:** Unit test that the gate returns true for real consumer trips and false for pro/event; integration test that the feature is observable on a UUID trip.
**Regression Surfaces:** Any feature whose product spec says "consumer trips only" — chat activity preferences, event log, basecamp system messages, and similar.
**Fixed in:** `src/hooks/useTripType.ts`, `src/features/chat/components/TripChat.tsx`, `src/components/trip/EventLogDrawer.tsx`, `src/services/systemMessageService.ts` (April 2026)

## 7. Trip Cover Photo Upload Pipeline Drift

**Symptom:** Beta users report "I uploaded a cover photo but it didn't show up." Repeated fix attempts (cache-busting, RLS tweaks) keep regressing. The most visible failure is a fresh pro/event trip whose cover doesn't appear on the dashboard until manual refresh; pro trip share modal never carries the cover.
**Risk:** HIGH — affects every trip create + cover and every cover replace. Beta-blocking.
**Root Cause:** Three independent upload code paths (`CreateTripModal`, `EditTripModal` via `TripCoverPhotoUpload`, `TripHeader`) duplicated `uploadTripCoverBlob` + DB write + cache invalidation, each with subtly different invalidation footprints. Past fixes touched one path and silently regressed the others. Three additional defects compounded the symptom: `ProTripCard.tsx:287` hardcoded `coverPhoto: undefined` in shareTrip; `CreateTripModal` invalidated only `[TRIPS_QUERY_KEY]` (missing `proTrips`/`events`/`pending-request-trip-cards`); `TripHeader` and `TripCoverPhotoUpload` prepended `?v=${Date.now()}` BEFORE `updateCoverPhoto`, persisting the cache-buster into `cover_image_url`.
**How to Confirm:** (1) Verify migrations `20260421171000`/`210620` are in prod via `mcp__supabase__list_migrations`. (2) `select cover_image_url from trips where cover_image_url like '%?v=%' and updated_at > '<fix_deploy>'` — must be zero. (3) Open React Query devtools during upload; all of `['trips']`, `['proTrips']`, `['events']`, `['pending-request-trip-cards']`, predicate-matched `['trip', tripId]` should refetch within 1s. (4) Inspect `ProTripCard.tsx` shareTrip — `coverPhoto` must be the variable, not `undefined`.
**Smallest Safe Fix:** Single owner for upload pipeline. New `useCoverPhotoUpload` hook (`src/features/trips/hooks/useCoverPhotoUpload.ts`) wraps `uploadTripCoverBlob` + persistence + invalidation + cleanup-on-failure. Direct mode for CreateTripModal (writes `cover_image_url` itself); callback mode for TripHeader/TripCoverPhotoUpload (delegates to existing `useTripCoverPhoto.updateCoverPhoto`). Shared invalidation in `src/lib/tripCoverInvalidation.ts` ensures all six query surfaces update together.
**Required Tests:** E2E for create-trip-with-cover (consumer/pro/event); unit tests for `useCoverPhotoUpload` covering both modes and cleanup-on-persist-failure.
**Regression Surfaces:** Any future cover photo bug — start at `useCoverPhotoUpload`, not call sites. Adding a new call site? Use the hook; do NOT duplicate `uploadTripCoverBlob`. New invalidation surface? Add the key to `invalidateTripCoverQueries` only — never inline in callers.
**Fixed in:** `ProTripCard.tsx`, `CreateTripModal.tsx`, `TripHeader.tsx`, `TripCoverPhotoUpload.tsx`, `src/features/trips/hooks/useCoverPhotoUpload.ts`, `src/lib/tripCoverInvalidation.ts` (May 2026, branch `claude/fix-cover-photo-upload-RodMM`).

## 8. Stream Adapter Drops Custom Message Metadata

**Symptom:** Render-side filter that depends on a custom Stream message field (e.g. `system_event_type`) silently degrades to "show everything" because the field is `undefined` at the render call site.
**Risk:** HIGH — category-level filtering breaks; UI prefs UX appears to work in tests but no real message ever has the field, so filtering is a no-op in prod.
**Root Cause:** The Stream → Chravel adapter (`messageMapper.ts`) and the in-component mapping in `TripChat.tsx` only forward a known shortlist of custom fields. Any new custom field added on the writer side must also be forwarded by both readers.
**How to Confirm:** Send a Stream message with `{ message_type: 'system', system_event_type: 'X' }`. Inspect the message object that reaches `MessageItem` — check whether the field survived the mapper.
**Smallest Safe Fix:** Forward the field explicitly in both the typed adapter (`streamMessageToChravel`) and the inline mapping in `TripChat.liveFormattedMessages`. Add a round-trip unit test in `messageMapper.systemEvent.test.ts` so future custom fields are forced through the same gate.
**Required Tests:** Unit test that any custom field round-trips: writer payload includes it → adapter exposes it. Lint rule (future) to flag `as any` on Stream message fields.
**Regression Surfaces:** Adding any new custom Stream field — system messages, broadcast metadata, payment metadata, etc.
**Fixed in:** `src/services/stream/adapters/mappers/messageMapper.ts`, `src/features/chat/components/TripChat.tsx` (April 2026)

## 9. Radix Dialog / AlertDialog Opens Behind Full-Screen In-App Overlays

**Symptom:** A control inside Settings (or another `fixed inset-0 z-[60]`–`z-[70]` shell) appears dead — clicks do nothing and no modal is visible. The feature works on desktop routes without that shell.
**Risk:** MEDIUM — GDPR export, confirmations, and similar flows look broken; users assume the backend is a no-op.
**Root Cause:** Radix `Dialog` / `AlertDialog` portals default to `z-50` in shadcn primitives. Full-screen settings (`SettingsMenu`) and some trip modals use higher z-index (`z-[60]` / `z-[70]`), so the portaled content renders *under* the opaque overlay.
**How to Confirm:** Open React devtools or inspect DOM while triggering the action — the dialog node exists with `data-state=open` but sits below the settings layer in paint order.
**Smallest Safe Fix:** Raise shared `Dialog` + `AlertDialog` overlay/content to a band above in-app shells (e.g. `z-[80]`) but still below toast/auth (`z-[100]`). For Capacitor, prefer `Capacitor.Plugins.Browser.open` for signed download URLs when `<a>.click()` is unreliable.
**Required Tests:** None mandatory for z-index; manual check from Settings on mobile + iOS shell.
**Regression Surfaces:** Any future full-screen overlay with z-index between `50` and dialog band — keep ordering documented in component comments.
**Fixed in:** `src/components/ui/dialog.tsx`, `src/components/ui/alert-dialog.tsx`, `src/hooks/useDataExport.ts`, `src/components/settings/SettingsLayout.tsx` (May 2026, PR #608)

## 10. Marketing Bootstrap Split Traps TestFlight / Native Shells

**Symptom:** After deploying the marketing split, TestFlight/Capacitor/chravel-mobile users see the public marketing landing (or a spinner) instead of the in-app sign-in shell; trips never load.
**Risk:** P0 — installed iOS beta unusable on cold start at `/`.
**Root Cause:** `main.tsx` gated anonymous `/` to `MarketingApp`, which has no trip routes. `Index.tsx` already routes installed shells to `AuthModal`, but that logic never runs when the marketing shell boots first. `isChravelNativeShell()` was only used for SW/telemetry, not bootstrap.
**How to Confirm:** Open TestFlight build at `/` with cleared storage — marketing hero appears instead of auth modal. In Safari devtools (remote WebView), `shouldUseMarketingBootstrap` is true while `isInstalledApp()` is true.
**Smallest Safe Fix:** `shouldUseMarketingBootstrap({ isInstalledApp: true })` → false in `src/lib/bootstrapShell.ts`; optional `MarketingApp` escape to `/auth`.
**Required Tests:** `src/lib/__tests__/bootstrapShell.test.ts` — installed + anonymous `/` must not use marketing shell.
**Regression Surfaces:** Any change to `main.tsx` cold-start routing or `VITE_MARKETING_SPLIT`.
**Fixed in:** `src/lib/bootstrapShell.ts`, `src/main.tsx`, `src/MarketingApp.tsx` (June 2026)

## iOS chat composer moves with entire webview
- **Status:** confirmed
- **Subsystem:** mobile trip chat / concierge layout
- **Bug class:** iOS visual viewport + document scroll ownership
- **Symptom:** Message list scroll or keyboard focus drags the whole chat screen/composer instead of keeping the composer pinned like iMessage/WhatsApp.
- **Likely root cause:** The chat pane may size to the visual viewport, but if `.mobile-trip-shell` remains in normal document flow, WebKit can still make the page/body the scroll container during rubber-band or keyboard reveal.
- **Smallest safe fix:** Make the mobile trip shell own the viewport (`position: fixed; inset: 0; height: var(--visual-viewport-height, 100dvh); overflow-hidden`) and keep chat/concierge as internal-scroll tabs only.
- **Required tests:** Verify `useKeyboardHandler` updates viewport vars on both `visualViewport.resize` and `visualViewport.scroll`; verify mobile tab content continues to size from `--visual-viewport-height`.
- **Regression risks:** Applying fixed-shell behavior too broadly can break non-trip pages; scope the class to mobile trip detail shells only.
- **Fixed in:** `src/index.css`, `src/hooks/useKeyboardHandler.ts` (June 2026 follow-up after PR #721)

## iOS chat composer floats above keyboard with a dead gap
- **Status:** confirmed
- **Subsystem:** mobile trip chat / concierge layout
- **Bug class:** iOS visual viewport offsetTop not compensated
- **Symptom:** Tapping the chat input opens the keyboard, but the text field floats up toward the top with empty space between the field and the keyboard (instead of sitting directly on the keyboard like iMessage/WhatsApp).
- **Root cause:** `.mobile-trip-shell` is `position: fixed` and sizes to `--visual-viewport-height`, but iOS scrolls the *visual* viewport (`visualViewport.offsetTop > 0`) to reveal the focused input while the *layout* viewport — and the fixed shell — stays pinned at y=0. The bottom-pinned composer ends up `offsetTop` px above the keyboard.
- **Smallest safe fix:** Track `visualViewport.offsetTop` into `--visual-viewport-offset-top` (in `useKeyboardHandler`, alongside `--visual-viewport-height`) and apply it as the shell's `top` so the fixed shell follows the visible region. Clear the var on keyboard hide.
- **Required tests:** Verify `useKeyboardHandler` sets `--visual-viewport-offset-top` from `visualViewport.offsetTop` on resize/scroll and clears it on hide (`src/hooks/__tests__/useKeyboardHandler.test.tsx`).
- **Fixed in:** `src/index.css`, `src/hooks/useKeyboardHandler.ts` (June 2026 follow-up after PR #722)

---

## Service-Role Edge Functions Need an Authz Gate Before Every Write

**Symptom:** Edge function authenticates weakly (or not at all), then uses `SUPABASE_SERVICE_ROLE_KEY` to write rows or storage objects from caller-supplied IDs/paths.
**Risk:** CRITICAL — BOLA/IDOR, tenant data poisoning, destructive jobs, or cross-tenant storage writes because service role bypasses RLS.
**Root Cause:** Treating a valid bearer token, route param, or request body `trip_id`/`broadcast_id`/`folder` as authorization instead of loading the target object server-side and checking active membership/ownership.
**How to Confirm:** Search service-role edge functions for request-body `trip_id`, `broadcast_id`, `folder`, or cron-like work before `auth.getUser`, `verifyCronAuth`, and active membership/owner checks.
**Smallest Safe Fix:** Authenticate first, load the canonical target record server-side, check active membership/ownership/admin permission, derive storage paths server-side, and return 404 for unauthorized private objects.
**Required Tests:** Unauthenticated denied, authenticated non-member denied, member/owner allowed, caller-supplied mismatched IDs/paths ignored or rejected.
**Regression Surfaces:** Message parsing, broadcast reactions, scheduled messages, advertiser asset uploads, search-index population, and any new service-role edge function.
**Fixed in:** `supabase/functions/message-parser/index.ts`, `broadcasts-react`, `message-scheduler`, `populate-search-index`, `image-upload` (June 2026 P0 hardening)

## Concierge Search button appears dead on mobile
- **Status:** confirmed
- **Subsystem:** mobile Concierge / MobileTripTabs
- **Bug class:** stale useCallback closure over activeTab
- **Symptom:** Tapping Search does nothing (modal never stays open); upload may still work.
- **Root cause:** `renderTabContent` used `activeTab` for `isActive={activeTab === tabId}` but omitted `activeTab` from deps, so Concierge kept `isActive=false` and its inactive effect closed Search on open.
- **Smallest safe fix:** Add `activeTab` to the callback deps; keep the inactive teardown effect independent of `searchOpen`.
- **Required tests:** MobileTripTabs asserts Concierge receives `isActive=true` when selected; AIConciergeChat keeps Search open while active and closes when inactive.
- **Fixed in:** `MobileTripTabs.tsx`, `AIConciergeChat.tsx` (July 2026)

## Concierge waveform tap starts then silently dies
- **Status:** mitigated (App Store path)
- **Subsystem:** realtime voice / useRealtimeVoice
- **Bug class:** effect teardown race on callback identity (+ product instability)
- **Symptom:** Waveform button click appears to do nothing; no overlay or brief flash.
- **Root cause:** Unmount cleanup `useEffect(() => stop, [stop])` re-ran when caption helpers changed `stop` identity, aborting the session; always-mounted hook amplified the race. Repeated LiveKit/Gateway fixes still left realtime too flaky for App Store first impression.
- **Smallest safe fix (launch):** Waveform mounts `VoiceButton` → Web Speech dictation; remove in-field duplicate mic; gate `RealtimeVoiceButton` behind `concierge_realtime_voice` (default OFF). Keep realtime code for experimental re-enable.
- **Prior fix (retained):** `stopRef` + empty-deps unmount cleanup; lazy-mount voice session after tap.
- **Required tests:** AIConciergeChat.controls asserts waveform → `handleConvoToggle`; realtime only when flag on; RealtimeVoiceButton lazy-mount test retained.
- **Fixed in:** `AIConciergeChat.tsx`, `AiChatInput.tsx`, `VoiceButton.tsx`, migration `20260711210646_disable_realtime_voice_for_app_store.sql` (July 2026)

## Realtime voice connects then WS fails under meta CSP
- **Status:** confirmed
- **Subsystem:** realtime voice / CSP / Vercel AI Gateway
- **Bug class:** policy drift between `index.html` meta CSP and `vercel.json` header CSP
- **Symptom:** Waveform opens / mint may succeed, but browser blocks `wss://ai-gateway.vercel.sh` (and related HTTPS). Controls otherwise look present.
- **Root cause:** Live `chravel.app` was observed serving meta CSP only (no HTTP CSP header). Meta `connect-src` listed Lovable gateway but omitted `https://ai-gateway.vercel.sh` and `wss://ai-gateway.vercel.sh` even though `vercel.json` already allowed them. Multiple CSPs intersect — the stricter meta blocked the session.
- **Smallest safe fix:** Keep meta and header CSP in lockstep; add both AI Gateway hosts to `index.html` `connect-src`.
- **Required tests:** Document provenance + manual WS check; do not rewrite July 9 control fixes.
- **Fixed in:** `index.html` (July 2026 recovery)
- **Also check:** TestFlight may still be stale if `chravel-mobile` bundles frozen `dist` instead of loading `https://chravel.app`.

## Stream chat iMessage polish: attachments + grouping silently no-op
- **Status:** fixed
- **Subsystem:** chat / Stream adapters / VirtualizedMessageContainer
- **Bug class:** field-name / adapter shortlist mismatch
- **Symptom:** Lovable Phase 1–4 UI looked correct in isolation, but live Stream chat never grouped bubbles (always showSenderInfo), mosaics never formed (one image max / separate messages), voice notes rendered as filename text or nothing, and "Delivered" ticks never appeared.
- **Root cause:** (1) `buildStreamMessageViewModels` collapsed Stream `attachments` to first `mediaType`/`mediaUrl` only. (2) Grouping read `sender_id`/`user_id` while Stream VMs expose `sender.id`. (3) `shareMultipleFiles` posted one message per image. (4) Voice notes uploaded as plain `file` without mime/duration/waveform. (5) `MessageBubble` only mounted `ReadReceipts` when `readStatuses.length > 0`, making Delivered unreachable.
- **Smallest safe fix:** Map full attachments (incl. audio metadata) in the Stream VM; resolve sender via `sender.id`; batch multi-image sends; `shareVoiceNote` with typed audio attachment; mount receipts for all sent own messages; skip single-media path when attachments exist.
- **Required tests:** streamMessageViewModel mosaic/audio/document mapping; VirtualizedMessageContainer grouping on `sender.id`; ReadReceipts Delivered vs gold; streamMessagePayload voice metadata preserve.
- **Fixed in:** `streamMessageViewModel.ts`, `VirtualizedMessageContainer.tsx`, `useShareAsset.ts`, `MessageBubble.tsx`, `ChatInput.tsx`, `streamMessagePayload.ts` (July 2026)

## Concierge Trip Search modal: no dismiss + frozen input
- **Status:** fixed
- **Subsystem:** Concierge / Trip Search (`ConciergeSearchModal`) + Chat search (`ChatSearchOverlay`)
- **Bug class:** Radix Dialog focus trap + missing dismiss control + pointerdown-open race
- **Symptom:** Trip Search opens from Concierge header Search with no X/Close; search field renders but rejects keystrokes on mobile (iOS WKWebView / Capacitor).
- **Root Cause:** (1) `DialogContent showClose={false}` and the in-field X only cleared query text. (2) HTML `autoFocus` inside Radix Dialog is unreliable on iOS WKWebView when the field sits under trip-shell scroll/overflow ancestors. (3) Opening on touch `pointerdown` can land the completing `click` on the newly mounted backdrop and fight focus.
- **Smallest Safe Fix:** Shared `BodyPortalOverlayShell` + `getTrustedOverlayOpenHandlers` / `useBodyPortalOverlayControls` — body portal at `z-[100]`, always-visible Close, ref focus, open-gesture backdrop guard. Wire Concierge + Chat Search CTAs through the same trusted open helpers (Upload stays in-DOM file input — no overlay race).
- **Required Tests:** ConciergeSearchModal + ChatSearchOverlay backdrop guard; `bodyPortalOverlay` unit tests; MessageTypeBar + AIConciergeChat touch pointerdown open.
- **Fixed in:** `BodyPortalOverlayShell.tsx`, `bodyPortalOverlay.ts`, `ConciergeSearchModal.tsx`, `ChatSearchOverlay.tsx`, `MessageTypeBar.tsx`, `AIConciergeChat.tsx` (July 2026)
### Vitest suite hangs with no failing tests (ChatSearchOverlay)
- **Symptom:** `npm run test:run` never exits; last activity may be unrelated files; workers at high CPU.
- **Root cause:** Component default prop `demoMessages = []` + `useEffect(..., [demoMessages])` + `setMessages([])` on empty query → infinite re-render.
- **Fix:** Module-level `EMPTY_DEMO_MESSAGES`; `setMessages(prev => prev.length === 0 ? prev : [])`; optional `scrollIntoView?.()` for jsdom.
- **Evidence:** 2026-07-13 release-gate unblock; mountStability regression test.


## Mobile calendar empty-day flex expansion
- **Status:** fixed
- **Subsystem:** mobile calendar (`MobileGroupCalendar`)
- **Bug class:** layout / flex growth
- **Symptom:** Day and Month views both looked like a giant month grid; Day event listings were squeezed or absent; calendar occupied majority of the phone screen even with no events.
- **Root cause:** Day-view mini calendar used `flex-1` when `eventsForSelectedDate.length === 0`, stretching cells to fill leftover height. Month view used `min-h-[80px]` day cells. View toggle was a buried "Month Grid"/"Day View" label with nearly identical layouts.
- **Smallest safe fix:** Segmented Day|Month tabs; Day = scrollable agenda + `shrink-0 max-h-[42%]` mini grid; Month = `max-h-[48%]` overview + selected-day agenda strip; never flex-grow the grid for empty days.
- **Required tests:** `MobileGroupCalendar.layout.test.tsx` asserts Day/Month distinct panels and max-height classes; demoEvents suite still green.
- **Fixed in:** `src/components/mobile/MobileGroupCalendar.tsx` (July 2026)

## Async haptic before setState breaks Vitest sync clicks
- **Status:** fixed
- **Subsystem:** mobile calendar view mode (`setViewMode`)
- **Bug class:** async handler / test timing
- **Symptom:** `fireEvent.click` on Day/Month tabs left `aria-selected` unchanged in Vitest.
- **Root cause:** `await hapticService.light()` before `setInternalViewMode` deferred the state update past the sync click act boundary.
- **Smallest safe fix:** Fire haptic with `void hapticService.light()` and set state synchronously.
- **Required tests:** layout suite Month tab click + Open Day view round-trip.
- **Fixed in:** `MobileGroupCalendar.tsx` (July 2026)

## Smart Import: Concierge browseWebsite SSRF bypass

**Symptom:** Concierge `browseWebsite` could fetch private/internal hosts while scrape-schedule was SSRF-gated.
**Risk:** HIGH — internal network probing via authenticated concierge tool path.
**Root Cause:** `functionExecutor.ts` only checked `http(s)://` prefix; scrape-* used `validateExternalUrlBeforeFetch`.
**How to Confirm:** Attempt browseWebsite against `https://127.0.0.1` or a public URL that redirects to a private IP; both should be rejected.
**Smallest Safe Fix:** Call `validateExternalUrlBeforeFetch` before `fetch` in browseWebsite (force HTTPS) and set `redirect: 'error'` so validated hosts cannot redirect to internal networks.
**Required Tests:** Edge/unit coverage that private hosts are blocked; keep scrape-schedule SSRF tests green.
**Regression Surfaces:** Concierge URL browsing, reservation lookup helpers that recurse into browseWebsite.
**Fixed in:** `supabase/functions/_shared/functionExecutor.ts` (2026-07-13 Smart Import hardening; redirect hardened in follow-up)

## Smart Import: trips.id is TEXT, not UUID

**Symptom:** Migration creating FK to `trips(id)` as UUID fails with incompatible types.
**Risk:** MEDIUM — blocks import_batches / any new trip-scoped table.
**Root Cause:** Core `trips.id` is `TEXT PRIMARY KEY` (legacy), while many newer tables default to UUID.
**How to Confirm:** `CREATE TABLE ... trip_id UUID REFERENCES trips(id)` errors with uuid/text mismatch.
**Smallest Safe Fix:** Use `trip_id TEXT NOT NULL REFERENCES public.trips(id)` for trip-scoped tables.
**Required Tests:** Migration apply on ChravelApp; schema drift types use `string`.
**Regression Surfaces:** Any new migration joining to trips/trip_events.
**Fixed in:** `supabase/migrations/20260713160000_calendar_import_batches.sql`

## MobileTripTabs `participants = []` default render loop (regression)
- **Status:** fixed (again)
- **Subsystem:** mobile trip shell (`MobileTripTabs`)
- **Bug class:** unstable default prop identity → effect setState loop
- **Symptom:** Vitest unit shards hang / OOM (`MobileTripTabs.navigation.test.tsx` allocates to heap limit); CI Unit Tests Shard times out at 20m; consumer tab switches can freeze.
- **Root cause:** Inline `participants = []` (and `tripData || {}`) mint new identities every render. The `localParticipants` sync effect depends on `participants` and calls `setLocalParticipants`, re-rendering forever. Previously fixed in `0dd88ee43` with `NO_PARTICIPANTS` / `NO_TRIP_DATA`, then lost on `main`.
- **Smallest safe fix:** Module-level stable defaults; return previous `visitedTabs` Set when unchanged; keep transition hang-detector tests.
- **Required tests:** `MobileTripTabs.transition.test.tsx` + navigation suite must finish in seconds, not OOM.
- **Fixed in:** `MobileTripTabs.tsx` (July 2026 restore)
