# Fix preview routing to marketing + hero wordmark legibility

## Problem 1 — Preview lands on `/auth` instead of marketing home

`src/main.tsx` decides between `MarketingApp` and the full `App` via `shouldUseMarketingBootstrap`. It returns `false` (→ boot full App, which then sends you through the auth gate) whenever **any** of these is true:

- `isInstalledApp()` (PWA / Capacitor / native shell)
- `hasAuthMarkerOnBoot` — a Supabase auth marker is present in `localStorage` / `sessionStorage` / cookies from a prior session
- The path is not `/`

In the current preview your browser has a stale auth marker from earlier testing, so the marketing shell is skipped and the in-app router immediately bounces an unauthenticated/expired session to `/auth?returnTo=/`. That's why you can't see the new Remotion hero video.

### Fix
Add a query-string escape hatch so previews can force the marketing landing without manually clearing storage:

- In `src/lib/bootstrapShell.ts`, extend `MarketingBootstrapInput` with an optional `forceMarketing: boolean`. When `true` and `marketingSplitEnabled` is `true`, return `true` regardless of auth marker / installed shell / path.
- In `src/main.tsx`, read `?marketing=1` (and also accept path `/home` as an alias) from `window.location` and pass `forceMarketing` into `shouldUseMarketingBootstrap`. Also clear the cached redirect so `MarketingApp`'s `PostAuthBoot` doesn't immediately punt back to `/` if the marker is genuinely stale (guarded behind the same `forceMarketing` flag).
- Update `src/lib/__tests__/bootstrapShell.test.ts` with one new case asserting `forceMarketing: true` wins over `hasAuthMarker` / `isInstalledApp`.

Usage: open `<preview-url>/?marketing=1` to view the landing + hero video reliably. Zero impact on production users who don't pass the flag.

## Problem 2 — "ChravelApp" gold-gradient wordmark unreadable on gold hero background

In `src/components/landing/sections/HeroSection.tsx` the brand `<h2>` uses `text-gradient-gold`, which collides with the gold accent overlay behind the hero section. The H1 directly below it already uses solid white + a layered black text-shadow and reads cleanly.

### Fix
Match the H1 treatment so the wordmark pops off the gold background:

- Replace `text-gradient-gold` on the `ChravelApp` `<h2>` with `text-white` and add the same `textShadow: '0 2px 8px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)'` inline style already used by the H1 and the "Less Chaos, More Coordination" subhead.
- No other typography or spacing changes.

This keeps the gold accent system intact for buttons / overlays where it has real contrast, and gives the wordmark guaranteed legibility on any hero variant.

## Files touched

- `src/lib/bootstrapShell.ts` — add `forceMarketing` to input + branch
- `src/lib/__tests__/bootstrapShell.test.ts` — 1 new assertion
- `src/main.tsx` — read `?marketing=1` / `/home`, pass `forceMarketing`
- `src/components/landing/sections/HeroSection.tsx` — swap gradient class for white + shadow on the brand `<h2>`

## Verification

1. Open the preview at `/?marketing=1` → marketing landing renders and the 60s Tokyo Adventure hero video autoplays.
2. Open `/` with no query (and no stale auth marker) → marketing still renders as before.
3. Open `/` with a real signed-in session → still boots full App (no regression).
4. Hero wordmark "ChravelApp" is solid white with a soft black shadow, clearly legible over the gold accent overlay.
5. `npm run typecheck && npm run lint && npm run build` pass; new bootstrap test passes.

## Rollback

Revert the four files; no schema, no edge function, no dependency changes.
