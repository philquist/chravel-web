# Chravel Engineering Manifesto

> **Stack:** React 18 + TS · TanStack Query + Zustand · Tailwind + shadcn/ui · Supabase (Postgres + RLS + Auth + Realtime + Edge Functions) · Vercel · Capacitor (web + PWA + iOS)
> **Build gate:** `npm run lint && npm run typecheck && npm run build` must pass before every commit.

## Stack at a Glance

| Layer | Tech | Notes |
|---|---|---|
| Frontend | React 18 + Vite 5 (SWC) + TS (strict OFF) | `src/App.tsx`, ~25 lazy routes |
| Server state | TanStack Query 5 | `src/lib/queryKeys.ts` |
| Client state | Zustand 5 | `src/stores/`, `src/store/` |
| UI | Tailwind 3 + shadcn/ui (Radix) | `src/components/ui/` — don't duplicate primitives |
| Backend | Supabase Edge Functions (Deno) | ~95 functions in `supabase/functions/` |
| DB | Postgres via Supabase | 756 RLS policies; migrations in `supabase/migrations/` |
| Auth | Supabase Auth (email + Google OAuth) | `_shared/requireAuth.ts` on every edge function |
| AI (text) | Gemini via `lovable-concierge` | 38 tools, 18 query classes |
| AI (voice) | OpenAI Realtime via Vercel AI Gateway | `openai/gpt-realtime-2` (secret: `AI_GATEWAY_API_KEY`); mint-realtime-token / realtime-voice-session |
| Payments | Stripe (web) · RevenueCat (iOS) | Don't mix |
| iOS shell | Capacitor 8 — **NOT React Native** | Same web app |
| Hosting | Vercel (frontend) + Render (OG unfurl proxy) | |
| Errors / Analytics | Sentry · PostHog | |

**No Python. No React Native. No GraphQL. No traditional server.**

## Architecture (one paragraph)

User → Vercel SPA → Supabase JS client with user JWT (RLS filters at DB) for reads; ~95 Edge Functions for AI, webhooks, imports, notifications, and auth-gated mutations. iOS = Capacitor wrapper of the same web app over the same Supabase backend. The frontend never calls Supabase from JSX — always go through `/src/integrations/supabase/client.ts`.

---

## Global Principles

1. **Zero syntax errors** — mentally simulate `npm run build` before returning code.
2. **TypeScript** — strict OFF; explicitly type params and returns; no `any` without a comment explaining why. Prefer `unknown` for dynamic data.
3. **Feature-based architecture** — new domain code goes in `src/features/<name>/{components,hooks}/`. Never put domain logic in `src/components/`.
4. **Readability > cleverness** — explicit names, one function per responsibility, comments only where the *why* is non-obvious.
5. **No new libraries** without explicit request.
6. **No `console.log`** in committed code.

## Hard Constraints

- ❌ Don't weaken RLS, auth, or trust client-side `user_id` / `trip_id` / `role`.
- ❌ Don't call Supabase directly in JSX — always via `/src/integrations/supabase/client.ts`.
- ❌ Don't duplicate map components — single `<MapView mode="..." />`.
- ❌ No hardcoded secrets · no client-side super-admin checks · no privilege escalation via params or optimistic UI.
- ✅ Prefer incremental fixes over refactors.
- ✅ If ambiguous, ask ONE blocking question — don't guess.

## Security Gate (before every code output)

- **Auth state** must resolve before data fetch. **Trip existence ≠ trip access** — check membership too. All IDs validated (UUID format, non-null).
- **Loading ≠ Not Found ≠ Empty** — never conflate. No flashing error states during auth hydration.
- **Mobile-safe layouts** — no overflow regressions.
- **Supabase queries** must respect existing RLS.
- **Zero-tolerance regressions:** Trip Not Found · auth desync · RLS leaks · demo-mode data contamination.

## Bug-Fix Protocol

**Order is mandatory:** Reproduce → Diagnose → Fix → Prove → Report.

1. **Reproduce** with a failing test that fails for the *real* reason (unit for logic; integration for hooks/UI; e2e only if unavoidable).
2. **Diagnose** to root cause before touching production code. Identify the exact component/hook/service involved.
3. **Fix surgically** — smallest correct change at the layer where the bug belongs. No broad rewrites, no dead code.
4. **Prove** — reproduction test passes, nearby tests still pass.
5. **Report** — root cause · files · fix · tests · evidence · regression risk.

Never claim "fixed" without proof. Never skip reproduction. Never refactor as a substitute for diagnosis.

### Pre-push semantic review (mandatory)

typecheck/lint/tests catch *mechanical* errors (compile, format, broken assertions) — not *semantic* ones (right types, wrong behavior; reinvented utilities). Before the first `git push` of a session, run `/code-review` (or `/code-review --fix`) on the branch diff and address what it surfaces. This is the point where logic errors have historically escaped to post-merge cleanup. A `Stop` hook (`stop-test-gate.sh`) also runs vitest tests *related* to your changed `src/**` files before each turn ends, and a `PreToolUse` hook (`pre-push-review-reminder.sh`) reminds you at push time.

## Deferral Discipline

**If you see something, say something — then plan to do something.**

For every adjacent defect, fragile mapping, weak RLS, dead code, missing migration, missing test, or regression risk: either **fix in this branch** or **produce a paste-ready follow-up plan**.

**Banned phrases:** `out of scope` · `future cleanup PR` · `temporary duplication` · `known tech debt` · `could be addressed later` · `not addressed in this branch`.

**Critical-path override** — for auth, chat, media upload, record creation/editing, payments, invites, and mobile wrapper: reliability beats narrow scope. If the feature is still fragile after the fix, say so directly and propose the next fix in the same response.

**Mandatory response footer** for every coding task: (1) Fixed now · (2) Discovered · (3) Intentionally deferred · (4) Why deferral was necessary · (5) Paste-ready follow-up prompt for each · (6) Validation completed · (7) Remaining launch blockers.

Full rules, template, and carve-outs: `DEFERRAL_DISCIPLINE.md`.

## Agent Learning Protocol

- **Before non-trivial tasks:** read matching entries from `DEBUG_PATTERNS.md` / `LESSONS.md`; state which apply and how they change the plan.
- **After meaningful tasks:** extract up to 3 specific, reusable, evidence-backed tips. Vague or one-off entries get rejected.
- **Batch writes** — collect during the branch's work; commit in a single learning-update commit at the end. `.gitattributes` uses `merge=union` for memory files so independent entries from parallel branches auto-merge.
- **Quality bar:** specific + actionable + evidence-backed. No duplicates — refine existing entries instead of appending copies.
- **Bad:** "Be careful with async state." **Good:** "When trip data shows briefly then disappears, check whether auth hydration completes before the data fetch guard."

## Supabase Rules

1. Always handle `error` explicitly — never ignore.
2. Always via `/src/integrations/supabase/client.ts`.
3. Type results with generated `Database` types from Supabase CLI.
4. Optimistic updates with rollback for insert/update mutations.
5. Clean up realtime channels in the `useEffect` return — and filter by `trip_id` (unfiltered channels receive all global events).
6. **Migrations:** timestamped `YYYYMMDDHHMMSS_*.sql`; pass `npx tsx scripts/lint-migrations.ts`; `CREATE TABLE IF NOT EXISTS`; `CREATE OR REPLACE FUNCTION`; `DROP ... IF EXISTS`; destructive changes (drop/rename/type-change) require a two-phase migration with the forward-fix documented.
7. **Edge functions** must validate required secrets at startup via `requireSecrets()` from `_shared/validateSecrets.ts`.

## Feature Flag Rules

- Use `public.feature_flags` (table) for runtime kill switches — never redeploy to disable a feature.
- Frontend: `useFeatureFlag` from `@/lib/featureFlags` (`boolean`, 60s cache).
- Edge: `isFeatureEnabled` from `_shared/featureFlags.ts`.
- New user-facing features should seed a kill-switch flag in their migration. Kill switches take effect within 60s (client cache TTL).
- **Concierge premium preferences (invariant):** grounding the AI Concierge in a user's saved preferences (dietary/vibe/budget/accessibility/time) is **premium-only**, enforced server-side in `lovable-concierge` via `resolveUsagePlanForUser` → `isPaidUser` (and mirrored client-side by `useConciergeUsage().isFreeUser`). Preferences resolve **only** from the DB (`contextBuilder.resolveUserPreferences`, paid-gated) — never from client-supplied request-body preferences, which a free user could forge. Free/unauthenticated users get generic answers *by design* — do **not** "fix" this. Budget is injected as a dedicated **HARD BUDGET CONSTRAINT** prompt layer (`promptAssembler.budgetConstraintLayer`), not a soft filter. Kill switch: `concierge_premium_preferences` (seeded enabled).

## Google Maps Rules

- One map instance per page; props/context for mode changes.
- Always null-check `mapRef.current` before any operation.
- Debounce `drag` / `zoom` / `bounds_changed` at 300ms.
- Clean up all event listeners in `useEffect` return.
- Type coordinates as `{ lat: number; lng: number }`.

## Claude Code Automations

This repo already enforces several agent guardrails via `.claude/settings.json`
hooks and CI. **Don't re-add these** — they exist:

- **SessionStart:** `npm install` on remote/web sessions (`.claude/hooks/session-start.sh`) + memory primer — deps ready before typecheck/tests.
- **PostToolUse (every edit):** Prettier `--write` → ESLint `--fix` (`auto-lint.sh`) → `npm run typecheck` → command log. Formatting and types are checked on every edit. Full Vitest (~249 specs) runs at the pre-PR hook + CI, **not** per-edit — too slow to gate each save.
- **PreToolUse:** dangerous-command guard (`block-dangerous-commands.sh`), sensitive-file guard (`protect-sensitive-files.sh`), and a pre-PR test/typecheck gate (`pre-pr-tests.sh`).
- Husky `lint-staged` + CI (`auto-format.yml`, `secret-scan.yml`, CodeQL) back these up.

Rules layered on top:

1. **Credential files are off-limits — read AND write.** The secret guard blocks `.env*`, `*secret*`, lockfiles, `.git/`, hook scripts, and Supabase `config.toml`. Treat signing/key material the same and **never read or edit** it: `*.p8`, `*.p12`, `*.pem`, `*.key`, `*.jks`, `*-service-account*.json`, `*.mobileprovision`. (iOS release signing and Firebase admin keys use these formats and are not otherwise gitignored.)

2. **Coordinate cross-boundary contracts — change the paired artifact in the same diff.** CI fails if these drift:
   - DB schema (`supabase/migrations/`) → regenerate `src/integrations/supabase/types.ts` (`scripts/check-schema-drift.ts`).
   - Permission rules → `permissionMatrix.generated.ts` (`scripts/check-permission-matrix-drift.mjs`).
   - Stream chat config → parity check (`scripts/check-stream-config-parity.cjs`).
   - Edge-function env usage → `scripts/check-env-coverage.ts`.
   - New AI concierge tool → the 5-file sync anchored on `supabase/functions/_shared/concierge/toolRegistry.ts` (memory #23, #26).

3. **Security review is an *additive* gate, never authoritative.** For changes to auth, RLS, the CORS allowlist (`_shared/cors.ts`), edge functions, secret validation, or `superAdmins`, run the built-in `/security-review` and/or the `chravel-supabase-rls` skill before finishing. They supplement — they do not override — CLAUDE.md, AGENTS.md, and DEFERRAL_DISCIPLINE.md.

## Output Format (code responses)

```
Files Changed:
- src/features/<area>/<file>

Code: [full file or unambiguous diff — no pseudocode]

Invariants Preserved: [auth-gated access, RLS, etc.]
Regression Risk: LOW | MEDIUM | HIGH
Rollback: <1 sentence>
```

## Key Files

```
/src/integrations/supabase/client.ts  — Supabase singleton
/src/features/                        — feature modules (preferred home for new domain code)
/src/components/ui/                   — shadcn primitives (don't duplicate)
DEBUG_PATTERNS.md · LESSONS.md · TEST_GAPS.md · DEFERRAL_DISCIPLINE.md · agent_memory.jsonl
```

```bash
npm run dev       # local dev server
npm run lint      # eslint --fix
npm run typecheck # tsc --noEmit
npm run build     # runs lint + typecheck + production build
```

**When builds fail:** read the exact error → check bracket balance → `npm run typecheck` → fix → push → check Vercel logs.

For canonical ✅/❌ pattern examples (hooks, Supabase queries, Maps init, errors): load the `chravel-code-patterns` skill.

## Codebase Atlas

The atlas updates **only on demand** — there is no automatic refresh on merge. When the user references the **codebase atlas** ("codebase atlas", "architecture atlas", "refresh the atlas", "map the codebase") and asks to update it, **regenerate it with current data** — never just open the stale HTML:

1. Invoke the `codebase-atlas` skill to refresh the judgment layer (`codebase-atlas/curated.json`).
2. Run `npm run atlas` to recompute the metrics layer, merge it into `codebase-atlas/architecture-data.json`, and re-inject the inline `<script id="atlas-data">` block in `codebase-atlas/index.html`.
3. Report the path to `codebase-atlas/index.html` and a short summary of what changed.

The atlas lives outside `src/`, so it stays out of the lint/type/build toolchain — keep all JS inline in the HTML.

## Atlas Commit Rule

The atlas no longer auto-refreshes on merge, and a routine code change does **not** need
an atlas update. The generated outputs `codebase-atlas/index.html` and
`codebase-atlas/architecture-data.json` are tracked, but they are only refreshed when the
user **explicitly** asks to update the atlas — not as a side effect of normal feature work.
This is what keeps them from churning and conflicting on every branch.

Rules:
- `codebase-atlas/curated.json` is the hand-authored judgment layer; `index.html` and
  `architecture-data.json` are generated outputs. All are tracked.
- **Do not regenerate or commit the atlas as part of unrelated work.** If you run
  `npm run atlas` mid-task just to view output, restore the files before committing:
  `git restore codebase-atlas/index.html codebase-atlas/architecture-data.json` (and
  `architecture-data.json`'s sibling) so an incidental refresh doesn't ride along on an
  unrelated PR.
- When the user explicitly asks to "refresh the atlas" or "update the atlas": invoke the
  `codebase-atlas` skill to update `curated.json`, run `npm run atlas`, and commit the
  refreshed `curated.json`, `index.html`, and `architecture-data.json` together — ideally
  directly on `main` (or a dedicated atlas branch) so the regenerated outputs don't diverge
  across long-lived feature branches.
- To publish the refreshed atlas to GitHub Pages, manually trigger the **Atlas** workflow
  (`workflow_dispatch`) from the Actions tab — it regenerates and deploys without committing
  anything back.

---

**"If it doesn't build, it doesn't ship."**
