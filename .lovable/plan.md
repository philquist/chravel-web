## Root cause

1. **The preview is on `/index`, not `/`.** The previous override only handled `/`, `/home`, and `?marketing=1`, so `/index` still booted the full app shell instead of the marketing shell.
2. **The installed-app auth gate is too broad for preview/web.** The full app uses `isInstalledApp()` to decide whether to show the mobile/native auth modal. That heuristic can be triggered by PWA/embedded/mobile-preview contexts, so the preview gets treated like an installed app instead of a browser marketing page.
3. **The marketing shell has a second auth escape hatch.** Even when `main.tsx` forces marketing, `MarketingApp.tsx` still checks `isInstalledApp()` and can redirect to `/auth`, which bypasses the marketing homepage.
4. **The gold `CHRAVEL` splash/spinner is from boot fallbacks.** `index.html` contains a static gold wordmark + spinner, and `main.tsx` renders a matching Suspense fallback. That was a boot/performance fallback, but it is wrong for the marketing homepage and wrong for preview.
5. **The attached screenshot is the auth modal, not the marketing homepage.** That modal includes its own gold `ChravelApp` wordmark, which is why you also see gold branding inside the login surface.

## Fix plan

### 1. Make Lovable preview always land on the marketing homepage
- Treat these as marketing homepage routes in preview/browser context:
  - `/`
  - `/index`
  - `/home`
  - `?marketing=1`
- Update the bootstrap logic so `/index` does not fall through to the full app router.
- Keep native iOS/Android shells on their auth flow.

### 2. Narrow the mobile/native auth gate
- Add a focused platform helper for “native auth surface” instead of using broad `isInstalledApp()` everywhere for homepage routing.
- Only route directly to auth for:
  - Chravel native shell
  - Capacitor/native WebView
  - mobile standalone PWA on iOS/Android
- Do **not** route desktop browser or Lovable preview to the mobile auth modal.

### 3. Remove homepage splash wordmark and spinner
- Remove the static gold `Chravel` wordmark + spinner from `index.html` root fallback.
- Replace the React root Suspense fallback in `main.tsx` with a blank dark shell, not a logo and not a spinner.
- Replace marketing shell lazy-section spinners with non-branded blank fallbacks so the homepage does not flash a gold spinner.

### 4. Stop the marketing shell from escaping to auth in preview
- Update `MarketingApp.tsx` so forced marketing routes (`/`, `/index`, `/home`, `?marketing=1` in preview) bypass `InstalledShellEscape`.
- Prevent logged-in/stale-auth preview sessions from auto-bouncing out of the landing page.

### 5. Remove the unwanted gold auth modal wordmark
- Remove the gold `ChravelApp` logo line from `AuthModal` so the login surface starts with the actual heading (`Welcome Back`, `Create Account`, etc.).
- Leave auth functionality unchanged.

## Files to touch

- `index.html` — remove static splash wordmark/spinner markup and styles.
- `src/main.tsx` — route `/index` and preview homepage to marketing; remove branded Suspense fallback.
- `src/MarketingApp.tsx` — respect preview/marketing override before installed-auth escape.
- `src/pages/Index.tsx` — use the narrower native/mobile auth gate for unauthenticated users.
- `src/utils/platformDetection.ts` — add a narrowly named helper for native/mobile auth gate.
- `src/components/landing/FullPageLanding.tsx` — remove marketing spinners from lazy section fallbacks.
- `src/components/AuthModal.tsx` — remove the gold wordmark at the top of the auth modal.
- `src/lib/__tests__/bootstrapShell.test.ts` — add regression coverage for forced marketing routes, including `/index`.

## Verification

- Desktop preview `/index` shows the desktop marketing homepage immediately.
- Desktop preview `/` shows the desktop marketing homepage immediately.
- Desktop preview does **not** show:
  - gold `CHRAVEL` splash
  - spinner
  - auth modal
  - `/auth` redirect
- `/?marketing=1` still forces marketing.
- Native/mobile auth routes remain available for iOS/Android app contexts.
- The Remotion hero video remains embedded on the marketing homepage.

## Rollback

Revert these routing/fallback/auth-modal edits; the existing auth and app routes are otherwise unchanged.