## Goal
Give the top nav bar, the trip counter bar, and the trip card grid the same rendered width on the dashboard so all three sections align edge-to-edge.

## Root cause
- `src/pages/Index.tsx` wraps the top nav and counter bar in `container mx-auto px-4 max-w-[1600px]` (and an inner `max-w-[1500px]`).
- `src/components/home/TripGrid.tsx` wraps the card grid + its inner section in `w-full max-w-[1440px] mx-auto` (lines 479 and 647).

Result: the cards visibly stop ~60–160px short of the nav/counter row on wide viewports (as circled in the screenshot).

## Change
Unify all three to the same max width. Recommended: widen the grid to match the nav.

1. `src/components/home/TripGrid.tsx`
   - Line 479: change `max-w-[1440px]` → `max-w-[1500px]` (matches the inner nav/counter wrapper at `max-w-[1500px]`).
   - Line 647: same change on the grid element.

2. No changes to `Index.tsx` — its `max-w-[1500px]` inner wrapper becomes the single source of truth for dashboard content width; the outer `max-w-[1600px]` container just provides the page gutter.

3. Verify the same alignment holds on the Pro and Events dashboard sections (they render through the same `TripGrid`, so this single change covers all three).

## Verification
- Visual check at 1440px, 1920px, and 2150px (user's current viewport) that nav / counter / cards share left+right edges.
- `npm run typecheck && npm run build`.
- Existing `TripGrid.requests.test.tsx` should still pass (no structural changes).

## Risk
LOW — purely a Tailwind max-width token change on two lines in one file.
