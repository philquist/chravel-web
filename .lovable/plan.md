## Goal
Make the **Create Recap** modal's footer (Cancel + Create Recap buttons) visible on iPhone portrait in PWA and TestFlight without requiring rotation.

## Root cause
`src/components/trip/TripExportModal.tsx` caps panel height with `max-h-[calc(100dvh - safe-area-top - safe-area-bottom - 0.75rem)]` and relies on flex shrinking. In standalone iOS WebView (PWA + TestFlight), `100dvh` over-reports against the actual usable viewport, and the section grid (8 items × ~52px) + banners + header push the footer past the bottom edge. Desktop and landscape have more height so it works.

## Fix (single file: `src/components/trip/TripExportModal.tsx`)

1. **Use a safer height ceiling on mobile**
   - Replace the panel's `max-h-[calc(100dvh - …)]` with `max-h-[100svh]` (smallest-viewport unit, accounts for iOS chrome) plus inline `style` fallback `maxHeight: 'calc(100svh - env(safe-area-inset-top) - env(safe-area-inset-bottom))'`.
   - Keep the existing `sm:` desktop ceiling unchanged.

2. **Shrink the content so footer always wins layout**
   - Section tile `min-h-[44px]` → `min-h-[40px]`, vertical padding `py-2` → `py-1.5`.
   - Reduce header padding (`pb-2.5` → `pb-2`) and content top padding (`pt-2` → `pt-1.5`).
   - Reduce bottom margins on the "Trip:" title block and section grid from `mb-3 md:mb-4` to `mb-2 md:mb-3`.
   - Info banner padding `p-2` stays, but margin-top-only (drop extra spacing).

3. **Guarantee footer visibility**
   - Footer already has `flex-shrink-0`; reduce its `p-3` to `px-3 py-2` and button `py-2.5` → `py-2` so it occupies ~52px instead of ~72px.
   - Keep `min-h-[44px]` tap target on the two buttons (accessibility floor).
   - Ensure scrollable content uses `flex-1 min-h-0` (already does) so it absorbs all remaining space and the footer is never pushed off-screen.

4. **Bottom-sheet safe-area**
   - Footer keeps `paddingBottom: max(12px, env(safe-area-inset-bottom) + 12px)` so the home indicator doesn't overlap.

## Out of scope
- No changes to export logic, section list, or upgrade prompt.
- No changes to other modals.
- No new dependencies.

## Validation
- Preview at iPhone portrait (375×812 and 390×844) — confirm both Cancel + Create Recap visible without scrolling the panel.
- Preview at iPhone landscape (812×375) — confirm no regression.
- Desktop ≥`sm` — confirm centered modal unchanged.
- Free user (upgrade prompt visible) — confirm prompt still scrolls without breaking footer (note: footer is hidden when `!hasAccess`, which is intentional).

## Risk
LOW. Single-file CSS-only tweaks, no behavior change.
