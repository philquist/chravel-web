# Chravel — TODO

## Web side — App Store resubmit (Apple/Google sign-in, Guideline 2.1(a))

- [x] Supabase client: `flowType: 'pkce'` (`src/integrations/supabase/client.ts`)
- [x] `/auth-callback` page calls `exchangeCodeForSession` and shows actionable errors — no silent bounce to `/auth` (`src/pages/AuthCallbackPage.tsx`)
- [x] Vitest coverage: PKCE success, provider error, empty landing (`src/pages/__tests__/AuthCallbackPage.test.tsx`)
- [x] Structured `[AuthCallback]` outcome log on every callback for device QA / Sentry forensics

### External (manual, not code) — must be done before resubmit

- [ ] **Supabase dashboard → Auth → URL Configuration → Redirect URLs:** add `chravel://auth-callback` alongside `https://chravel.app/auth-callback`. Without this, the custom-scheme redirect from chravel-mobile is rejected by Supabase and the native handoff fails before reaching this page.
- [ ] Physical iPhone (iOS 26+) verification:
  - [ ] Continue with Apple → Face ID → lands on home, not `/auth`
  - [ ] Continue with Google → same path, no `/auth` bounce
  - [ ] iOS billing screens never open a Stripe checkout (Guideline 3.1.1)
