
## Goal
Turn the marketing site from "vibe-coded" into an editorial luxury feel — coherent black + metallic gold, no emojis, premium typography, sharp backgrounds, and smooth interactions.

## 1. Typography — premium, non-default
Current: Inter + DM Serif Display (default AI feel).
Switch to:
- **Headings:** `Canela` alternative → **PP Editorial New** (or fallback **Fraunces** with optical sizing 144, weight 300–500 — free, distinctive editorial serif with real luxury character).
- **Body:** **Söhne** alternative → **General Sans** (free, geometric-humanist, feels like Stripe/Linear/Airbnb Cereal without being generic).
- Load via `@fontsource-variable/fraunces` + `@fontsource-variable/general-sans` (self-hosted, no FOUT).
- Update `tailwind.config.ts` `fontFamily.serif`/`sans` tokens and `index.css` `@font-face` block. Retire DM Serif Display + Fira Sans + SF Pro references from the marketing surface.

## 2. Remove every emoji from marketing
- `PricingSection.tsx` lines 140/156/174 — strip 🎉 and 🎁 wrappers; render clean text.
- `UseCasesSection.tsx` "Built For" cards — replace 🏆/🎤/🏢/🎪 with thin-stroke lucide-react glyphs (`Trophy`, `Mic`, `Building2`, `Tent`) at ~24px, gold `#c49746`, 1.25px stroke. No colored emoji anywhere.
- Sweep `HeroSection`, `AiFeaturesSection`, `ReplacesGrid`, `ProblemSolutionSection`, `FAQSection`, `FooterSection` for any remaining unicode emoji and replace with lucide glyphs or delete.

## 3. Smooth "Built For" expand animation
- Refactor the Built-For cards to use `framer-motion` `<AnimatePresence>` + `motion.div` with `layout` and `height: auto` transition (spring, stiffness 260, damping 30). Chevron rotates 180° on open. Content fades + slides 8px. One card open at a time (accordion behavior).

## 4. Consistent org coverage
- Add/normalize copy so **fraternities, sororities, Greek life, alumni chapters** appear alongside Sports Teams / Touring Artists / Corporate / Event Organizers. Update the Built-For grid to include a "Greek Life & Chapters" card and align the marketing subtitle line ("Travel Concierges, Sports Teams, …") to include it consistently across Hero, UseCases summary, and Footer.

## 5. Coherent luxury backgrounds (kill the grainy geometric overlays)
Replace `GoldAccentOverlay` variants (waves/terraces/diamonds/circles/mesh/aurora) with a single **coherent system** used across all sections, varied only by intensity and focal position:

- **Base:** pure `#000` with a very subtle 2% linear vignette.
- **Metallic gold accent:** one large soft radial (blur 200px, opacity 8–14%) plus one thin (0.5px) engraved gold hairline that traces a slow curve per section — think Rolls-Royce brochure, not "AI gradient."
- **Depth texture:** replace the SVG turbulence noise with a **high-resolution grain PNG (1920×1920, ~1.5% opacity)** so it stays crisp at any zoom instead of blurring.
- Section variance = accent position (top-left, center-right, bottom, etc.) and hairline curvature only. Same palette, same texture, same feel throughout.

## 6. Generate real luxury background art
Use `premium` image model at 1920×1280 for 4 section hero backgrounds:
- Stadium tunnel at golden hour (already exists — keep, upscale check)
- Wedding aisle with candlelight
- Team bus interior at night with gold ambient
- **New:** editorial private terrace / boardroom for Corporate
Sharp, cinematic, low-key lit, gold rim light. No text, no logos, subtle enough that overlay copy reads AA contrast. Save as WebP + JPG fallback in `src/assets/marketing/`.

## 7. Verification
- `npm run typecheck && npm run lint && npm run build`
- Playwright at 1440 desktop + 390 mobile: screenshot Hero, Built-For (collapsed + expanded), Pricing, Use Cases. Visual check: no emoji, fonts loaded, hairlines crisp, expand animation smooth.

## Files touched (est.)
- `tailwind.config.ts`, `src/index.css`
- `src/components/landing/GoldAccentOverlay.tsx` (rewrite)
- `src/components/landing/FullPageLandingSection.tsx` (texture swap)
- `src/components/landing/sections/{UseCasesSection,HeroSection,AiFeaturesSection,ProblemSolutionSection,FAQSection}.tsx`
- `src/components/landing/FooterSection.tsx`
- `src/components/conversion/PricingSection.tsx`
- `src/components/landing/ReplacesGrid.tsx` (if any emoji)
- `src/assets/marketing/*` (new images)
- `package.json` (+ fontsource packages)

## Out of scope
App-internal (non-marketing) surfaces, billing logic, pricing values.

---
Regression Risk: LOW
Affected Paths: marketing landing only (no auth/RLS/payments/realtime)
Rollback Strategy: revert the commit — no schema or backend changes.
