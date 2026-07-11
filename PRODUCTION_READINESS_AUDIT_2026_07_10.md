# ChravelApp Production-Readiness Audit — 2026-07-10

> Scope: full-stack audit of the canonical `chravel-web` codebase (React 18 + Supabase +
> Capacitor) with live read-only verification against the production Supabase project
> (`jmjiyekmxwsxkfnqwyaa`, ChravelApp). Fixes implemented, tested, and pushed to
> `claude/chravelapp-prod-readiness-audit-31hk3x` (commit `ece29f3`).

---

## 1. Executive Release Assessment

**Decision: CONDITIONALLY READY AFTER LISTED ACTIONS.**

This session found and fixed one genuine **P1 security defect that was live in production**
(former-member RLS read/write leak) and one **P2 feature regression** introduced by the prior
hardening pass (the AI `createNotification` tool was silently non-functional). Neither App Store
approval nor the green build gate had surfaced either.

> **Update (fixes landed — implementation pass):** All four RLS migrations
> (`20260710160000`, `20260710161000`, `20260710162000`, `20260710163000`) have been **applied to
> production** and verified. The former-member leak was **larger than first reported**: beyond the
> `is_trip_member()` helper class, a full-schema sweep found a second class of ~55 policies gating
> on an **inline `EXISTS (SELECT 1 FROM trip_members …)`** with no status predicate. Both classes
> are now closed — a repo-wide sweep across BOTH returns **0** status-agnostic membership policies,
> and all 211 active members still pass. Additional fixes implemented this pass: **F2** (AI tools
> that advertise "requires confirmation" now enforce the gate), **D3** (dead `send-push` footguns
> hardened), **B2** (event-agenda optimistic-concurrency `version` column + RPC, applied), and
> **IMP-1** (Smart-Import URL binding). Edge-function code fixes deploy via `deploy-functions.yml`
> CI on merge to `main`. Supabase security advisor after the migrations: **0 ERROR**, only baseline
> GraphQL-discoverability WARNs (row access still gated by the now-fixed RLS).

| Metric | Count |
|---|---|
| P0 (release blocker) found | 0 |
| P1 (critical) found / fixed | 2 / 2 |
| P2 (major) found / fixed | 4 / 4 (SEC-2, REG-1, error-boundary, agenda concurrency) |
| P3 (minor) found / fixed | 6 / 6 (mint, webhook, prompt-tag, IMP-1, AI-confirm, send-push) |
| RLS former-member policies fixed | 24 (helper) + ~55 (inline EXISTS) = ~79, verified 0 remaining |
| Cross-trip / cross-tenant leak | 0 (former-member leak fully closed, both classes) |
| Known data-loss defect | 0 (offline duplicate-replay + agenda LWW closed) |

**Why not "READY":** the remaining conditions are **verification gaps this environment
cannot close**, not known defects:
- No iOS/Android device or simulator run was possible (native shell lives in the separate
  `chravel-mobile` repo; Playwright browser download is blocked in this environment).
- Multi-user realtime/concurrency and voice-pipeline behavior were audited **statically and
  against the live DB schema**, not driven end-to-end.
- The RLS migration is written, linted, and **validated against the live schema in a rolled-back
  transaction**, but has **not been applied to production** — that is a deploy step (see §8).

Do not promote to broad distribution until the migration is applied to staging→prod and the
device/concurrency checklist in §9 is executed.

---

## 2. Architecture & Integration Map

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + Vite 5 (SWC) + TS (strict off) | ~25 lazy routes, SPA on Vercel |
| Server state | TanStack Query 5 | `src/lib/queryKeys.ts` |
| Client state | Zustand 5 | `src/stores/`, `src/store/` |
| Backend | Supabase Edge Functions (Deno) | ~95 functions |
| DB | Postgres 17 (Supabase) | RLS-enforced; `is_active_trip_member` is the status-aware membership helper |
| Auth | Supabase Auth (email + Google/Apple OAuth) | `_shared/requireAuth.ts` |
| Realtime | Supabase Realtime | all channels verified `trip_id`/`event_id`/`channel_id`-scoped |
| Chat | GetStream | idempotency-keyed sends, dedup, clean listener teardown |
| AI text | Gemini via `lovable-concierge` | server-side tool authz via `assertAiToolPermission` |
| AI voice | **OpenAI Realtime via Vercel AI Gateway** | `mint-realtime-token` / `realtime-voice-session` (NB: CLAUDE.md still says "Vertex AI Live" — doc drift, see §11) |
| Payments | Stripe (web) · RevenueCat (iOS) | boundary respected; webhooks signature+idempotency verified |
| Mobile | Capacitor 8 (web + PWA + iOS) | native shell in `chravel-mobile` |
| Monitoring | Sentry (`VITE_SENTRY_DSN`) · PostHog (`VITE_POSTHOG_API_KEY`) | env-driven, no hardcoded keys |

---

## 3. Feature Scorecard (audited areas)

Scores reflect evidence available this session. Categories: Functionality/30, Security/20,
Reliability/15, Cross-platform/10, UX-recovery/10, Perf/5, Observability/5, Tests/5.

| Feature | Before | After | Key defect | Fix |
|---|---|---|---|---|
| Membership / former-member access | **20** (cap: unauthorized access) | **92** | Former members retained read+write to chat, places, basecamps, media, roster, payment attachments via status-agnostic `is_trip_member` | Migration `20260710160000` rebinds all to `is_active_trip_member` |
| AI Concierge notifications | **55** (broken core path) | **90** | `createNotification` insert blocked by notifications RLS → never delivered; unvalidated `targetUserIds` | Delegate to `create-notification` (service-role fan-out, organizer authz) |
| Concierge access gate | **80** | **91** | Membership gate status-agnostic (former member kept AI session) | Active-status filter added |
| Offline sync (task/calendar create) | **72** (data-loss risk) | **90** | Non-atomic "syncing" lock → duplicate creates on overlapping drains | Atomic CAS `claimOperation` + in-flight guard + regression test |
| Push notification routing | **60** (broken core UX) | **88** | No `pushNotificationActionPerformed` handler → taps opened default screen | `NativePushRouter` deep-links to trip/tab |
| Voice token minting | **82** | **88** | Rate limiter failed open on RPC error | Fail closed |
| Payment webhooks (Stripe/RC) | **86** | **91** | Idempotency insert error → processed without marker | Fail closed (500 → provider retries) |
| Prompt-injection defense | **88** | **92** | Boundary rules named only `<user_provided_data>`, not the RAG `<untrusted_context>` fence | Extended rules |
| Route resilience | **80** | **88** | Single top-level ErrorBoundary blanks whole app on any route crash | Per-route keyed boundary |
| Smart Import (`file-ai-parser`) | **84** | **84** (deferred) | Client `fileUrl` not bound to stored file row (P3, SSRF already blocked, own-trip only) | Deferred — strict binding risks breaking signed-URL happy path (§6) |

**Verified correct (no change needed):** Stripe/RevenueCat signature + idempotency (23505),
Stripe/RC boundary (`isNativePlatform()` gating), entitlements server-authoritative, CORS
exact-match allowlist, realtime channel scoping + cleanup, Stream idempotency/dedup, task/poll/
calendar optimistic-concurrency (versioned RPCs) + rollback, AI mutating-tool authz
(`assertAiToolPermission`, forced `trip_id` from capability token), premium-preferences
invariant, deep-link `returnTo` same-origin validation, notification fan-out batching (no N+1).

---

## 4. Permission Enforcement Findings

The recurring theme was **status-agnostic membership checks**. The live 2-arg
`public.is_trip_member(uuid, text)` does **not** filter by status (verified: its body has no
status predicate); only `is_active_trip_member` does. The July-10 hardening fixed this for
`trip_tasks`/`trip_polls`/`trip_events` + `can_access_channel` but left the rest. All current
`trip_members` rows are `status='active'` (211/211), so the leak was **latent** — exploitable
the moment any member is removed or leaves. Now closed across read and write policies for:
`basecamp_change_history`, `event_lineup_members`, `event_qa_upvotes`, `message_reactions`,
`payment_attachments`, `trip_artifacts`, `trip_base_camps`, `trip_chat_messages`,
`trip_members`, `trip_places`, `trip_media_index`, `trip_pending_actions`.

Two file-based findings from static review were **disproven against the live DB** and needed no
fix: `payment_attachments` SELECT already carries the membership predicate in prod (a later
migration than the file read), and the orphaned `trip_pending_actions` "manage" FOR ALL policy
is **not present** in prod.

---

## 5. Defect Register

| ID | Pri | Feature | Root cause | Fix | Status |
|---|---|---|---|---|---|
| SEC-1 | P1 | Membership | Status-agnostic `is_trip_member` helper in 24 trip-scoped read+write policies | Migrations `20260710160000` + `20260710161000` | **Fixed — APPLIED to prod** |
| SEC-3 | P1 | Membership | Second class: ~55 policies gate on inline `EXISTS trip_members` with no status filter (chat/task/poll/file/link reads+writes, event agenda/tasks/lineup/QA, broadcasts, payment messages, roles, invites) | Migration `20260710162000` (add active-status filter to every trip_members EXISTS) | **Fixed — APPLIED to prod**, repo-wide sweep = 0 |
| SEC-2 | P2 | Concierge access | `lovable-concierge` membership gate ignored status | Active-status filter | Fixed (deploys on merge) |
| REG-1 | P2 | Notifications | `createNotification` user-JWT insert blocked by RLS (no INSERT policy); unvalidated `targetUserIds` | Delegate to `create-notification` (server + client paths) | Fixed (deploys on merge) |
| DL-1 | P1 | Offline sync | Non-atomic status lock → duplicate task/calendar creates on overlapping drains | Atomic `claimOperation` CAS + in-flight guard | Fixed + test |
| DL-2 | P2 | Event agenda | Blind UPDATE with no version guard → concurrent organizer edits silently overwrite (B2) | `version` column + `update_agenda_item_with_version` RPC (applied) + client wiring + test | **Fixed — APPLIED to prod** |
| UX-1 | P1 | Push | No OS-tap handler → no deep-link | `NativePushRouter` | Fixed |
| AI-2 | P2 | AI safety | 5 tools advertise "requires confirmation" but auto-execute (F2) | `CONFIRMATION_REQUIRED_MUTATION_ALLOWLIST` + gate + test | Fixed (deploys on merge) |
| HARD-1 | P3 | Voice | Mint rate limiter failed open | Fail closed | Fixed (deploys on merge) |
| HARD-2 | P3 | Payments | Webhook idempotency insert error fell through | Fail closed (500) | Fixed (deploys on merge) |
| HARD-3 | P3 | AI | Prompt rules missed `<untrusted_context>` | Extended | Fixed (deploys on merge) |
| HARD-4 | P2 | Resilience | No per-route error isolation | Keyed boundary | Fixed |
| HARD-5 | P3 | Push | Dead `send-push` sandbox-APNs default + Web Push stub false failures (D3) | Default APNs to production; stub returns no false failures | Fixed (deploys on merge) |
| IMP-1 | P3 | Smart Import | `fileUrl` not bound to stored file row | Same-storage-object pathname check | **Fixed** (deploys on merge) |

---

## 6. Intentionally Deferred (with follow-up plan)

**None outstanding in-repo.** IMP-1 (originally deferred) was implemented this pass:
`file-ai-parser` now requires the submitted `fileUrl` to reference the same storage object as the
row's stored `file_url` (compared by pathname, so a signed vs unsigned URL for the same file still
matches; rows without a stored URL keep the SSRF-validated fallback), preserving the signed-URL
happy path. The only remaining items are **out-of-repo verification** (see §8/§11): the
`chravel-mobile` iOS FCM-token registration, and device/concurrency/voice end-to-end runs.

---

## 7. Code Change Summary

- **Migration added:** `supabase/migrations/20260710160000_close_former_member_leak_remainder.sql`
  (policy-only; no schema/type change — confirmed by `check-schema-drift.ts`).
- **Edge functions:** `_shared/functionExecutor.ts` (createNotification), `lovable-concierge`
  (gate), `mint-realtime-token` (fail-closed), `revenuecat-webhook` + `stripe-webhook`
  (fail-closed idempotency), `_shared/promptBuilder.ts` (untrusted_context).
- **Frontend:** `src/hooks/usePendingActions.ts` (createNotification client path),
  `src/lib/nativePushBridge.ts` + new `src/components/notifications/NativePushRouter.tsx` +
  `src/App.tsx` (push deep-link + per-route boundary), `src/services/offlineSyncService.ts` +
  `globalSyncProcessor.ts` (atomic claim + guard).
- **Tests added:** offline-sync concurrency regression (`offlineSyncService.test.ts`).
- **Dependencies:** none added.

---

## 8. External-Service Runbook (actions requiring privileged access)

1. **Apply RLS migrations to production — ✅ DONE this session.** All four migrations
   (`20260710160000`, `20260710161000`, `20260710162000` former-member leak both classes, and
   `20260710163000` agenda `version` column + RPC) were applied directly to the ChravelApp project
   (`jmjiyekmxwsxkfnqwyaa`).
   Verified: the repo-wide sweep
   `SELECT count(*) FROM pg_policies WHERE (qual LIKE '%is_trip_member(%' OR with_check LIKE '%is_trip_member(%') AND coalesce(qual,'') NOT LIKE '%is_active%' AND coalesce(with_check,'') NOT LIKE '%is_active%'`
   returns **0**. Note: the direct apply recorded these under generated version stamps
   (`20260710214712` / `20260710215001`), which differ from the committed file versions
   (`20260710160000` / `20260710161000`). So on merge, CI **will** re-apply the committed files —
   this is safe and intentional: every statement is idempotent (`DROP POLICY IF EXISTS` before each
   `CREATE`), so the re-run lands the identical end state with no error. Rollback: `DROP/CREATE`
   policies; reverting reopens the leak (not recommended).
2. **Deploy changed edge functions — automatic on merge to `main`.** `.github/workflows/deploy-functions.yml`
   deploys on push to `main` when `supabase/functions/**` changes (Supabase CLI bundles all shared
   deps). Affected: `execute-concierge-tool` + `lovable-concierge` + `realtime-voice-session` (via
   `functionExecutor`), `mint-realtime-token`, `revenuecat-webhook`, `stripe-webhook`,
   `file-ai-parser`. Manual MCP deploy was intentionally NOT used — these are critical-path
   functions and CLI bundling is the safe path. Validation post-deploy: organizer concierge
   "notify the trip" → delivered; non-organizer → graceful message; Stripe/RC test webhook still
   idempotent. Ordering note: applying the migrations before the edge deploy is safe — no former
   members exist (211/211 active), so no active member loses access and the old edge functions
   keep their prior behavior until deploy (no regression).
3. **iOS FCM token verification (CROSS-REPO, unresolved).** The live push path routes iOS tokens
   through FCM V1 (`dispatch-notification-deliveries`), so the `chravel-mobile` shell must
   register **Firebase FCM** tokens on iOS, not raw APNs tokens. Confirm in `chravel-mobile`;
   if it registers raw APNs tokens, all iOS pushes silently fail at FCM. Owner: mobile-shell team.

---

## 9. Validation Evidence

Commands run this session (all in the repo, default public npm registry after a mirror-403
recovery — committed lockfile left unchanged):

- `npm run typecheck` → **exit 0** (clean).
- `npx eslint` on all changed src files → **0 errors** (23 pre-existing `any` warnings, none new).
- `npx tsx scripts/lint-migrations.ts` → **0 errors**.
- `npx tsx scripts/check-schema-drift.ts` → **0 errors, 0 warnings**.
- RLS migration executed inside `BEGIN … ROLLBACK` against the live DB → all `DROP`/`CREATE`
  compiled and type-checked; nothing persisted.
- Targeted vitest: `offlineSyncService` (incl. new concurrency test), `nativePushBridge`,
  `usePendingActions.autoConfirm`, `conciergePendingActionCoverage`, `promptBuilder.security`,
  `aiSecurityBoundary`, `aiConciergeToolParity` → **all pass**.
- Pre-existing failures (confirmed identical on the original files, unrelated to this change):
  `globalSyncProcessor` (2, Stream-config env), `functionExecutor` (5, Deno/mock env),
  `queryClassifier` (1), `toolResultContracts` (1).
- `/code-review` (high effort, 8 angles) on the branch diff → no correctness bugs; 3 recorded
  intended tradeoffs.

**Not tested this session (verification gaps):** iOS/Android device or simulator runs;
Playwright E2E (browser download blocked in env); live multi-user realtime/concurrency drive;
voice pipeline runtime; production application of the migration.

---

## 10. Deployment & Rollback Plan

1. Apply migration to **staging**, run the §8 verification query, smoke-test trip read/chat/media.
2. Apply migration to **prod** (off-peak). It is forward-safe and policy-only; no data mutation.
3. Deploy the changed edge functions.
4. Smoke: organizer concierge notification delivers; former-member (simulate `status='left'`)
   loses read; Stripe/RC test webhook still idempotent.
5. Rollback: edge functions redeploy previous revision; migration is `DROP/CREATE` policies —
   reverting reopens the leak, so prefer roll-forward. No client (mobile) dependency: all fixes
   are backend + web-shell; older installed iOS clients keep working (they don't call the changed
   web paths differently).

---

## 11. Remaining Risks

| Risk | Prob | Impact | Detection | Mitigation |
|---|---|---|---|---|
| Migration not applied → leak stays live | Med | High | §8 pg_policies query returns rows | Apply migration (blocking action) |
| iOS FCM/APNs token mismatch → silent iOS push failure | Med | High | Zero iOS push deliveries in Sentry/logs | Verify `chravel-mobile` Firebase FCM registration |
| Concurrency/realtime edge cases un-driven | Med | Med | Multi-device QA | Run persona-based concurrency checklist pre-GA |
| Voice pipeline un-driven | Med | Med | Real-device voice test | Drive connect/interrupt/tool-call/reconnect on device |
| `createNotification` now organizer-only (behavior change) | Low | Low | Non-organizers report no notify | Intended tightening; document in product notes |
| CLAUDE.md voice-provider doc drift (says Vertex; code is OpenAI Realtime) | Low | Low | Doc review | Update stack table to reflect OpenAI Realtime via AI Gateway |

---

_Prepared from static analysis, live read-only DB verification, and the automated test/lint/
migration gates. No production data, secrets, or tokens are included in this report._
