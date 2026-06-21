## Why "Blog" and "Use Cases" appear to do nothing

- **Blog** in `StickyLandingNav.tsx` (line 150) is a real `<Link to="/blog">` and the route exists (`App.tsx:608`). It does navigate — but the destination page reuses the same dark landing chrome, and the visual change is subtle (the FAQ section above the footer in your screenshot is the landing page's FAQ, not blog content). My read: it's navigating, but possibly to an empty/near-empty blog index that looks like "nothing happened." I'll confirm by clicking it in the running preview once we're building, and fix the destination if it's broken.
- **Use Cases** is *not* a link at all — it's only one of the small dots in the section-dot row (`sections` array, line 16). Clicking it just smooth-scrolls to the in-page Use Cases section on the home page. From the `/use-cases` route or from anywhere else it does nothing useful, which matches your report.

## Desired desktop header layout

```
[ChravelApp]   Blog  For Teams        • • • • • • • •        Home  Use Cases   [Log In]
```

- **Left of dots:** Blog, For Teams (persistent `<Link>`s — already correct)
- **Right of dots:** Home, Use Cases (persistent `<Link>`s — new)
- Remove the current "active section name" text block on the right (lines 187–189) since "Home" now lives there as a real link.
- Keep the section dots unchanged in the middle.

## Changes

**`src/components/landing/StickyLandingNav.tsx`**
1. Replace the active-section-label `<div>` (lines 187–189) with a right-side link group:
   - `<Link to="/">Home</Link>`
   - `<Link to="/use-cases">Use Cases</Link>`
   - Same styling as the existing Blog / For Teams links for visual parity.
2. Remove `'use-cases'` from the `sections` dots array (it's now a top-level page link, no longer a scroll target dot — avoids duplicate affordance). The in-page Use Cases section keeps its `id="section-use-cases"` so deep links still work; we just stop showing a dot for it.
3. No changes to scroll/IntersectionObserver logic.

**`src/components/landing/MobileLandingNav.tsx`** — already lists Use Cases, Blog, For Teams in the sheet. Add **Home** (`to="/"`) at the top so mobile matches desktop parity. No layout changes.

## Out of scope
- No changes to `/blog` or `/use-cases` page content. If clicking Blog after the fix still feels "empty," I'll raise it as a follow-up with a screenshot of what's actually rendering.
- No design-token, color, or spacing changes.

## Verification
- `npm run lint && npm run typecheck && npm run build`
- Manual: at desktop (≥1024px) on `/`, scroll past hero → confirm nav row reads `Blog · For Teams · [dots] · Home · Use Cases · Log In`. Click Home (stays on `/`, scrolls to top), click Use Cases (navigates to `/use-cases`), click Blog (navigates to `/blog`), click For Teams (navigates to `/teams`).
- Mobile: open hamburger → confirm Home, Use Cases, Blog, For Teams all present and route correctly.