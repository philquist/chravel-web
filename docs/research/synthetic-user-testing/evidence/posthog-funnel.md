# PostHog Funnel Evidence — Audit Result

**Date:** 2026-06-09 · **Method:** Read-only queries against PostHog org "ChravelApp" via MCP.

## Headline finding: production analytics is dark

The ChravelApp PostHog organization contains exactly **one project** ("Default project", id 339009), and its
`ingested_event` flag is **`false`** — the project has **never received a single event**. Direct SQL
confirmation:

```sql
SELECT event, count() AS n, max(timestamp) AS last_seen FROM events GROUP BY event ORDER BY n DESC LIMIT 50
-- → 0 rows (all time)

SELECT event, count() AS n FROM events WHERE timestamp > now() - INTERVAL 90 DAY GROUP BY event
-- → 0 rows (last 90 days)
```

The event *definitions* visible in the project are PostHog's built-in taxonomy ($pageview, $screen,
$identify, Application opened, …) plus MCP-server telemetry — none are Chravel product events with data.

## Why: instrumented but not enabled

The codebase ships a complete, well-designed telemetry layer that is **silently disabled in production**:

- `src/telemetry/types.ts` defines a strongly-typed event map covering the **entire activation funnel**:
  `signup_started/completed/failed`, `login_*`, `onboarding_screen_viewed/completed/skipped`,
  `trip_create_started/created/failed`, `trip_join_started/joined/failed`, `message_sent`,
  `concierge_query_sent/response_received/error/tool_executed`, `poll_created/voted`, `task_created/completed`,
  `place_pinned`, `upgrade_prompt_shown/started/completed/failed`, `push_permission_*`,
  `share_extension_*`, demo-mode events, and performance events.
- `src/telemetry/service.ts:36-41,89-94` — the PostHog provider initializes **only when
  `VITE_POSTHOG_API_KEY` is set at build time**. Production builds evidently do not set it
  (zero events ever ingested).

## Consequence for this report

1. **Section 6 (Activation Funnel Diagnosis) cannot use real numbers.** Every funnel-step estimate in the
   report is a **hypothesis requiring validation**, not an observation. This is stated explicitly there.
2. **"Analytics is dark" is itself a top product finding.** The founder is making fix/kill/focus decisions
   with no signup count, no activation rate, no D7 retention, no upgrade-prompt conversion — which is also
   why TestFlight feedback feels like the only signal. The single highest-leverage research action available
   is a one-line env change (`VITE_POSTHOG_API_KEY` in the Vercel production environment) that activates an
   already-built, already-typed funnel.
3. Once enabled, the existing event map directly answers: signup→first-trip conversion,
   first-invite rate, collaborator-join rate, first-concierge-success rate, D1/D7 return, and
   upgrade-prompt → checkout conversion — i.e., every step of the funnel in this report's Section 6.

## What was checked

| Check | Result |
|---|---|
| Projects in org | 1 ("Default project", 339009) |
| Events ingested, all time | 0 |
| Events ingested, last 90 days | 0 |
| Product event definitions with data | none |
| Telemetry layer in code | complete (`src/telemetry/`), gated on `VITE_POSTHOG_API_KEY` |
| Manual `$pageview` capture | implemented (`telemetry.page()`), `capture_pageview: false` by design |
