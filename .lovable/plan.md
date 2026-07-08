## Goal

Guarantee that Apple product IDs, RevenueCat entitlements, display names, and prices are identical across three places — the codebase, App Store Connect, and RevenueCat — so App Review can't reject on IAP mismatch and payouts flow correctly.

## Current state (verified in code)

Canonical set already exists in `src/billing/config.ts` and `src/constants/revenuecat.ts`. Everything the UI shows is derived from `config.ts` via `pricingDisplay.ts` — no hardcoded strings. Parity table:

| Offering | Apple / Google Product ID | RevenueCat Entitlement | Price | Duration | Display Name |
|---|---|---|---|---|---|
| Explorer Monthly | `com.chravel.explorer.monthly` | `chravel_explorer` | $9.99 | 1 mo | Explorer |
| Explorer Annual | `com.chravel.explorer.annual` | `chravel_explorer` | $99 | 1 yr | Explorer |
| Frequent Chraveler Monthly | `com.chravel.frequentchraveler.monthly` | `chravel_frequent_chraveler` | $19.99 | 1 mo | Frequent Chraveler |
| Frequent Chraveler Annual | `com.chravel.frequentchraveler.annual` | `chravel_frequent_chraveler` | $199 | 1 yr | Frequent Chraveler |
| Pro Starter Monthly | `com.chravel.pro.starter.monthly` | `chravel_pro_starter` | $49 | 1 mo | Starter Pro |
| Pro Growth Monthly | `com.chravel.pro.growth.monthly` | `chravel_pro_growth` | $99 | 1 mo | Growth Pro |
| Explorer Trip Pass | `com.chravel.trippass.explorer` | `chravel_explorer` (non-renewing, 45-day grant) | $39.99 | 45 d | Explorer Trip Pass (45 days) |
| Frequent Chraveler Trip Pass | `com.chravel.trippass.frequent` | `chravel_frequent_chraveler` (non-renewing, 90-day grant) | $74.99 | 90 d | Frequent Chraveler Trip Pass (90 days) |

Enterprise is intentionally NOT in this set — contact-sales only, hidden on iOS.

## Changes

### 1. Add a code-side parity guard — `scripts/validate-iap-parity.mjs`

Extends the existing `validate-iap-product-ids.mjs` to cross-check three things and fail CI if any drift:

- Every `appleProductIdMonthly` / `appleProductIdAnnual` / `TRIP_PASS_PRODUCTS[*].appleProductId` in `billing/config.ts` appears exactly once in `REVENUECAT_PRODUCTS` in `constants/revenuecat.ts`.
- Every ID in `REQUIRED_IOS_PRODUCT_IDS` maps back to a product in `BILLING_PRODUCTS` or `TRIP_PASS_PRODUCTS`.
- Prices in `REVENUECAT_PRICING` equal prices in `BILLING_PRODUCTS` / `TRIP_PASS_PRODUCTS`.
- Every product referenced maps to a known entitlement in `REVENUECAT_ENTITLEMENTS` via `ENTITLEMENT_TO_TIER`.
- The ASC snapshot in `appstore/asc-products.json` matches `REQUIRED_IOS_PRODUCT_IDS` exactly (no orphans on either side).

Wire it into `package.json` as `npm run validate:iap` and reference it from the pre-PR gate.

### 2. Add a Vitest parity test — `src/billing/__tests__/iap-parity.test.ts`

Same assertions as the script, but runs inside the standard test suite so an editor change to `revenuecat.ts` prices trips a red test immediately (not only at PR time).

### 3. Refresh the RevenueCat + ASC audit doc — `docs/ACTIVE/revenuecat-audit-browser-agent.md`

Rewrite as a strict, read-only checklist the browser agent runs against RevenueCat and App Store Connect, with the canonical table above embedded. For each row the agent must confirm:

- **App Store Connect:** product exists, Reference Name matches "Display Name" column, price matches, status is `Ready to Submit` or `Approved`, attached to the current binary submission, and (for Trip Passes) type is Non-Renewing Subscription.
- **RevenueCat:** product identifier equals the Apple ID string, is attached to the listed Entitlement, appears in the current Offering, and (for Trip Passes) has the correct 45-day / 90-day grant duration.
- **Bundle ID** in RevenueCat's iOS app matches the ASC bundle ID.
- **App Store Server Notifications** URL is RevenueCat's (not something stale).

Output format the agent must return: one row per product with three columns — `code ✓/✗`, `ASC ✓/✗`, `RevenueCat ✓/✗` — plus a mismatch list ranked Critical/High/Medium.

### 4. Add a paste-ready operator checklist — `appstore/IAP_PARITY_CHECKLIST.md`

Short human version of #3 for you to run through manually in ASC + RevenueCat before hitting Submit. Same table, tick-boxes, no prose.

## Non-goals

- No changes to product IDs, prices, entitlement IDs, or display names — those are already correct and locked.
- No changes to Stripe products.
- No changes to the iOS binary or RevenueCat SDK integration.
- No changes to `ConsumerBillingSection.tsx` (already synced in the prior change).

## Validation

- `node scripts/validate-iap-parity.mjs` exits 0.
- `npm run test -- iap-parity` passes.
- `npm run typecheck && npm run lint` pass.
- Manually walk the browser-agent doc against RevenueCat + ASC once; every row should return `code ✓ / ASC ✓ / RevenueCat ✓`.

## Why this closes the risk

Today the three surfaces (code / ASC / RevenueCat) are aligned but nothing *enforces* it — a future price bump in one place silently drifts. Steps 1 and 2 make code drift a build failure. Steps 3 and 4 give you a repeatable read-only audit for the two systems Lovable can't write to, so you can prove parity to Apple in one pass instead of guessing.
