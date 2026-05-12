# Marketing Page: Speed Fix + Brand Consistency Pass

Two related issues, one PR. Brand fixes are tiny; speed fixes are where the work is.

---

## Part A — Brand consistency (quick wins)

Confirmed in the code:

| Where | File | Currently | Should be |
|---|---|---|---|
| Sticky nav (top-left) | `src/components/landing/StickyLandingNav.tsx:113` | `Chravel` in `from-primary via-accent to-primary` (mustard) | `ChravelApp` in true premium gold gradient |
| Footer brand block | `src/components/landing/FooterSection.tsx:21` | `ChravelApp` in `from-primary via-accent to-primary` (mustard) | `ChravelApp` in true premium gold gradient |
| Footer copyright | `src/components/landing/FooterSection.tsx:115` | `© 2026 Chravel. All rights reserved.` | `© 2026 Chravel Inc. All rights reserved.` |
| Hero brand | `src/components/landing/sections/HeroSection.tsx:73` | `ChravelApp` already gold + blue gradient | Keep as-is (already uses gold per design memory) — or swap to pure gold for parity (your call) |

**Gold gradient source of truth** (from project memory `style/premium-gold-design-system`): `#533517 → #c49746 → #feeaa5`.

Implementation:
1. Add a single shared utility class in `src/index.css`:
   ```css
   .text-gradient-gold {
     background: linear-gradient(135deg, #533517 0%, #c49746 50%, #feeaa5 100%);
     -webkit-background-clip: text;
     -webkit-text-fill-color: transparent;
     background-clip: text;
   }
   ```
2. Replace the two `from-primary via-accent to-primary bg-clip-text text-transparent` gradients in nav + footer with `text-gradient-gold`.
3. Change nav label `Chravel` → `ChravelApp`.
4. Change footer copyright `Chravel` → `Chravel Inc.`.

Risk: trivial. Rollback: revert the file.

---

## Part B — Why the marketing page is slow (and the fix list)

The 5-second gold spinner you see is the cold-start chain before a single pixel of marketing content paints. Root causes I confirmed in the codebase:

### Diagnosis

1. **Massive image weight (18 MB raw in `src/assets/`)**
   - Hero image `demo-preview-hero.png` is **1.4 MB** and is **eagerly imported** in `HeroSection.tsx:3`. It blocks LCP.
   - `chravel-logo.png` is **482 KB** (a logo).
   - `public/chravel-pwa-icon.png` is **1.2 MB** and is your `<link rel="icon">` (favicon downloads on every page).
   - 6+ other 400–1.6 MB PNGs across the landing page (`create-trip-modal-correct.png` 1.6 MB, `ai-concierge-screenshot.png` 935 KB, etc.).

2. **Marketing split is gated off in production**
   - `src/main.tsx` only boots the lightweight `MarketingApp` when `VITE_MARKETING_SPLIT === '1'`. Otherwise it boots the **full** `App.tsx` (QueryClient + AuthProvider + ConsumerSubscription + Tooltip + 30 lazy routes' bootstrap), then `MarketingApp` lazy-loads `App` again. Most visitors are paying the full authed-app bootstrap cost on the marketing page.

3. **HTML caching is killed by meta tags**
   - `index.html` ships `Cache-Control: no-cache, no-store, must-revalidate` + `Pragma` + `Expires: 0`. Every visit re-downloads the HTML and re-fetches all module graph entries. Cache busting is already handled by Vite hashed filenames + `__BUILD_VERSION__`, so this meta block is pure cost.

4. **No preload/preconnect hints**
   - No `<link rel="preload">` for the hero image (the LCP element).
   - No `<link rel="preconnect">` to Supabase, Google Fonts, or Stripe origins listed in your CSP.
   - No `fetchpriority="high"` on the hero `<img>`.

5. **Bundle**
   - Main chunk **1,009 KB raw / 275 KB gzip** (per `BUNDLE_SIZE_BASELINE.md`). Acceptable for the authed app, oversized for landing.

6. **Scroll jank**
   - `StickyLandingNav` runs an unthrottled `handleScroll` that calls `getBoundingClientRect()` on every `[id^="section-"]` (~10 sections) every scroll event. That's a forced layout per frame.
   - Several landing sections render hero-sized PNGs decoded on the main thread.

### Plan (in order, biggest impact first)

**B1. Image diet — biggest single win**
- Convert every PNG in `src/assets/` and `src/assets/app-screenshots/` to **WebP** (max 1600 px wide, q≈75). Expected 80–90% smaller. Hero alone goes from 1.4 MB → ~120 KB.
- Replace `chravel-logo.png` (482 KB raster) with **SVG**.
- Regenerate favicon as a 32×32 + 192×192 + 512×512 set (drop the 1.2 MB favicon).
- Add `loading="lazy" decoding="async"` to every below-the-fold `<img>`. Hero stays eager with `fetchpriority="high"`.

**B2. Always-on marketing split**
- Drop the `VITE_MARKETING_SPLIT === '1'` gate in `src/main.tsx`. Anonymous visitors to `/` always boot `MarketingApp` (no AuthProvider, no Query, no Subscription provider). The full `App` lazy-loads only when the user clicks Sign Up or visits an authed route.

**B3. HTML + asset caching**
- Remove the `Cache-Control: no-cache,...` / `Pragma` / `Expires` meta tags from `index.html`. Hashed filenames already make caching safe.
- Add to `vercel.json`: `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`.

**B4. Resource hints in `index.html`**
- `<link rel="preconnect" href="https://<project>.supabase.co" crossorigin>`
- `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` (only if Google Fonts is actually used; otherwise self-host woff2)
- `<link rel="preload" as="image" href="/assets/images/demo-preview-hero-[hash].webp" fetchpriority="high">` — or move the hero into `/public` so the preload URL is stable.

**B5. Scroll perf in `StickyLandingNav`**
- Wrap `handleScroll` with `requestAnimationFrame` throttling (one read per frame).
- Replace the per-event `getBoundingClientRect()` loop with a single `IntersectionObserver` watching `[id^="section-"]` for active-section tracking.

**B6. Below-the-fold sections (already lazy)**
- Confirm none of `AiFeaturesSection`, `UseCasesSection`, `ReplacesSection`, `FAQSection`, `PricingLandingSection`, `FooterSection` are statically imported anywhere else (Suspense fallback should not flash on first paint of the hero).

**B7. Measurement**
- Before each commit: capture LCP / TBT / CLS via `browser--performance_profile` on `https://chravel.lovable.app/`. Confirm hero LCP < 2.5 s on desktop and < 4.0 s on Slow 4G.

### Expected impact

| Change | LCP win on cold load |
|---|---|
| Image diet (B1) | −1.5 to −3.0 s |
| Always-on marketing split (B2) | −300 to −600 ms |
| Cache headers (B3) | Repeat-visit LCP near 0 |
| Preconnect/preload (B4) | −150 to −400 ms |
| Scroll throttle + IO (B5) | Eliminates jank, no more dropped frames while scrolling |

Total realistic win on a cold visit: **5 s → ~1.5–2 s to first interactive marketing paint.**

---

## Out of scope for this PR
- Authed-app cold-start work (memoize `mockData`, lazy `jsPDF`/`html2canvas`, `prefetchQuery` on trip card hover). Captured for a follow-up PR.
- Service Worker caching strategy rewrite — can do after HTML caching is fixed.
- SSR/RSC (would require leaving Vite SPA — multi-week project).

---

## Suggested execution order
1. **Part A (brand)** — 5-minute change, ship immediately.
2. **B2 + B3 + B4** — small surgical edits to `main.tsx`, `index.html`, `vercel.json`.
3. **B1 (image diet)** — biggest win, biggest blast radius (touches every landing image import). Do as its own commit so it's easy to bisect if anything breaks.
4. **B5 (scroll perf)** — final polish.

Approve and I'll execute in that order.
