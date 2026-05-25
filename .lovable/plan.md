## Hero brand consistency pass

File: `src/components/landing/sections/HeroSection.tsx`

### Changes

1. **"ChravelApp" wordmark (top)** — keep the existing gold→blue gradient, but boost contrast against the gold radial background behind it:
   - Shift gradient to richer gold tones so it reads as gold-on-gold-with-pop (e.g. `#7ba4d9 → #8a5a1f → #c49746 → #feeaa5 → #c49746 → #7ba4d9`) — deeper midtone anchors the letterforms.
   - Add a layered drop shadow via `filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6)) drop-shadow(0 4px 16px rgba(0,0,0,0.5))` so the gradient text lifts off the gold backdrop.

2. **Subtitle paragraph** — change text color from `text-white/80` to `text-white` so "For Friends, Families…" and "Planning feeling Overwhelming?" match the brightness of the H1.

3. **Copy edits inside the subtitle:**
   - Prepend `For ` → `For Friends, Families, Sports, Tours, Work & More.`
   - Replace `Planning is Frustrating.` → `Planning feeling Overwhelming?`
   - Replace gold accent `ChravelApp Alleviates that Stress.` → `Use ChravelApp for Less Stress & More Stories.`
   - Remove `text-gold-primary` from that span; use plain bright white (keep `font-semibold` for emphasis).

### Out of scope
No layout, spacing, animation, or other section changes.
