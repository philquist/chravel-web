## Merge "Start free" block into the "Why Upgrade?" card

**File:** `src/components/conversion/PricingSection.tsx` (lines ~438–481)

### Changes

1. **Delete the standalone gold block** (lines 439–451) — the `accent-fill-gold` chip with the "Start free. Upgrade when you're ready for relief." headline and supporting copy.

2. **Re-nest that copy inside the "Why Upgrade?" card** as a subheader below the `Why Upgrade?` h3:
   - Keep the existing dark card container (`bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl`).
   - `Why Upgrade?` stays as the h3 title.
   - Directly under it, add a smaller subheader line: **"Start free. Upgrade when you're ready for relief."** — `text-base sm:text-lg tablet:text-xl font-semibold text-white`.
   - Below that, a muted supporting line: **"Don't lose receipts, links, or the final plan. Free works forever—upgrade only when you need more."** — `text-sm sm:text-base text-white/70`.
   - Add a thin gold divider (`h-px w-16 bg-gradient-to-r from-transparent via-[#c49746] to-transparent mx-auto my-4`) between the subheader block and the value-prop grid to preserve the site's editorial rhythm.

3. **Remove the outer wrapper's `text-center space-y-6`** on the header row so the deleted chip doesn't leave orphan spacing; keep the Why Upgrade card centered via its existing `mx-auto`.

### Result

No more oversized gold rectangle. The messaging becomes an editorial intro *inside* the Why Upgrade card, in white on the dark surface — consistent with the rest of the marketing page. Overall vertical footprint shrinks by ~40%.

### Out of scope

Pricing tiers, tabs, FAQ, Trip Pass content, and all other sections remain untouched.
