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
| `SUPABASE_URL` | authenticated Playwright fixtures | Can match `VITE_SUPABASE_URL`. |
| `SUPABASE_ANON_KEY` | authenticated Playwright fixtures | Can match `VITE_SUPABASE_ANON_KEY`. |
| `SUPABASE_SERVICE_ROLE_KEY` | auth/trip/RLS Playwright fixtures | Required only in trusted CI/local release environments; never expose it to the browser or commit it. |
| `PLAYWRIGHT_TEST_BASE_URL` | optional browser target override | Defaults to `http://localhost:8080`. Use this for a deployed preview. |
| `PLAYWRIGHT_SKIP_WEBSERVER` | optional browser target override | Set when testing an already-running app. |
| `PLAYWRIGHT_SKIP_BUILD` | optional Playwright speed-up | Lets Playwright reuse a built app when safe. |

Optional runtime integrations such as `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_VAPID_PUBLIC_KEY`, Sentry, PostHog, GA, and Mixpanel are validated by `validate-env` when present. Stub only for non-release dry runs; App Store submission candidates should use production/staging values matching the submitted build.

## Expected known failures / operator notes

- The gate intentionally fails if a required App Store release-gate Playwright coverage bucket has no matching spec path. As of this script, payments and media must have specs under `e2e/specs/payments` and `e2e/specs/media` before the full release gate can pass.
- Authenticated Playwright tests require Supabase test credentials. Missing `SUPABASE_SERVICE_ROLE_KEY` or a project that requires unhandled email confirmation can cause auth-oriented tests to fail or skip, depending on the fixture.
- `npm run test:run` has historically had a known unrelated failure in `src/hooks/__tests__/useLiveKitVoice.test.tsx` per the repo AGENTS instructions. Treat any occurrence as a release-blocking known failure until the test is fixed or the gate is deliberately updated with an approved quarantine policy.
- Browser installation is an environment prerequisite for Playwright. If the local runner lacks browsers, install with `npx playwright install --with-deps` before rerunning the gate.

## Adding a new release-gate Playwright surface

Add the spec under the canonical feature directory (for example `e2e/specs/payments/`) and update `scripts/qa/appstore-release-gate.cjs` only if the path does not match an existing coverage bucket. Keep tests deterministic, cleanup after created Supabase rows, and avoid demo-mode mock data changes.
