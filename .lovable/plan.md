Plan: Trim the Free column in `src/components/conversion/PricingSection.tsx` by removing the two bottom bullets: `🎁 1 free Pro trip to try` and `Up to 3 events (upgrade to Frequent Chraveler for unlimited)`. This reduces the Free column from 11 to 9 bullets, making it roughly the same height as Explorer (9 bullets) and Frequent Chraveler (10 bullets), without changing any other tiers, the FAQ, or the price/source-of-truth data.

**Technical details**
- File: `src/components/conversion/PricingSection.tsx`
- Lines to delete: the two feature strings in the `free` tier `features` array.
- No layout/CSS changes required; the existing card layout will reflow naturally.
- No source-of-truth billing data (`src/billing/config.ts`) changes.
- No other marketing copy or FAQ changes per user direction.

**Verification**
- Run `npm run typecheck` and `npm run lint:check` on the touched file path.
- Visually confirm in the preview that all three consumer columns end at a similar height and that the remaining bullets are unchanged.