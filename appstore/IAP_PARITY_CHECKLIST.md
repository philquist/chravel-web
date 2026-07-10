# IAP Parity Checklist (code ↔ ASC ↔ RevenueCat)

Run through this before every App Store resubmission. Every row must be ✓ in all three columns.
Code column is enforced automatically by `npm run iap:parity` and `iap-parity.test.ts` — the ASC and
RevenueCat columns are manual.

## Canonical product set (8 IAPs)

| # | Product ID | Type | Entitlement | Price (USD) | Duration | Display / Reference Name |
|---|---|---|---|---|---|---|
| 1 | `com.chravel.explorer.monthly` | Auto-Renewable Subscription | `chravel_explorer` | 9.99 | 1 month | Explorer Monthly |
| 2 | `com.chravel.explorer.annual` | Auto-Renewable Subscription | `chravel_explorer` | 99.00 | 1 year | Explorer Annual |
| 3 | `com.chravel.frequentchraveler.monthly` | Auto-Renewable Subscription | `chravel_frequent_chraveler` | 19.99 | 1 month | Frequent Chraveler Monthly |
| 4 | `com.chravel.frequentchraveler.annual` | Auto-Renewable Subscription | `chravel_frequent_chraveler` | 199.00 | 1 year | Frequent Chraveler Annual |
| 5 | `com.chravel.pro.starter.monthly` | Auto-Renewable Subscription | `chravel_pro_starter` | 49.00 | 1 month | Starter Pro Monthly |
| 6 | `com.chravel.pro.growth.monthly` | Auto-Renewable Subscription | `chravel_pro_growth` | 99.00 | 1 month | Growth Pro Monthly |
| 7 | `com.chravel.trippass.explorer` | Non-Renewing Subscription | `chravel_explorer` (45-day grant) | 39.99 | 45 days | Explorer Trip Pass — 45 Days |
| 8 | `com.chravel.trippass.frequent` | Non-Renewing Subscription | `chravel_frequent_chraveler` (90-day grant) | 74.99 | 90 days | Frequent Chraveler Trip Pass — 90 Days |

Enterprise ($custom / contact-sales) is intentionally NOT in this list. It is hidden from iOS and handled on web only.

## Per-product checklist

For each row above, tick all three:

- [ ] **Code** — `npm run iap:parity` exits 0.
- [ ] **App Store Connect**
  - [ ] Product exists with the exact Product ID string above (case-sensitive, immutable).
  - [ ] Reference Name matches the Display / Reference Name column.
  - [ ] Price for US territory matches (Apple tier).
  - [ ] Type matches (Auto-Renewable vs Non-Renewing Subscription).
  - [ ] Subscription products live in the correct Subscription Group (Explorer + FC in the same consumer group for upgrade/downgrade).
  - [ ] Status is `Ready to Submit` or `Approved`.
  - [ ] Attached to the current binary version (`2.0 (60)` or newer).
  - [ ] Review screenshot uploaded (see `docs/agentic/app-store-connect-iap-review-screenshots.md`).
- [ ] **RevenueCat**
  - [ ] Product identifier equals the Product ID exactly.
  - [ ] Attached to the Entitlement listed above.
  - [ ] Included in the current (default) Offering.
  - [ ] For Trip Passes: non-consumable / non-renewing type with the 45-day / 90-day grant configured.
- [ ] **Google Play Console** (see `docs/agentic/google-play-console-iap-parity-refresh.md`)
  - [ ] Product exists with the exact Product ID string above (case-sensitive, immutable — Google IDs mirror Apple IDs 1:1).
  - [ ] For IDs 1–6: Subscription with monthly or yearly base plan matching the Duration column, USD price matching, offer active.
  - [ ] For IDs 7–8 (Trip Passes): Managed **In-app product** (Play has no "non-renewing subscription" — the 45/90-day grant is enforced by the backend via `TRIP_PASS_PRODUCTS[*].durationDays`).
  - [ ] Product name + description match the copy in the agentic doc.
  - [ ] RevenueCat Play (Android) app has this product ID attached to the same entitlement as its Apple twin, in the same default offering.

## Global checks

- [ ] RevenueCat iOS app **Bundle ID** matches the ASC app record's Bundle ID.
- [ ] RevenueCat Android app **Package Name** matches the Play Console app package name.
- [ ] App Store Server Notifications URL in ASC points at RevenueCat (not a stale endpoint).
- [ ] Google Play Real-time Developer Notifications topic in Play Console points at RevenueCat.
- [ ] Paid Apps Agreement is active in ASC (required for any IAP payout).
- [ ] Google Play merchant account is active with payout method configured.
- [ ] `appstore/asc-products.json` and `playstore/play-products.json` in the repo match the store lists exactly (parity test enforces both).
- [ ] No orphan products in ASC, Play, or RevenueCat that aren't in the canonical set above.

## When any row fails

1. Do NOT resubmit — fix the failing surface first.
2. If it's a code drift, run `npm run iap:parity` and address the errors before touching ASC or RevenueCat.
3. If it's an ASC/RevenueCat drift, fix it in the dashboard and rerun the checklist end-to-end.
