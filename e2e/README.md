# Chravel E2E Test Suite

This directory contains end-to-end tests for Chravel. This file intentionally separates what is implemented today from roadmap coverage to prevent false confidence.

## ✅ Implemented suites (source of truth)

- `e2e/specs/auth/full-auth.spec.ts`
- `e2e/specs/trips/trip-crud.spec.ts`
- `e2e/specs/rls/trip-rls.spec.ts`
- `e2e/specs/smoke.spec.ts`
- `e2e/specs/events/event-recap-export.spec.ts`
- `e2e/auth.spec.ts` (legacy)
- `e2e/chat.spec.ts` (legacy)
- `e2e/invite-links.spec.ts` (legacy)
- `e2e/offline-resilience.spec.ts`
- `e2e/settings.spec.ts`
- `e2e/trip-creation.spec.ts`
- `e2e/trip-flow.spec.ts`
- `e2e/tests/pwa-smoke.spec.ts`

## 🗺️ Planned suites (not yet implemented)

The following directories are part of the intended target architecture, but are not fully populated yet and should be treated as planned:

- `e2e/specs/profile/`
- `e2e/specs/invites/`
- `e2e/specs/chat/`
- `e2e/specs/calendar/`
- `e2e/specs/tasks/`
- `e2e/specs/polls/`
- `e2e/specs/payments/`
- `e2e/specs/media/`
- `e2e/specs/export/`
- `e2e/specs/subscriptions/`
- `e2e/specs/pro/`
- `e2e/specs/organizations/`

## 🚀 Running tests

```bash
npm run test:e2e
npx playwright test e2e/specs/auth/full-auth.spec.ts
```

### Local-tolerant vs release-gate mode

E2E defaults to **local-tolerant** mode so developers can run browser smoke
coverage without staging auth secrets. In this mode, launch-critical
authenticated fixtures may call `test.skip(true, "[local-tolerant] ...")` only
when the skip is explicit and documented here: missing Supabase credentials,
email-confirmation-only auth projects, browser login setup failure, trip
creation failure, membership setup failure, or pro trip creation failure.

Release and App Store QA must use **release-gate** mode:

```bash
CHRAVEL_E2E_RELEASE_GATE=1 npm run test:e2e -- e2e/specs/chat/messaging.spec.ts
```

In release-gate mode, auth, trip creation, membership, browser login, and pro
trip creation fixture failures must throw a clear
`[E2E fixture step failed: <step>] ...` error instead of skipping. This prevents
CI/App Store QA from silently passing when launch-critical setup is broken.

### Required environment variables

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PLAYWRIGHT_TEST_BASE_URL=http://localhost:8080
```

## Governance rules

1. Tier-0 journeys are defined in `qa/journeys/tier0.json`.
2. Do not add new `test.skip` / `describe.skip` in critical suites without adding the file to `qa/journeys/skip-allowlist.json` and linking a follow-up issue.
3. Keep this README accurate: implemented suites only go in the Implemented section.

## Scheduled staging automation

A daily staging check is available via GitHub Actions workflow:

- `.github/workflows/scheduled-e2e-staging.yml`

This workflow runs Playwright against `E2E_STAGING_BASE_URL`, uploads traces/screenshots/reports as artifacts, and posts a Slack summary when `CI_SLACK_WEBHOOK_URL` is configured.

See `docs/ACTIVE/CURSOR_AUTOMATION_E2E_PROMPT.md` for a ready-to-use Cursor Automation prompt and secret checklist.

Manual trigger options:
- GitHub UI: **Actions → Scheduled E2E Staging → Run workflow**
- CLI: `gh workflow run scheduled-e2e-staging.yml --ref main`
