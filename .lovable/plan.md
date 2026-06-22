## Root cause

For anonymous visitors at `/`, `src/main.tsx` boots the lightweight `MarketingApp` instead of the full `App`. `MarketingApp` wraps the page in a `BrowserRouter` but does **not** declare any `<Routes>` — it always renders `<FullPageLanding>` unconditionally.

So when the user clicks the `<Link to="/blog">` or `<Link to="/use-cases">` in `StickyLandingNav` / `MobileLandingNav`, the URL updates but the rendered component stays on the landing page. The `/blog`, `/blog/:slug`, `/use-cases`, `/use-cases/:slug` routes only exist in `src/App.tsx`, which signed-out users never mount.

(Clicking them while signed in / on an installed shell works, because then `App` mounts and the routes resolve. That's why this isn't always visible.)

## Fix

Add a proper `<Routes>` block to `MarketingApp.tsx` so anonymous visitors can reach the public marketing pages.

### `src/MarketingApp.tsx`
- Import `Routes`, `Route`, `Navigate` from `react-router-dom`.
- Lazy-import `BlogIndex`, `BlogPost`, `UseCasesHub`, `UseCasePage` (mirroring how `App.tsx` does it, using `retryImport` if available).
- Replace the single `<FullPageLanding ... />` render with:
  ```
  <Routes>
    <Route path="/" element={<FullPageLanding onSignUp={...} />} />
    <Route path="/home" element={<FullPageLanding onSignUp={...} />} />
    <Route path="/index" element={<FullPageLanding onSignUp={...} />} />
    <Route path="/blog" element={<BlogIndex />} />
    <Route path="/blog/:slug" element={<BlogPost />} />
    <Route path="/use-cases" element={<UseCasesHub />} />
    <Route path="/use-cases/:slug" element={<UseCasePage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
  ```
- Keep the existing `<Suspense fallback={fallback}>`, `AuthProvider`, `PostAuthBoot`, and `AuthModal` exactly as-is.

### No other files need to change
- `StickyLandingNav.tsx` and `MobileLandingNav.tsx` already use the correct `<Link to="/blog">` / `<Link to="/use-cases">` — they just had nothing to render against.
- `App.tsx` route definitions stay unchanged (still used for signed-in / installed visitors).

## Verification

1. Signed-out, at `/` → click **Blog** in the top nav → `BlogIndex` renders, URL is `/blog`.
2. Click a post → `/blog/:slug` renders `BlogPost`.
3. Same flow for **Use Cases** → `UseCasesHub` and `/use-cases/:slug`.
4. Click **Home** (or logo) → returns to `FullPageLanding` at `/`.
5. Mobile nav (`MobileLandingNav`) Blog / Use Cases links work identically.
6. Signed-in user visiting `/blog` directly still works (served by `App.tsx` routes — unchanged).
7. `npm run typecheck && npm run build` pass.

## Risk

LOW. Purely additive — adds routes to a shell that previously rendered one component. No auth/RLS/data paths touched. Rollback = revert `MarketingApp.tsx`.
