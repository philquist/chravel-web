
# Trip Pass Copy Refresh — Zero-Duration-Change Plan

## The key insight (why we can leave everything alone)

Apple's **Non-Renewing Subscription** type has no fixed duration list. The "45 days" and "90 days" are enforced entirely by your app — specifically `TRIP_PASS_PRODUCTS[*].durationDays` in `src/billing/config.ts`, which drives the RevenueCat grant window and the `user_entitlements.current_period_end` write. ASC and RevenueCat only know price + product ID; they don't validate duration. So **45/90 days is fully legal today** and requires **no changes** to ASC, Google Play, RevenueCat, product IDs, prices, or code.

The only thing worth fixing is the **positioning**: right now the two passes look economically weird next to the monthly sub ($9.99 Explorer × 2 = $19.98 vs $39.99 pass). They're not weird — they're a different product — but the copy doesn't say so.

## Positioning framing (the "why buy this over a sub?" answer)

Apply everywhere the passes appear:

- **Explorer Trip Pass — $39.99 · 45 days** → *"One trip, done. No subscription, no cancel reminders, no card on file after checkout."*
- **Frequent Chraveler Trip Pass — $74.99 · 90 days** → *"Full Frequent Chraveler experience for a full season of trips. Double the window, more features, less than double the price. No renewal."*

The pass is not competing on $/day with the monthly sub. It's competing on **commitment-free, gift-able, one-purchase peace of mind**, plus the FC pass adds a real feature delta (unlimited AI, role-based channels, custom categories) that the Explorer monthly doesn't have.

The FC pass math is your strongest lever: **2× the duration + more features for 1.87× the price** vs Explorer pass. Lead with that on the paywall.

## Scope of changes (code + copy only)

### 1. Paywall + billing copy (frontend)
Files touched: `src/billing/pricingDisplay.ts`, `src/components/conversion/PricingSection.tsx`, `src/components/settings/ConsumerBillingSection.tsx` (and any Trip Pass card component under `src/features/billing/` or `src/components/billing/`).

Changes:
- Update Explorer Trip Pass tagline → "One trip, done. 45 days of Explorer features, no subscription."
- Update FC Trip Pass tagline → "90 days of the full Frequent Chraveler experience. Double the window, less than double the price."
- Add a small comparison line under each pass: *"Prefer to pay monthly? See Chravel Plus →"* linking to the subs tab.
- Add "No auto-renew · No card kept on file" microcopy under both CTAs.
- Update the "Best for multi-city" badge on FC pass → keep, add second badge "Best value per day" (FC pass = $0.83/day vs Explorer pass $0.89/day).

### 2. Marketing / landing copy
Files touched: `src/components/landing/sections/PricingLandingSection.tsx` (renders `PricingSection`, so covered above), any Trip Pass mention in `src/MarketingApp.tsx` or landing hero.

### 3. ASC + Play Store metadata (repo-tracked)
Files touched:
- `appstore/IAP_PARITY_CHECKLIST.md` — refresh the "Display / Reference Name" column so it matches the new paywall copy (reference name IS editable in ASC).
- `docs/agentic/app-store-connect-iap-review-screenshots.md` — refresh the review-notes snippet so it matches new CTA copy.
- `playstore/full_description.txt` and `playstore/short_description.txt` — update Trip Pass mentions if present.
- `appstore/metadata/description.md` and `appstore/metadata/promo_text.txt` — same.

### 4. Agentic browser script (new)
New file: `docs/agentic/app-store-connect-trippass-copy-refresh.md`

Contains a paste-ready script for the Claude Code Agentic Browser that:
1. Signs into ASC.
2. For each of the 8 IAP product IDs, opens the product and updates only the **Localized Display Name** and **Description** fields (Product ID, price, and type stay untouched).
3. For Trip Passes specifically, updates the review notes to match the new paywall copy.
4. Signs into Google Play Console and updates the corresponding in-app product descriptions.
5. Reports back which products were updated with before/after diffs.

The script explicitly **does not**: change product IDs, prices, subscription groups, durations, or upload new screenshots. This keeps you out of Apple's re-review queue for anything structural.

### 5. IAP parity test — no change needed
`src/billing/__tests__/iap-parity.test.ts` and `appstore/asc-products.json` compare product IDs and prices, not display copy. They'll stay green.

## What we are NOT touching

- ❌ `TRIP_PASS_PRODUCTS.durationDays` (45 and 90 stay)
- ❌ Any Apple Product ID (immutable anyway)
- ❌ Any price
- ❌ RevenueCat entitlement mappings
- ❌ ASC subscription groups
- ❌ ASC review screenshots (still valid — they show these products at these prices)
- ❌ The "grant 60 days when user bought 45" idea — this would silently drift marketing copy, ASC reference name, receipt text, and the actual entitlement. Whatever the paywall says, that's what the DB writes. One source of truth.

## Deliverables at end of task

1. Updated paywall + settings billing copy in code.
2. Updated store metadata files in the repo.
3. New agentic browser script ready to paste.
4. Short summary of exactly which ASC + Play fields to change (so you can do it yourself in ~15 min if you don't want to run the script).
5. Confirmation that `npm run iap:parity`, typecheck, and lint pass.

## Technical detail (for the record)

- Trip Pass durations live in one place: `TRIP_PASS_PRODUCTS['pass-explorer-45'].durationDays = 45` and `['pass-frequent-90'].durationDays = 90` in `src/billing/config.ts`. `REVENUECAT_PRICING.tripPasses.*.durationDays` mirrors these and is enforced by the parity test. Neither changes.
- The grant-on-purchase path (RevenueCat webhook → `user_entitlements.current_period_end = now() + durationDays`) is unchanged.
- ASC reference names and localized display names are editable at any time without triggering IAP re-review — only price tier, product type, and subscription group changes trigger review.
