## Goal
Transform the marketing surface from generic SaaS into a premium editorial feel — without rewriting any copy. Hierarchy comes from **typeface contrast (serif ↔ sans)**, **weight contrast (300 vs 700)**, and **tracking** — not from color tricks or rainbow gradients.

## Type system

**Install via `@fontsource`** (per workspace rules — no CDN, no `<link>` in index.html):
- `@fontsource/dm-serif-display` (400, 400-italic) → display
- `@fontsource/fira-sans` (300, 400, 500, 600, 700) → body + eyebrow

Wire in `src/main.tsx`, register in `tailwind.config.ts`:
```
fontFamily: {
  display: ['"DM Serif Display"', 'Georgia', 'serif'],
  sans:    ['"Fira Sans"', 'system-ui', 'sans-serif'],
}
```

Keep existing `font-sans` default = Fira Sans. App-shell (authenticated product) is untouched.

## Stylization recipe — "Pure weight contrast"

One rule per element type, applied consistently:

| Element | Treatment |
|---|---|
| Eyebrow / kicker | `font-sans` · `uppercase` · `tracking-[0.22em]` · `text-xs` · `font-medium` · muted gold (existing `--primary`) |
| H1 / hero | `font-display` · `font-normal` · `tracking-[-0.02em]` · `leading-[1.05]` · oversized (clamp 44→96px) |
| H2 / section | `font-display` · `font-normal` · `tracking-[-0.015em]` · clamp 32→64px |
| H3 / card title | `font-sans` · `font-semibold` (600) · `tracking-tight` |
| Lede / sub-headline | `font-sans` · `font-light` (300) · `text-lg/relaxed` · 80ch max |
| Body | `font-sans` · `font-normal` · `leading-relaxed` |
| Button / nav | `font-sans` · `font-medium` · `tracking-wide` |
| Stat number | `font-display` · oversized · `tabular-nums` |

**Weight contrast inside headlines:** the existing copy already has em-dashes and natural breaks. Where a headline has two clauses, set the lead-in in `font-light italic` (DM Serif's italic) and the payoff in regular roman — e.g. *"Built for group planning."* / "All your trip's important info." This adds rhythm without changing copy.

**No** gold word-highlights, **no** per-word color swaps, **no** rainbow gradients. Premium = restraint.

## Files to touch (full marketing surface)

Landing sections (`src/components/landing/sections/`):
- `HeroSection.tsx`
- `AiFeaturesSection.tsx`
- `UseCasesSection.tsx`
- `HowItWorksSection.tsx`
- `FaqSection.tsx`
- `FullPageLandingSection.tsx` (eyebrow + section-title wrapper if present)

Conversion blocks (`src/components/conversion/`):
- `PricingSection.tsx`
- `ReplacesGrid.tsx`
- any CTA blocks rendered on landing

Marketing pages:
- `src/pages/BlogIndex.tsx`, `src/pages/BlogPost.tsx`
- `src/pages/UseCasesHub.tsx`, `src/pages/UseCasePage.tsx`

Nav:
- `src/components/landing/StickyLandingNav.tsx`
- `src/components/landing/MobileLandingNav.tsx`
(font-family + tracking only; no layout changes)

Config:
- `src/main.tsx` — font imports
- `tailwind.config.ts` — `fontFamily.display` + `fontFamily.sans`
- `src/index.css` — optional `font-feature-settings: 'ss01','liga','kern'` on `body` for refined rendering

## Out of scope
- No copy edits (user explicit: keep all text as is)
- No layout, spacing, or section reordering
- No color/background changes — backgrounds stay the cinematic gold-black photography
- App-shell (post-login) untouched
- No new dependencies beyond the two `@fontsource` packages

## Verification
1. `npm run typecheck && npm run lint && npm run build` clean
2. Visual pass at 440px, 768px, 1280px on `/`, `/blog`, `/use-cases`
3. Confirm DM Serif Display loads (no FOUT flash to Georgia) — `font-display: swap` via @fontsource default is fine
4. Confirm authenticated app shell visually unchanged

## Risk
LOW. Additive font registration + className swaps. Rollback = revert the touched files; fonts auto-tree-shake if unused.