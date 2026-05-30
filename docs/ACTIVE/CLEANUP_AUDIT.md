# Chravel Codebase Cleanup Audit

> Date: 2026-05-30 · Branch: `claude/jolly-ritchie-nyTE4`
> Method: 3 parallel reconnaissance agents (frontend surface · backend/Supabase · state/runtime/deps),
> followed by hand-verification of every deletion candidate (import-path + symbol + class-name greps).
> Build gate (`lint + typecheck + build`), migration lint, and affected tests all pass.

---

## 1. Executive Summary

The audit swept the full codebase for stubbed features, dead code, stale remnants, unused
components/hooks/utilities/routes/migrations/mocks/feature-flags, and misleading placeholder
logic, then classified each finding (buckets A–G) **before** changing anything.

**Headline: the codebase is substantially cleaner than a generic "code rot" audit assumes.**
Routes are all live and lazy-loaded; the thin "stub routers" (`TripDetail`/`ProTripDetail`/
`EventDetail`/`SettingsPage`) are intentional responsive-delegation patterns, not dead code; the
large `src/mockData/` + `src/data/` surface is **intentional demo mode** gated by `demoModeStore`
(demo-data contamination is a documented zero-tolerance regression — these are preserved, not
deleted); 95 edge functions (+ `_shared`) and 390 append-only migrations are intentional or
server-side-referenced.

**What changed in this branch (surgical, low-risk):**

1. **Deleted 10 provably-unused files** (8 dead modules + 1 abandoned experiment + its test) — each
   verified to have zero production references.
2. **Committed this report** and fixed misleading Admin UI copy (see below).

> **Correction (post-review).** An earlier revision of this PR seeded the
> `broadcast-scheduling-enabled` flag to `true`, claiming the Admin "Broadcasts" scheduling feature
> was "fully wired." That was wrong. A PR review (Cursor) correctly flagged — and code inspection
> confirmed — that the scheduled-broadcast **dispatcher was intentionally removed for MVP**:
> the `send-scheduled-broadcasts` edge function was deleted and its cron unscheduled
> (`20260411000000_disable_scheduled_broadcasts_cron.sql`), and `message-scheduler` targets the
> separate `scheduled_messages` table, not `broadcasts`. So enabling the flag would have produced a
> **misleading stub** — admins could "schedule" a broadcast and see a success toast, but it would
> never be delivered. The seed migration was therefore **dropped entirely** (the flag stays unseeded;
> client default `false` keeps the feature dark, exactly as it was before this PR). The only
> broadcast-related change that remains is making the Admin UI helper copy truthful in both flag
> states. Restoring real scheduled-broadcast delivery (dispatcher + cron + trigger fanout) is a
> separate, larger effort — see §6.4.

**What was intentionally preserved (not touched):** all demo/mock data, all edge functions
(incl. the intentionally-deprecated `create-default-channels` which returns HTTP 410), all historical
migrations, all storage buckets, and all routes/navigation.

**What needs a product/founder decision (report-only, see §6):** a logger strategy for 79 `console.log`
statements; mock-data schema-drift guardrails.

---

## 2. Feature-by-Feature Classification

Buckets: **A** Active/Working · **B** Active/Broken · **C** Stubbed-but-intentional (gated) ·
**D** Stubbed/Misleading · **E** Dead code · **F** Stale remnant · **G** Needs human decision.

| Area | Bucket | Findings | Action |
|---|---|---|---|
| Routing & navigation (29 routes, mobile bottom nav, settings menu) | A | All routes live, lazy-loaded; thin routers delegate to Mobile/Desktop variants; nav items all map to working handlers | Keep |
| Trips / Pro Trips / Events detail pages | A | Responsive delegation pattern (router → `Mobile*`/`*Desktop`), not duplication | Keep |
| Demo mode (`src/mockData/*` ×9, `src/data/*` ×9, `demoModeStore`, `seed-*` edge fns, `demo-concierge`) | C | Investor/app-preview demo surfaces, gated by `demoModeStore` / `demo_mode` flag | **Preserve** (zero-tolerance contamination risk) |
| Admin → Broadcasts scheduling | D | Dispatcher (`send-scheduled-broadcasts` + cron) removed for MVP; flag never seeded so feature is dark. Enabling it would surface a misleading stub (schedules accepted, never delivered) | Keep flag dark; **fixed misleading UI copy**; restore is a follow-up (§6.4) |
| Chravel Recs | C | Feature-gated via `useRecsAccess()`; hidden when ineligible | Keep |
| Advertiser settings panel | C | Gated to `isAppPreview` (demo-only) | Keep |
| Edge functions (95 + `_shared`) | A/C | 1 intentionally deprecated (`create-default-channels` → HTTP 410); rest are live or webhook/worker/cron-triggered | Keep |
| Migrations (390) | A | Append-only audit trail; lint-clean | Keep (never delete history) |
| Storage buckets (5: avatars, trip-covers, trip-files, trip-media, advertiser-assets) | A | All referenced | Keep |
| "Orphaned" tables (51 candidates) | A | Not referenced from `src/` but referenced by edge functions / workers (audit logs, queues, rate limits, entitlements) | Keep |
| Dead hooks/utils (8) + OpenAI-realtime experiment (1) | E | Zero production references (see §3) | **Deleted** |
| `console.log` (79 in 24 files) | F | Violates CLAUDE.md "no console.log"; no logger utility exists | **Deferred** (see §6) |
| Mock-data schema drift | G | Demo data could diverge from real API shapes over time | **Deferred** (see §6) |

---

## 3. Deleted Code (with evidence)

All 10 files removed via `git rm`. Each was verified unreferenced by symbol grep, path-import grep,
renamed-default-import grep, and (for classes) class-name grep across `src/`.

| File | Evidence |
|---|---|
| `src/hooks/useArtifactSearch.ts` | 0 references anywhere in `src/` |
| `src/hooks/useDebounce.ts` (`useDebounce` + `useDebouncedCallback`) | 0 references anywhere |
| `src/hooks/useMediaLimits.ts` | 0 references anywhere |
| `src/hooks/useOGMeta.ts` | only mentioned in `useShareTrip` comments (itself deleted) |
| `src/hooks/useShareTrip.ts` | 0 references anywhere |
| `src/hooks/usePlacesLinkSync.ts` | not imported by `PlacesSection.tsx`; only a **stale `vi.mock`** referenced it |
| `src/utils/securityUtils.ts` | `InputValidator` / `CSPHelper` / `SecureStorageHelper` — 0 references |
| `src/utils/tripLabels.ts` | `getTripLabels` used only inside a `describe.skip` (non-running) test |
| `src/lib/openaiRealtimeWebRtc.ts` | abandoned OpenAI-realtime experiment; referenced only by its own test. Live voice path is Gemini Live / LiveKit |
| `src/lib/__tests__/openaiRealtimeWebRtc.test.ts` | tests the deleted module |

**Paired test edits (same commit, so the suite stays green):**

- `src/components/__tests__/PlacesSection.header.test.tsx` — removed the stale
  `vi.mock('@/hooks/usePlacesLinkSync', …)` block (the component no longer uses the hook).
  → suite still passes (3/3).
- `src/pages/__tests__/ProTripDetail.test.tsx` — removed the `getTripLabels` import and the two
  label-dependent assertions inside the already-`describe.skip`'d suite; kept the title assertion.
  → suite still skips as before (5 skipped).

Post-deletion grep confirms **zero dangling references** to any removed symbol.

---

## 4. Stubbed / Mocked Inventory (preserved — bucket C)

These are **intentional** and were deliberately left in place. The risk is *not* that they're dead;
it's that they must stay strictly gated (demo-mode contamination is zero-tolerance per project memory).

| Surface | Gate |
|---|---|
| `src/mockData/*` (9 files: join requests, demo concierge messages, demo trip events/files, notifications, payments, polls) | `demoModeStore` / demo views |
| `src/data/*` (demo channels, cover fallbacks, events/pro-trip mock data, search data, trips data, + `pro-trips/` & `recommendations/` subdirs) | `demoModeStore` / demo views |
| `seed-demo-data`, `seed-carlton-social`, `seed-carlton-universe` edge functions | Admin/demo seeding only |
| `demo-concierge` edge function | Rate-limited unauthenticated demo (`DEMO_CONCIERGE_RPM/RPH`) |
| `create-default-channels` edge function | Intentionally deprecated; returns HTTP 410 as a migration signal |

No misleading user-facing stubs were found in production (non-demo) navigation surfaces.

---

## 5. Backend / Supabase Report

**No migration is added by this PR.** An earlier revision added one seeding
`broadcast-scheduling-enabled = true`; it was **removed** after review confirmed the dispatcher is
absent (see the Correction in §1 and the follow-up in §6.4). The flag stays unseeded, so the
client-side default `false` keeps the feature dark — identical to pre-PR behavior, and honest about
the missing delivery path.

No backend objects were changed. No tables, RLS policies, storage buckets, edge functions, or
historical migrations were created or deleted (all verified as referenced or append-only).

**Only non-deletion code change:** `src/pages/AdminDashboard.tsx` — the "Broadcasts" helper copy is
now conditional on `isBroadcastSchedulingEnabled` so it no longer hardcodes "temporarily unavailable"
regardless of state. **Rollback:** revert that one-line JSX change.

---

## 6. Deferred Items (report-only — need a decision or larger effort)

Per Deferral Discipline, each is captured with a paste-ready follow-up rather than vaguely deferred.

### 6.1 — `console.log` cleanup (79 statements, 24 files)
CLAUDE.md bans `console.log` in committed code, but **no logger utility exists**, and the calls are
concentrated in critical-path files (`chatService`, `JoinTrip`, `revenuecatClient`, `deepLinkParser`,
and 22 in `basecampService`). A blind delete risks removing the only error visibility in some catch
paths. **Out of scope for this branch by user decision.**

> Follow-up prompt: "Add `src/lib/logger.ts` (a thin wrapper that no-ops `debug/info` in production via
> `import.meta.env.DEV`, always forwards `warn/error` to console + Sentry). Replace the 79 `console.log`
> calls in `src/**` (non-test) with `logger.debug/info`, preserving any that are the sole error
> visibility in a catch block as `logger.error`. Keep it to a mechanical swap; run lint + typecheck + build."

### 6.2 — Mock-data schema drift (bucket G)
`src/mockData/*` and `src/data/*` are hand-authored and can silently diverge from real API/DB shapes,
producing demo-only render bugs. Not a cleanup item; a guardrail gap.

> Follow-up prompt: "Add type-level assertions (e.g. `satisfies`) tying each demo dataset in
> `src/mockData` / `src/data` to its real domain type so typecheck fails when the real shape changes."

### 6.3 — Pre-existing working-tree changes (NOT part of this audit)
Three edge-function files were already modified in the working tree before this audit began
(`supabase/functions/{get-trip-preview,health,image-proxy}/index.ts`). They are **whitespace/formatting
only** (Prettier reflow, no behavioral change). To keep the working tree clean they were committed
**separately** on this branch as `chore: prettier formatting for edge functions`, isolated from the
audit commit so they are not misattributed to this work.

### 6.4 — Restore scheduled-broadcast delivery (follow-up — larger effort)
The Admin "Broadcasts" scheduling UI exists and the `broadcasts` table accepts `scheduled_for` rows,
but the **delivery path was intentionally removed for MVP**: `send-scheduled-broadcasts` (edge fn) was
deleted, its cron unscheduled (`20260411000000_disable_scheduled_broadcasts_cron.sql`), and
`message-scheduler` writes to the separate `scheduled_messages` table. Until delivery is restored the
flag must stay dark (this PR drops the seed). Doc drift to fix alongside: `docs/SECURE_STORAGE_ACCESS.md`,
`docs/SECURITY.md`, and `docs/PRD.md` still reference the now-deleted `src/utils/securityUtils.ts`.

> Follow-up prompt: "Restore scheduled-broadcast delivery: re-add a `send-scheduled-broadcasts` worker
> (or a DB job) that, at `scheduled_for`, sets `broadcasts.is_sent = true` and triggers member fanout
> via the canonical `notify_on_broadcast` path; re-schedule its cron with the CronGuard secret; add a
> test proving a scheduled row is delivered exactly once. Then seed `broadcast-scheduling-enabled = true`.
> Separately, update `docs/SECURE_STORAGE_ACCESS.md` / `docs/SECURITY.md` / `docs/PRD.md` to drop
> references to the deleted `securityUtils.ts`."

---

## 7. Validation Report

| Check | Command | Result |
|---|---|---|
| Migration lint | `npx tsx scripts/lint-migrations.ts` | ✅ 0 issues / 390 migrations |
| Typecheck | `npm run typecheck` | ✅ clean |
| Lint | `npm run lint:check` | ✅ clean |
| Affected tests | `vitest run` (2 modified suites) | ✅ PlacesSection 3 passed · ProTripDetail 5 skipped |
| Production build | `npm run build` | ✅ built (4744 modules) + service worker generated |
| Dangling refs | grep deleted symbols across `src/` | ✅ none |

**Out of scope (and why):** full UI→backend tracing and broken-feature fixes for every feature area
were not performed — that is unbounded and conflicts with the "surgical, no broad refactor" constraint.
This report's classification (§2) stands in for it. The `console.log` sweep was deferred per user decision.

---

## 8. Rollback

- **Dead-code deletions:** revert the commit (all files restorable from git history).
- **Feature flag:** flip `enabled = false` (60s TTL, no redeploy) or `DELETE` the row (see §5).
