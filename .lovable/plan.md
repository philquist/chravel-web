# Restore Chravel Recs for super admins

## Root cause

`useRecsAccess` gates the "Chravel Recs" option in the trip-type switcher on `useSuperAdmin().isSuperAdmin`. `useSuperAdmin` only checks the client-side `SUPER_ADMIN_EMAILS` array from `src/constants/admins.ts`, which is intentionally empty unless `VITE_SUPER_ADMIN_EMAILS` is set at build time (to avoid leaking founder emails in the JS bundle).

In production PWA/mobile that env var isn't set, so `isSuperAdmin` is always `false` → `canAccessRecs` is `false` → the "Select View" sheet only renders My Trips / Pro Trips / Events. This matches the screenshot.

The DB already has the canonical `public.is_super_admin()` SQL function backed by `public.super_admins`. We just aren't calling it from the client.

## Fix

Augment `useSuperAdmin` to also consult the server. Keep the env allowlist as a synchronous fast-path (so existing badge UI doesn't flicker), but OR it with an async Supabase RPC call to `is_super_admin()` for the current authenticated user. Cache the result via TanStack Query keyed on `user.id` so it runs once per session.

No DB changes, no new env vars, no client-side founder email leakage. Recs visibility for real super admins is restored on PWA, mobile web, and desktop.

### Files

1. **`src/hooks/useSuperAdmin.ts`** — add a `useQuery` that calls `supabase.rpc('is_super_admin')` when `user` is present; final `isSuperAdmin` = env-allowlist match `||` RPC result. Return shape stays `{ isSuperAdmin }` so all existing callers (`useRecsAccess`, badges, route guards) work unchanged.

2. **`src/hooks/__tests__/useRecsAccess.test.tsx`** — extend mocks if needed so the new RPC path is covered (server-side super admin → `canAccessRecs` true; non-admin → false; app-preview demo still true).

### Non-changes / preserved invariants

- `SUPER_ADMIN_EMAILS` stays empty by default — no PII added to the bundle.
- `checkIsSuperAdmin(email)` (sync, non-hook) keeps env-only semantics; callers of that helper are unaffected.
- Server-side RLS / `is_super_admin()` remains the source of truth for actual privilege; this change only fixes a *UI visibility* gap.
- No change to `useRecsAccess`, `InternalAdminRoute`, the switcher, or Index.tsx.

### Verification

- Sign in as a super-admin account on PWA → open "Select View" sheet → "Chravel Recs" appears as a 4th option; selecting it routes to the Recs page.
- Sign in as a normal user → only 3 options render (unchanged).
- `app-preview` demo mode still surfaces Recs (unchanged via `useRecsAccess`'s `isAppPreview` branch).
- `npm run typecheck` and existing `useRecsAccess` tests pass.
