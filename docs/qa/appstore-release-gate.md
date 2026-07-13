# App Store Release Gate

`npm run qa:appstore-release` is the top-level pre-submission gate for the iOS/App Store web bundle. It runs the same checks App Store release reviewers care about in a fixed order, stops on the first failure, records per-step timing, and prints a final pass/fail summary.

## Command

```bash
npm run qa:appstore-release
```

The gate runs these steps in order:

1. `npm run validate-env`
2. `npm run qa:guardrails`
3. `npm run permissions:drift`
4. `npm run iap:parity`
5. `npm run iap:validate`
6. `npm run lint:check`
7. `npm run typecheck`
8. `npm run test:run`
9. `npm run build`
10. `npm run qa:mobile-perf-budget`
11. `npm run qa:chat-production-readiness`
12. `npm run test:e2e:smoke`
13. App Store release-gate Playwright coverage for auth, trip creation, invite/join, payments, concierge, events, pro trips, and media.

## Required environment variables

Set these before running the full gate locally or in CI:

| Variable | Required for | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | env validation, build, browser tests | Must be `https://<project>.supabase.co`. |
| `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY` | env validation, app runtime, browser tests | Publishable key is preferred; anon key remains supported. |
| `VITE_GOOGLE_MAPS_API_KEY` | env validation, build/runtime map surfaces | Use a real Maps/Places key for release. |
| `SUPABASE_URL` | authenticated Playwright fixtures | Can match `VITE_SUPABASE_URL` (gate mirrors automatically). |
| `SUPABASE_ANON_KEY` | authenticated Playwright fixtures | Can match `VITE_SUPABASE_ANON_KEY` (gate mirrors automatically). |
| `SUPABASE_SERVICE_ROLE_KEY` | auth/trip CRUD Playwright fixtures | When absent, the gate runs demo/UI smoke coverage for auth/trips instead of fixture-backed suites, and prints a warning. Final App Store submission CI must provide this key. Never expose it to the browser or commit it. |
| `PLAYWRIGHT_TEST_BASE_URL` | optional browser target override | Defaults to `http://localhost:8080`. Use this for a deployed preview. |
| `PLAYWRIGHT_SKIP_WEBSERVER` | optional browser target override | Set when testing an already-running app. |
| `PLAYWRIGHT_SKIP_BUILD` | optional Playwright speed-up | Lets Playwright reuse a built app when safe. |
| `CHRAVEL_APPSTORE_RELEASE_GATE=1` | Concierge device smoke fail-closed | Propagates `CHRAVEL_E2E_RELEASE_GATE=1`. |
| `CHRAVEL_APPSTORE_INCLUDE_SCREENSHOTS=1` | optional screenshots step | Adds `screenshots:appstore:all` to the gate. |
| `CHRAVEL_APPSTORE_STEP_TIMEOUT_MS` | optional | Defaults to 15 minutes per step. |

Optional runtime integrations such as `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_VAPID_PUBLIC_KEY`, Sentry, PostHog, GA, and Mixpanel are validated by `validate-env` when present. Stub only for non-release dry runs; App Store submission candidates should use production/staging values matching the submitted build.

## Expected known failures / operator notes

- Without `SUPABASE_SERVICE_ROLE_KEY`, authenticated suites (`full-auth`, `trip-crud`) are replaced by demo/UI smokes (`auth-smoke`, `trip-creation` template). The gate still passes those steps but warns that final submission CI must run the service-role suites.
- `npm run test:run` can emit Vitest fork-pool teardown warnings after all assertions pass; the suite is configured to exit 0 when there are zero failed tests.
- Browser installation is an environment prerequisite for Playwright. If the local runner lacks browsers, install with `npx playwright install chromium` (and `install-deps` when needed) before rerunning the gate.
- Physical TestFlight, Apple Sign in with Apple native bridge, IAP/RevenueCat restore, APNs/Firebase push, and production dashboard verification remain external to this repo gate.

## Adding a new release-gate Playwright surface

Add the spec under the canonical feature directory (for example `e2e/specs/payments/`) and update `scripts/qa/appstore-release-gate.cjs` only if the path does not match an existing coverage bucket. Keep tests deterministic, cleanup after created Supabase rows, and avoid demo-mode mock data changes.
