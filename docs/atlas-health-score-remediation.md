# Atlas Health Score Remediation Tasks

> Goal: move every Atlas health score to at least 90 with small, verified, regression-resistant slices. Do not mark a task complete until code, tests, and validation evidence are in the same PR.

## Score Targets

| Atlas score | Current | Target | Primary levers |
| --- | ---: | ---: | --- |
| Overall Codebase Health | 68 | 90+ | Complete the highest-risk architecture, test, security, bundle, and dead-code tasks below. |
| Architecture Clarity | 74 | 90+ | Move domain/demo logic out of generic surfaces; keep feature APIs stable. |
| Maintainability | 60 | 90+ | Decompose hotspots and remove production `any` debt in batches. |
| Scalability | 70 | 90+ | Defer heavy dependencies until user intent and add bundle gates. |
| Security / Posture | 78 | 90+ | Fail closed for privileged functions; encode auth/idempotency policy in tests. |
| Test Coverage Confidence | 55 | 90+ | Close `TEST_GAPS.md` high-risk paths with targeted tests. |
| Dead Code Risk (higher is worse) | 58 | <=10 | Classify knip output and delete only proven-unused code. |

## Tasks

### AHS-01 — Split Index route state from trip data selectors
- **Scores:** Architecture Clarity, Maintainability, Overall.
- **Files:** `src/pages/Index.tsx`, new `src/hooks/home/useHomeTripData.ts`, selector tests.
- **Definition of done:** `Index.tsx` only orchestrates routing/rendering; pure selectors cover consumer trips, pro trips, events, pending cards, stats, search list, archived/hidden filtering.
- **Verification:** selector tests for demo/authenticated/archived/pending-request inputs; `npm run typecheck`; relevant route smoke test.

### AHS-02 — Decompose `demoModeService` while preserving demo API
- **Scores:** Architecture Clarity, Maintainability.
- **Files:** `src/services/demoModeService.ts`, `src/mockData/demo*.ts`, `src/services/demo/*`.
- **Definition of done:** public `demoModeService` API stays stable; fixture data and session/media/archive state move to focused modules; no mock value churn without tests.
- **Verification:** facade tests for existing service methods; demo trip manual smoke.

### AHS-03 — Modularize `useTripTasks`
- **Scores:** Maintainability, Test Coverage Confidence.
- **Files:** `src/hooks/useTripTasks.ts`, `src/hooks/tasks/*`, `src/mockData/demoTripTasks.ts`.
- **Definition of done:** exported `useTripTasks` API remains compatible; form/filter/query/mutation/realtime/assignment responsibilities are isolated.
- **Verification:** tests for demo seeds, authenticated fetch, optimistic create/update/delete, assignments, permission denial, realtime invalidation.

### AHS-04 — Split AuthProvider internals
- **Scores:** Maintainability, Security / Posture.
- **Files:** `src/hooks/useAuth.tsx`, `src/hooks/auth/*`.
- **Definition of done:** `AuthProvider`, `useAuth`, and `useOptionalAuth` exports stay stable; session/profile/sign-out/demo/notification/cache responsibilities move to helpers.
- **Verification:** auth initialization, token refresh, demo fallback, profile upsert, sign-out cleanup, notification preference, and query-cache tests.

### AHS-05 — Restore `TripChat` type safety
- **Scores:** Maintainability, Security / Posture, Test Coverage Confidence.
- **Files:** `src/features/chat/components/TripChat.tsx`, `src/features/chat/adapters/*`, canonical chat types.
- **Definition of done:** remove file-level `no-explicit-any` disable; message/render shapes use typed adapters/unions.
- **Verification:** tests for legacy messages, Stream messages, replies, link previews, blocked-user filtering, reactions, pinned messages.

### AHS-06 — Extract Stream trip chat lifecycle/mutations
- **Scores:** Maintainability, Test Coverage Confidence.
- **Files:** `src/hooks/stream/useStreamTripChat.ts`, `src/hooks/stream/stream*.ts`.
- **Definition of done:** keep `useStreamTripChat` API stable; extract permissions, membership recovery, backfill, send, reactions, pins, pagination, channel lifecycle.
- **Verification:** unit tests for permission detection, membership error mapping, mention fallback, backfill merge, reaction policy errors, pin toggling, reconnect handling.

### AHS-07 — Defer Stream Chat client bundle until chat intent
- **Scores:** Scalability, Overall.
- **Files:** `src/hooks/stream/useStreamClient.ts`, `src/services/stream/streamClient.ts`, chat/broadcast call sites.
- **Definition of done:** landing/auth/profile/settings/non-chat tabs do not download `stream-chat`; chat surfaces still connect on demand.
- **Verification:** bundle analyzer diff; chat send/read smoke; non-chat route network waterfall check.

### AHS-08 — Lazy-load org-chart screenshot export
- **Scores:** Scalability.
- **Files:** `src/components/pro/TeamOrgChart.tsx`, optionally `vite.config.ts` chunk rules.
- **Definition of done:** `html2canvas` is imported only after Export click; print fallback remains.
- **Verification:** typecheck; export PNG manual check; pro role page load chunk diff.

### AHS-09 — Move Recharts behind chart-panel boundaries
- **Scores:** Scalability, Maintainability.
- **Files:** `src/pages/admin/SeoDashboard.tsx`, `src/pages/admin/SeoTrendChart.tsx`, `src/components/advertiser/CampaignAnalytics.tsx`, advertiser chart panel components.
- **Definition of done:** dashboard shells do not statically import Recharts; chart panels own Recharts imports behind a single lazy boundary.
- **Verification:** typecheck; dashboard/chart manual smoke; bundle diff.

### AHS-10 — Centralize Excel parsing and lazy-load import modals
- **Scores:** Scalability, Maintainability.
- **Files:** `src/utils/*ImportParsers.ts`, `src/features/smart-import/*`, import modal parent tabs.
- **Definition of done:** one helper owns `import('exceljs')`; parent tabs lazy-load import modals; large files do not block mobile until upload/import intent.
- **Verification:** parser tests; import modal manual smoke; bundle diff.

### AHS-11 — Close critical `TEST_GAPS.md` entries
- **Scores:** Test Coverage Confidence, Overall.
- **Files:** `TEST_GAPS.md`, chat tests, Supabase function tests.
- **Definition of done:** high-priority gaps are covered before being removed/updated in `TEST_GAPS.md`.
- **Verification:** targeted test suites pass; `TEST_GAPS.md` includes provenance for closed entries.

### AHS-12 — Make user-data exports complete-or-manifested
- **Scores:** Security / Posture, Test Coverage Confidence.
- **Files:** `supabase/functions/export-user-data/index.ts`, export tests.
- **Definition of done:** every table has a manifest status; mandatory table failures cannot return indistinguishable `success: true`.
- **Verification:** manifest tests for success, skipped optional table, mandatory failure.

### AHS-13 — Encode trip export role boundaries
- **Scores:** Security / Posture, Test Coverage Confidence.
- **Files:** `supabase/functions/export-trip/index.ts`, export policy tests.
- **Definition of done:** creator/admin/member/non-member policy is explicit for consumer/pro/event sensitive sections.
- **Verification:** role matrix tests pass.

### AHS-14 — Make file AI parsing idempotent
- **Scores:** Security / Posture, Test Coverage Confidence.
- **Files:** `supabase/functions/file-ai-parser/index.ts`, migration for idempotency key if needed, tests.
- **Definition of done:** duplicate `fileId`/`extractionType`/version requests return existing extraction and do not double-charge usage.
- **Verification:** duplicate request test; usage counter assertion.

### AHS-15 — Represent Gmail import partial failures explicitly
- **Scores:** Security / Posture, Test Coverage Confidence.
- **Files:** `supabase/functions/gmail-import-worker/index.ts`, worker tests.
- **Definition of done:** mixed results produce `completed_partial`; all-success remains `completed`; all-failed behavior is explicit.
- **Verification:** all-success, all-failed, and mixed partial tests.

### AHS-16 — Harden service-role seed functions
- **Scores:** Security / Posture.
- **Files:** `supabase/functions/seed-carlton-universe/index.ts`, `supabase/functions/seed-carlton-social/index.ts`, `supabase/config.toml`, tests.
- **Definition of done:** service-role clients are created only after verified admin/seed-admin authorization; function config entries are explicit.
- **Verification:** missing auth, invalid JWT, non-admin, authorized-admin tests.

### AHS-17 — Fail closed for privileged/billable edge-function secrets
- **Scores:** Security / Posture.
- **Files:** `supabase/functions/concierge-tts/index.ts`, `supabase/functions/gemini-tts/index.ts`, `supabase/functions/push-notifications/index.ts`, static guard tests.
- **Definition of done:** paid/free-for-all behavior is opt-in; service-role operations never downgrade to anon key.
- **Verification:** static guard or function tests for missing required secrets/config.

### AHS-18 — Shard large mock fixtures with compatibility exports
- **Scores:** Maintainability, Architecture Clarity, Dead Code Risk.
- **Files:** `src/mockData/polls.ts`, `src/data/eventsMockData.ts`, `src/data/tripsData.ts`, new fixture shards.
- **Definition of done:** compatibility imports still work; fixture arrays live in smaller domain/category files; no data churn without validation.
- **Verification:** fixture integrity tests for IDs, trip references, required fields.

### AHS-19 — Classify and reduce dead-code findings
- **Scores:** Dead Code Risk, Overall.
- **Files:** knip config/report, framework entry declarations, safe-deletion PRs.
- **Definition of done:** knip findings are classified as safe-delete/framework-entry/script-entry/public API/unknown; only proven-unused code is deleted; future additions are budgeted.
- **Verification:** knip report diff; typecheck; build; relevant smoke tests.
