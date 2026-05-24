---
name: codebase-atlas
description: Generate an interactive, evidence-grounded HTML architecture atlas for a codebase — a clickable "command center" mapping systems, important files, data flows, dependencies, dead/duplicate code, quality scores, and a refactor roadmap, written for both non-technical founders and engineers. Produces /codebase-atlas/{index.html,architecture-data.json,README.md}. Ships with a Chravel context addendum and instructions to swap it per repo. Triggers on "codebase atlas", "architecture atlas", "architecture dashboard", "architecture command center", "map the codebase", "codebase overview site", "technical diligence dashboard".
---

# Codebase Architecture Atlas

Analyze an entire repository and generate a **self-contained, interactive HTML dashboard** that explains the codebase clearly enough for a smart non-technical founder/operator, while staying technically useful for engineers. The artifact is a clickable "architecture command center."

## How to use this skill (two layers)

1. **Universal prompt** (this skill body) — the portable analysis + artifact spec. Works on any repo.
2. **Repo context addendum** — tells the agent what the app *is supposed to do*, who it serves, and the business lens to judge against. Without it you get a generic map; with it you get operator-grade technical diligence. A Chravel addendum is baked in below; for another repo, replace it using the template at the end.

When invoked: read the addendum, harvest existing evidence, run analysis, then write the three output files. **Prefer a useful complete artifact over a perfect unfinished one.**

## Output contract

Create a `/codebase-atlas/` folder at repo root containing:
- `index.html` — self-contained; **opens via `file://` with no backend**. Embed the data inline (`<script id="atlas-data" type="application/json">…</script>`) and keep all JS inline in the HTML so it works offline and stays outside the host repo's lint/type toolchain. Vanilla HTML/CSS/JS only; **no heavy dependencies**.
- `curated.json` — **the judgment layer you author**: scores, narratives, risks, roadmap, glossary, plus `dependencies.godFileNotes` (path→why). This is the file the skill rewrites on a refresh.
- `architecture-data.json` — **generated**: `curated.json` merged with freshly computed metrics. Same object embedded in the HTML. Do not hand-edit.
- `README.md` — how to open, what each section means, how the data was gathered, confidence caveats, how to regenerate.

Optional: `assets/`, `diagrams/` only if genuinely needed.

### Two-layer refresh (keep the atlas alive)
Split the data so it can stay current without re-running AI on every change:
- **Computed layer (deterministic, cheap):** file counts, largest files, knip dead-code counts, bundle sizes, `any`/TODO counts, commit + timestamp. A script (`scripts/build-atlas.mjs`, runnable via `npm run atlas`) recomputes these, merges them over `curated.json`, writes `architecture-data.json`, and re-injects the inline data block in `index.html`. Wire it to run on merge (see `.github/workflows/atlas.yml`).
- **Curated layer (judgment):** everything requiring analysis lives in `curated.json`. Refresh it by re-running this skill, then run `npm run atlas` to fold it in. The merge-time job never overwrites it.

When refreshing for Chravel: **edit `curated.json`, not `architecture-data.json`** (the latter is regenerated). Then `npm run atlas`.

## Dashboard sections (all 13)

1. **Executive Overview** — plain English: what the app does, who it serves, primary flows, major systems, highest-leverage code, top-5 risks, top-5 cleanup ops, top-5 missing pieces. Include the 7 health scores below, each with a written justification.
2. **System Map** — clickable domains (auth, routing, layout, dashboard, features, AI, chat, notifications, payments, DB/data access, API, edge functions, state, integrations, mobile/PWA/native, admin, shared UI, utils, tests, config/build). Per domain: purpose, key files, deps, upstream/downstream, risk level, quality rating, next actions.
3. **Intelligent File Explorer** — files/folders with badges (Core, Feature, Shared, Utility, Config, API, Database, Auth, UI, State, Test, Legacy, Suspected Dead, Duplicate, Risky, Needs Docs, Needs Tests, Well Designed). Each item: path, plain purpose, technical purpose, exports, imports, imported-by, risk, confidence, recommended action.
4. **Dependency Graph** — readable graph or table: who depends on whom, cycles, highly-coupled "god files," widely-reused components, duplicated utilities, isolated/unused files. Static table is the primary, offline-safe rendering; Mermaid via CDN only as optional enhancement with a fallback.
5. **Feature Map** — per feature: plain description, screens/components, backend/data deps, state/hooks, external services, completeness estimate, missing states (loading/error/empty/offline/permission-denied/unauthenticated/mobile), risks, fixes.
6. **Data Flow Map** — trace major flows (signup/login, create/edit primary object, message, upload, notification, AI action, settings, gated feature): entry point, components, hooks/state, API/functions, tables/buckets, external services, failure points, missing validation/handling, security risks.
7. **Backend / API / Database Review** — routes, server actions, edge functions, migrations, schema, auth rules/RLS, buckets, third-party wiring. Per element: purpose, inputs/outputs, auth assumptions, permission model, error handling, observability, security risks, frontend↔contract match.
8. **External Integrations Map** — every third-party service: where configured, where used, required env var **names only (never values)**, failure modes, missing secrets/docs, hardening steps.
9. **Redundancy / Dead-Code / Stale-Code Audit** — unused/duplicate components, hooks, utilities; superseded implementations; dead routes; unused files/deps/CSS; commented-out blocks; stale flags; conflicting feature versions; misleading names. Per item: path, evidence, confidence (High/Med/Low), deletion risk, action (keep/delete/merge/rename/refactor/document/investigate). **Analysis only — never delete code.**
10. **Quality Review** — grade each major module 0–100. For anything <90: what's weak, why it matters, what raises it to 90+, urgency (urgent/important/cosmetic). Format: Module · Score · Status (Excellent/Good/Fragile/Risky/Broken/Unknown) · Why · Evidence · Fix.
11. **Missing Pieces** — tests, error boundaries, loading/empty states, mobile/a11y, security rules, rate limiting, observability, analytics, logging, docs, CI/CD, rollback, validation, permission boundaries, admin tools, onboarding, offline/PWA, billing enforcement, seed data, setup docs. Prioritize by user impact, revenue impact, security risk, effort, confidence.
12. **Refactor Roadmap** — Phase 1 Safe Cleanup → Phase 2 Consolidation → Phase 3 Architecture Hardening → Phase 4 Product/Scale Readiness. Per item: description, files affected, risk level, complexity (S/M/L/XL), expected benefit, suggested validation.
13. **Founder-Friendly Glossary** — plain-English definitions of the terms found in this repo (hook, component, state, API, edge function, middleware, provider, context, store, migration, RLS, bucket, webhook, env var, dependency, circular dependency, dead code, refactor), each with why it matters to the business.

## Health scores (explain every number)

```
Overall Codebase Health: __ / 100
Architecture Clarity:     __ / 100
Maintainability:          __ / 100
Scalability:              __ / 100
Security/Posture:         __ / 100
Test Coverage Confidence: __ / 100
Dead Code Risk:           __ / 100   (higher = more dead-code risk)
```

## Color system

Green = healthy/well-designed · Yellow = needs attention · Orange = risky/complex · Red = broken/dead/high-risk · Blue = core infrastructure · Purple = AI/external integration · Gray = low confidence/unclear.

## Evidence standards & confidence model

Every important claim cites: file path · function/component/hook name · import/export relationship · config reference. **Reuse the repo's existing analysis before inventing findings** — knip/depcheck output, lint rules, audit docs, tech-debt reports, bundle baselines. Label confidence:
- **High** = directly verified in code.
- **Medium** = strongly implied by structure/imports.
- **Low** = possible issue needing manual verification.

## Analysis method

Inspect actual code, not just folder names: directory structure, `package.json`/lockfiles, README/docs, config, routing, root/app entry, components, hooks, stores, API/server files, migrations/schema, env examples, tests, deploy/CI, mobile/PWA/native wrappers, generated-code boundaries. Use static analysis (imports/exports, dependency graph, orphan files, repeated names, route mapping, API-call tracing, env-var references, SDK usage, duplicated logic, TODO/FIXME/HACK). You **may write temporary analysis scripts but must delete them**. Spawn parallel sub-agents for domain deep-dives to keep context lean.

## Constraints

- Do **not** modify application behavior or delete/rewrite production code.
- Do **not** expose secret values — variable names only.
- Do **not** invent certainty — use confidence labels.
- Do **not** rely on folder names alone; do **not** produce a generic report — tie every claim to repo evidence.
- Every technical finding includes a plain-English explanation.
- Treat dormant/experimental/future-facing code as **"Future/Unclear,"** not dead, unless evidence is strong.
- Keep the artifact lightweight and openable locally.

## Visual design

Sticky navigation · search/filter · expand/collapse · clickable cards · color-coded badges · risk heatmap · module scorecards · dependency table/graph · plain-English summaries · copyable file paths · responsive (desktop + tablet). Vibe: senior engineering command center — clean, premium, dense-but-readable, not childish. For Chravel, use the dark/gold tokens from the `chravel-design-language` skill (near-black surfaces, amber accent).

## Final deliverables (report back)

1. Path to `/codebase-atlas/index.html`. 2. Summary of what was created. 3. Top 10 highest-priority findings. 4. Top 10 safest cleanup opportunities. 5. Top 10 architecture/product risks. 6. Suggested next prompt to begin fixing the highest-priority issues.

---

## Chravel Context Addendum (this repo)

**Product:** Chravel — the AI-native OS for group travel, touring, and events (`CLAUDE.md`, `YC_APPLICATION_SHOWCASE.md`). Trip tiers are hard-coded `consumer | pro | event` (`src/types/privacy.ts`), each with distinct permissions and feature gating.

**Primary users:** consumer travel groups (friends/family); pro/touring & business coordinators; large-event organizers (conferences, weddings, festivals).

**Critical product flows (zero-tolerance regressions):**
`Auth → Trips → Chat → Payments → AI Concierge → Calendar → Permissions → Notifications` (`SYSTEM_MAP.md`). Guard against: Trip-Not-Found flash during auth hydration, auth desync, RLS leaks, demo-mode data contamination, chat message loss on WebSocket reconnect.

**Stack:** React 18 + Vite 5 (SWC), TS (strict OFF) · TanStack Query 5 + Zustand 5 · Tailwind 3 + shadcn/Radix · Supabase (Postgres, Auth, Realtime, Storage, ~96 edge functions, ~378 migrations, 756 RLS policies) · Stripe (web) + RevenueCat (iOS) — **never mixed** · Gemini text via `lovable-concierge` (38 tools / 18 query classes) + Vertex AI Live voice · Stream Chat (GetStream) · Google Maps + Google Calendar · Capacitor 8 (**NOT React Native**) · Sentry + PostHog · Vercel + Render. **No Python, no React Native, no GraphQL, no traditional server.**

**Architecture rules to judge against (`CLAUDE.md`):** domain code lives in `src/features/<name>/{components,hooks}/`, never in `src/components/`; Supabase only via `src/integrations/supabase/client.ts` (never in JSX); single `<MapView mode="…" />`; realtime channels cleaned up in `useEffect` return and **filtered by `trip_id`**; edge functions validate secrets via `requireSecrets()`; migrations timestamped + lint-clean.

**Judge through this lens:** revenue impact, user trust, mobile/PWA readiness, security/RLS posture, demo/investor readiness, speed to ship.

**Reference, don't duplicate** (cite these as evidence sources): `SYSTEM_MAP.md`, `AUDIT_INDEX.md` (+ the audit docs it indexes), `DEBUG_PATTERNS.md`, `LESSONS.md`, `TEST_GAPS.md`, `DEFERRAL_DISCIPLINE.md`, `tech_debt_report.md`, `BUNDLE_SIZE_BASELINE.md`, `knip_output.txt` (existing dead-code scan), and the deprecation rules encoded in `eslint.config.js` (e.g. `enhancedTripContextService` → `TripContextAggregator`; Stream chat surfaces banned from legacy `@/services/chatService`).

**Build gate:** `npm run lint && npm run typecheck && npm run build` must pass. The atlas lives outside `src/` so it does not enter the toolchain — keep it that way (JS inline in the HTML).

---

## Reusing this skill for another repo

Replace the Chravel addendum with:

```markdown
## Repo Context Addendum
This repository is for: [APP NAME]
Business purpose: [1–3 sentences: what it does, who it serves, why it matters]
Primary users: [type 1] · [type 2] · [type 3]
Most important product flows: [flow 1] · [flow 2] · [flow 3]
Known tech stack: Frontend / Backend / Auth / Payments / Messaging / AI / Hosting / Mobile-PWA-native
Extra scrutiny on: [concern 1] · [concern 2] · [concern 3]
Business priority lens: revenue impact · user trust · speed to ship · maintainability · security/privacy · mobile/PWA readiness · scalability · demo readiness
Note: do not treat experimental, future-facing, or intentionally dormant code as dead unless evidence strongly supports it — label it "Future/Unclear."
```
