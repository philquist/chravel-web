
# Premium App Store Screenshots — 16 assets

## Scope
8 features × 2 device sizes = **16 PNGs**.

| Feature | Headline | Subhead (small caps) | Route captured |
|---|---|---|---|
| Plan | PLAN | your next adventure | `/` (dashboard / trip list) |
| Chat | CHAT | with your group | trip → Chat tab |
| Organize | ORGANIZE | every detail | trip → Calendar/Itinerary |
| Ask | ASK | your AI travel guide | trip → Concierge |
| Split | SPLIT | expenses effortlessly | trip → Payments |
| Discover | DISCOVER | amazing places | trip → Places |
| Share — Trip Memories | SHARE | trip memories | trip → Media |
| Decide Together | DECIDE | together | trip → Polls |

Sizes:
- **6.9" iPhone:** 1290 × 2796
- **6.5" iPhone:** 1242 × 2688

## Approach

### 1. Capture real mobile UI (Playwright)
- Launch Chromium headless at exact iPhone viewport (`1290×2796`, dpr 3 emulated via CSS scale; second pass at `1242×2688`).
- Restore Supabase session from `LOVABLE_BROWSER_*` env so authenticated trip data renders.
- For each feature: `goto(localhost:8080/<route>)`, wait for network idle + key selector, take full-viewport screenshot.
- Fall back: if a route is unauthenticated/empty, enable demo mode via `localStorage.setItem('TRIPS_DEMO_VIEW','app-preview')` so real seeded data appears (not blank states).
- Save raw screens to `/tmp/appstore-raw/{size}/{feature}.png`.

### 2. Editorial overlay composition (Python + PIL)
Per asset:
- Solid black canvas (1290×2796 / 1242×2688).
- **Top band (~28% height):** generous negative space, centered.
  - Headline: **DM Serif Display**, white, ~180pt, tight kerning.
  - Thin **1px gold rule** (#c49746), 80px wide, centered, 32px below headline.
  - Subhead: **Fira Sans**, small caps, letter-spaced ~0.25em, gold (#c49746), ~38pt.
- **Device frame:** the raw screenshot inset into a rounded-corner black device shape (radius ~64px), centered horizontally, ~12% inset from bottom. Subtle gold inner stroke (1px, 20% opacity) + soft drop shadow (gold-tinted, low opacity) for depth.
- Background: pure #000 with a very subtle radial gold glow (~4% opacity) behind the device for premium depth.

Fonts: DM Serif Display + Fira Sans already in project font stack — download TTFs to `/tmp/fonts/` for PIL.

### 3. Output
- Write all 16 PNGs to `/mnt/documents/appstore-screenshots-v2/`:
  - `6.9-inch/01-plan.png` … `08-decide.png`
  - `6.5-inch/01-plan.png` … `08-decide.png`
- Bundle into `/mnt/documents/chravel-appstore-screenshots-v2.zip` for one-click download.
- Emit `<presentation-artifact>` tags for the zip + a contact sheet preview.

### 4. QA loop (mandatory)
- After generation, open each PNG, inspect for: clipped text, device frame overflow, missing UI in capture (blank/loading state), wrong route, low-contrast headline.
- Re-capture/recomposite any failures before delivery.

## Out of scope (this task)
- Updating the Apple/Android **app icon** (already shipped previously).
- Auto-uploading to App Store Connect (you'll drag the new files in manually or via Fastlane).
- iPad screenshots.

## Risk / rollback
- Pure additive: writes to `/mnt/documents/` only. No project source files modified. Zero regression risk.
