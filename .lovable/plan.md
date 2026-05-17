## Root cause

`src/main.tsx` decides at boot which React tree to mount:

- **Anonymous visitors to `/`** → `<MarketingApp />` (lightweight: only `FullPageLanding` + `AuthModal`)
- **Everyone else** → `<App />` (full router, dashboard, all routes)

The decision happens **once at module load** via `isAnonymousRootRoute()`, which checks `localStorage` for Supabase auth markers (`sb-`, `supabase.auth.token`, etc.).

When you sign in from the marketing page:
1. `AuthModal` calls `supabase.auth.signInWithPassword(...)` — succeeds silently.
2. `AuthProvider` updates `user` in context → `AuthModal` closes (its `useEffect` on `user`).
3. **But the running React tree is still `<MarketingApp>`**, which has no route for the dashboard. It just keeps rendering `FullPageLanding`.
4. `HeaderAuthButton` (inside `StickyLandingNav`) sees the new `user` and flips its CTA to the "Account" avatar — which is exactly what you saw in your screenshot. That's why it *looks* like you're logged in on the marketing page: you *are*, but the shell can't render the dashboard.

A full page reload would fix it because on the next boot, `isAnonymousRootRoute()` sees the Supabase auth marker in localStorage and mounts `<App />`. There is currently no code that triggers that reload (and no in-place swap from MarketingApp to App).

## Fix

In `src/MarketingApp.tsx`, after auth state becomes authenticated, hard-navigate so `main.tsx` boots the full `<App />` shell.

```text
src/MarketingApp.tsx
├── inside <AuthProvider>, add a small <PostAuthBoot/> child component:
│     - useAuth() → if user && !isLoading, window.location.assign('/')
│       (full reload, not navigate(), so main.tsx re-runs isAnonymousRootRoute)
└── render <PostAuthBoot /> alongside FullPageLanding + AuthModal
```

Why `window.location.assign('/')` and not `navigate('/')`:
- React Router navigation stays inside the already-mounted MarketingApp tree → still no dashboard.
- A real navigation re-runs `main.tsx`, which now detects the auth marker and mounts `<App />`.

## Why not change `main.tsx` instead

`main.tsx` already does the right check at boot. Adding reactive swap logic there would require restructuring (it currently calls `createRoot(...).render(...)` exactly once). The smaller, safer fix is at the `MarketingApp` boundary, which is the only place this can go wrong.

## Out of scope

- Refactoring the marketing-vs-app split itself.
- Changing `AuthModal` close behavior.
- Touching `Index.tsx` (the logic there is correct; it just never gets a chance to render in this scenario).

## Verification

1. Sign out, hard-reload `/` → marketing landing renders.
2. Click "Log In" → enter credentials → submit.
3. Expected: brief blank/spinner, then the dashboard (`<App />` boot) renders at `/`.
4. Sign out from dashboard → back to marketing landing.
5. Refresh `/auth` directly while logged out → AuthPage works as before (unaffected by this change — that path doesn't go through MarketingApp).

## Files touched

- `src/MarketingApp.tsx` (add `<PostAuthBoot />`, ~10 lines)

Regression risk: **LOW**. Single conditional `window.location.assign('/')` gated on authenticated user inside a tree that otherwise has nothing to show them.