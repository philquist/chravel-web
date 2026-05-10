## Problem

`/auth` crashes with `ReferenceError: installedShell is not defined` from `src/components/AuthModal.tsx:421`. The JSX references `{installedShell && ...}` but the variable is never declared or imported in the component — it was lost (or never added) when the OAuth helper copy was introduced. This crashes the AuthModal render and bubbles to the error boundary, preventing login.

## Root cause

`AuthModal.tsx` imports nothing from `@/utils/platformDetection`. The intent of the gated paragraph at line 421 is to show an OAuth note only when running inside an installed app surface (PWA standalone / Capacitor / native WebView), which corresponds exactly to `isInstalledApp()` in `src/utils/platformDetection.ts`.

## Fix

Single-file edit in `src/components/AuthModal.tsx`:

1. Add import: `import { isInstalledApp } from '@/utils/platformDetection';`
2. Inside the component, compute once per render: `const installedShell = isInstalledApp();`
   - Synchronous, cheap, no hook needed (matches how `platformDetection` is used elsewhere).

No behavior change in browser tabs (the paragraph stays hidden as before). Inside PWA/native shells, the existing OAuth disclaimer renders as originally intended.

## Verification

- Reload `/auth?mode=signup` in the preview — modal renders, no error boundary.
- Confirm Sign In / Sign Up tabs and Google/Apple buttons appear.
- `npm run typecheck` passes.

## Risk

LOW — adds a defined value where an undefined identifier currently throws. No auth logic, RLS, or OAuth flow touched.

## Rollback

Revert the two-line change in `src/components/AuthModal.tsx`.