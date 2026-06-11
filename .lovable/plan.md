# Hero Product Demo Video — Plan

## Audit findings

- **Remotion is already set up** at `/remotion/` (v4.0.447, musl compositor pinned, Tailwind plugin). Existing compositions live in `remotion/src/compositions/`: `TripCreationFlow`, `LiveSharedCalendar`, `AIConciergeAction`, `PaymentSplit`, `MediaVault`, `PollsAndTasks`, `TabNavigationHero`, `BeforeAfterChaos`, plus `ChravelLaunch` and `ProductLaunchV2`. Theme tokens in `remotion/src/theme.ts`. No need to install Remotion or recreate scene primitives.
- **Hero today**: `src/components/landing/sections/HeroSection.tsx` renders a single `<img src={demoPreviewHero}>` from `src/assets/demo-preview-hero.webp` inside a rounded/bordered frame. That's the exact slot to swap.
- **No `public/videos/` yet** and no `public/marketing/` folder — we'll create `public/videos/` for the rendered MP4 + poster.
- Routes that map to the storyboard already exist (`MobileTripDetail`, trip detail, chat/calendar/concierge/places/payments/media tabs), so future iterations can capture real screenshots, but for v1 we reuse the existing Remotion mock scenes (they already use real product styling).

## Scope (consumer-only, per your blunt note)

Skip Pro/Events/Recs/Enterprise in the hero loop. Stitch the existing consumer-flavored scenes into one 18–22s desktop hero and one 12–16s mobile vertical.

## Deliverables

1. **`remotion/src/compositions/HomepageHeroDemo.tsx`** — new 1920×1080, 30fps, ~600 frames composition that sequences existing scene components with `TransitionSeries` + `fade`/`slide`:
   - Scene 1 Dashboard (reuse `TripCreationFlow` end-state) — caption "Every group trip gets one private home."
   - Scene 2 Trip opens — "Plans, people, places, and payments — together."
   - Scene 3 Chat (new lightweight scene using theme tokens + realistic travel messages) — "No more plans buried in random group chats."
   - Scene 4 Calendar (reuse `LiveSharedCalendar`) — "Everyone sees the latest schedule."
   - Scene 5 Places/Basecamp (new minimal scene with pin card) — "Save addresses and reservations once."
   - Scene 6 Payments (reuse `PaymentSplit`) — "Know who paid, who owes."
   - Scene 7 AI Concierge (reuse `AIConciergeAction`, swap prompt to the Saturday summary example) — "AI that knows your trip."
   - Scene 8 End card — "Less chaos. More coordination." + ChravelApp wordmark.
   - Shared `SceneCaption` overlay component (new, in `remotion/src/components/`) for consistent caption styling (black/gold/white, restrained motion).

2. **`remotion/src/compositions/MobileAppDemo.tsx`** — new 1080×1920 (9:16), ~450 frames. Reuses `TabNavigationHero` + condensed cuts of chat/calendar/places/payments/concierge in a `PhoneFrame` wrapper (new component) with rounded device chrome. End frame: "The group chat travel app."

3. **`remotion/src/Root.tsx`** — register both new compositions alongside existing ones (do not remove any).

4. **`remotion/package.json`** — add scripts:
   - `render:homepage-hero` → `public/videos/chravel-homepage-hero.mp4` (in the main app's `public/`, written via `../public/videos/...`)
   - `render:mobile-demo` → `public/videos/chravel-mobile-demo.mp4`
   - `still:hero-poster` → `public/videos/chravel-homepage-hero-poster.jpg` (frame ~30 of HomepageHeroDemo)
   - `still:mobile-poster` → `public/videos/chravel-mobile-demo-poster.jpg`

5. **Render outputs committed** to `public/videos/`:
   - `chravel-homepage-hero.mp4` (target <8 MB, CRF 23, H.264)
   - `chravel-homepage-hero.webm` (VP9, optional second source)
   - `chravel-homepage-hero-poster.jpg`
   - `chravel-mobile-demo.mp4` + poster

6. **`src/components/landing/sections/HeroSection.tsx`** — minimal surgical edit to the existing image frame only:
   - Replace `<img>` with a `<HeroMedia>` block that renders:
     - `<video autoPlay muted loop playsInline preload="metadata" poster="/videos/chravel-homepage-hero-poster.jpg">` with `<source>` mp4 (+ webm if produced).
     - Static `<img src={demoPreviewHero}>` fallback shown when `prefers-reduced-motion: reduce` (via a small `useReducedMotion` hook in `src/hooks/`) OR when the `<video>` `onError` fires.
   - Preserve existing rounded frame, border, shadow, overlay gradient, and `animate-fade-in` wrapper. No layout changes, no new deps.

7. **`src/hooks/useReducedMotion.ts`** — tiny `matchMedia('(prefers-reduced-motion: reduce)')` hook (~15 lines).

8. **`remotion/README.md`** (append) — short note: how to render hero/mobile, where outputs land, how to swap caption copy, that captures are deterministic and require no live APIs/secrets.

## Technical details

- Reuses existing `remotion/src/theme.ts` (black/gold/white). No new fonts.
- Captions use `interpolate` fade+slide, never CSS animation. Spring `{ damping: 200 }` for entrances; one accent spring per scene.
- Transitions: `fade` (20 frames) between most scenes, one `slide` for Scene 1→2 to imply "opening" the trip.
- Total HomepageHeroDemo duration: 600 frames @ 30fps = 20s, loopable (end card holds 30f then crossfades to dashboard via composition loop in `<video loop>`).
- All scene data is hardcoded mock — no Supabase/Stripe/AI calls during render. Safe for CI and Vercel.
- HeroSection change is presentation-only; no routing, auth, or query changes. Mobile breakpoint behavior preserved (video is fluid `w-full h-auto` like the current img).
- Vercel: `public/videos/*.mp4` are static assets served with long cache; no build impact. Web Vitals respected via `preload="metadata"` (not `auto`) and `poster` paint for LCP.

## Out of scope (explicit deferrals)

- Pro/Events/Recs scenes in the hero loop (your call — kept consumer-only).
- Playwright real-route screenshot capture pipeline. v1 uses the existing Remotion mock scenes which already match product styling; we can add a `scripts/capture-marketing-screenshots.ts` later if you want literal app screenshots inside frames.
- App Store / TestFlight preview crops — same `MobileAppDemo` source can be re-rendered at different durations later.
- Replacing static below-the-fold screenshots — preserved as-is.

## Validation

- `cd remotion && npm run render:homepage-hero` + `render:mobile-demo` + both `still:*` commands produce files under `public/videos/`.
- `npm run lint && npm run typecheck && npm run build` pass in the main app after HeroSection edit.
- Manual: load `/`, confirm hero loops muted, no CLS, reduced-motion toggle shows static image, mobile Safari autoplay works (muted+playsInline).
