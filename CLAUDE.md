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
| AI (voice) | Vertex AI Live API | `gemini-live-2.5-flash-native-audio` |
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

## Google Maps Rules

- One map instance per page; props/context for mode changes.
- Always null-check `mapRef.current` before any operation.
- Debounce `drag` / `zoom` / `bounds_changed` at 300ms.
- Clean up all event listeners in `useEffect` return.
- Type coordinates as `{ lat: number; lng: number }`.

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

---

**"If it doesn't build, it doesn't ship."**
