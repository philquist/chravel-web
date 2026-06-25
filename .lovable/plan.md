
## Goal

Guarantee the Lovable/web half of the Apple/Google sign-in fix matches the contract chravel-mobile depends on, before App Store resubmit:

1. Supabase client uses **PKCE** (`flowType: 'pkce'`).
2. `/auth-callback` runs `exchangeCodeForSession` and **never** silently bounces to `/auth`.
3. The path is observable (logs) and protected by a unit test.

## Audit findings (current state)

Already correct — no behavioral change needed:

- `src/integrations/supabase/client.ts` sets `flowType: 'pkce'` with `detectSessionInUrl: true` and `persistSession: true`. ✅
- `src/App.tsx` registers `<Route path="/auth-callback">` lazily with `AuthCallbackPage`. ✅
- `src/hooks/useAuth.tsx` Apple + Google flows set `redirectTo: https://chravel.app/auth-callback?returnTo=…` for installed shells (Capacitor / PWA / ChravelNative). The native shell rewrites the universal link to `chravel://auth-callback` per Claude's note. ✅
- `AuthCallbackPage` already (a) calls `exchangeCodeForSession(window.location.href)` when `?code=` is present, (b) polls `getSession()` for ~3s as a hash-flow safety net, (c) on failure shows an actionable error screen with "Sign in with email" — it does **not** auto-redirect to `/auth`. ✅

## Gaps to harden

Three small, surgical issues that could still produce the App Review failure ("app back to login page after login with Apple"):

1. **Provider-side errors are missed.** Supabase OAuth failures arrive as `?error=…&error_description=…` (no `code`, no hash). The current `useEffect` skips the PKCE branch, polls `getSession()` for 3s, then shows the generic "We couldn't complete sign-in" message — burying the real reason (e.g. "Apple identity not linked", "user cancelled"). Handle `?error=` first and surface `error_description` verbatim.

2. **No-credential landings are indistinguishable from slow handoffs.** If the page is opened with neither `?code=`, `?error=`, nor `#access_token`, we still spin for 3s. Detect "nothing to exchange" up front and either (a) immediately succeed if a session already exists, or (b) error fast with a clear message — never spin.

3. **No telemetry.** App Review and our own device QA can't tell from the screen which branch executed (PKCE exchange vs. hash detect vs. error). Add a single structured log line per outcome — `[AuthCallback] outcome=…` with `flow`, `hasCode`, `hasHash`, `durationMs`, `error` — so Sentry/console traces on the physical iPhone test cleanly show what happened.

These are **additive**: the existing happy-path code stays. The error-handling branch gets stricter and louder.

## Changes

### A. `src/pages/AuthCallbackPage.tsx` (edit)

- Read `?error` / `?error_description` first; if present, set `status='error'` immediately with the provider message. No polling.
- Check existing session before polling: if `getSession()` already returns a session on entry, navigate immediately (covers native shell pre-injecting the session).
- If `!hasCode && !hasHash && !hasError`, error fast with: "No sign-in response detected. Please try again."
- Wrap each outcome in a single `console.info('[AuthCallback]', { flow, hasCode, hasHash, error, durationMs })` (dev + prod — this is intentional, low-volume, and critical for resubmit forensics).
- Keep the existing "Sign in with email" / "Back to home" buttons. Do **not** auto-redirect on error.

### B. `src/pages/__tests__/AuthCallbackPage.test.tsx` (new)

Vitest + React Testing Library. Mock `@/integrations/supabase/client` and `react-router-dom`'s `useNavigate`. Three cases — these are the resubmit-blocking ones:

1. **PKCE success**: URL has `?code=abc`. `exchangeCodeForSession` resolves, then `getSession()` returns a session → asserts `navigate('/', { replace: true })` is called, no error UI rendered.
2. **Provider error**: URL has `?error=access_denied&error_description=User%20cancelled`. Asserts error UI renders with "User cancelled" and `navigate` is **not** called with `/auth`.
3. **Empty landing**: URL has no `code`/`hash`/`error` and no existing session. Asserts error UI renders fast (no 3s wait) and `navigate` is not called with `/auth`.

### C. `TODO.md` resubmit checklist (append, do not rewrite)

Add a short "Web side — pre-resubmit" section so the chravel-mobile TODO and this repo agree on what's already done and what's still external:

- [x] Supabase client: `flowType: 'pkce'`
- [x] `/auth-callback` page calls `exchangeCodeForSession` and shows actionable errors (no silent bounce to `/auth`)
- [x] Vitest coverage for PKCE success, provider error, empty landing
- [ ] **External (manual, Supabase dashboard):** Auth → URL Configuration → add `chravel://auth-callback` to "Redirect URLs" alongside `https://chravel.app/auth-callback`. Without this, the custom-scheme redirect is rejected by Supabase and the native handoff fails before reaching this page.
- [ ] Physical iPhone (iOS 26+) verification: Continue with Apple → Face ID → home (not `/auth`), Google sign-in same path, no Stripe checkout opens from iOS billing.

If you'd rather keep this off `TODO.md`, I can drop it into `appstore/UPLOAD_GUIDE.md` instead.

## Out of scope (intentional)

- No change to `useAuth.tsx`, the Apple native bridge, or `redirectTo` URLs — those already match the chravel-mobile contract.
- No change to `flowType` or session storage.
- No Supabase dashboard automation — that config is captured as a manual checklist item only.

## Verification

- `npm run typecheck && npm run lint`
- `npx vitest run src/pages/__tests__/AuthCallbackPage.test.tsx`
- Manual on preview: visit `/auth-callback?error=access_denied&error_description=Test` → error UI with "Test", no redirect.
- Physical-device step stays in `TODO.md` for the resubmit run.

## Rollback

Single-commit revert. `AuthCallbackPage.tsx` is the only behavior change; the new test file and TODO entry are non-functional.
