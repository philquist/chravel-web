## Goal

Full seamless parity across App Store Connect ↔ Google Play Console ↔ RevenueCat ↔ backend (`src/billing/config.ts`) for all 8 IAPs, and a parity check that fails CI on drift.

## Canonical 8 IAPs (unchanged — ASC is source of truth)

| # | Product ID | Play type | Duration | USD price | RC entitlement |
|---|---|---|---|---|---|
| 1 | `com.chravel.explorer.monthly` | Subscription, monthly base plan | 1 mo | $9.99 | `chravel_explorer` |
| 2 | `com.chravel.explorer.annual` | Subscription, yearly base plan | 1 yr | $99.00 | `chravel_explorer` |
| 3 | `com.chravel.frequentchraveler.monthly` | Subscription, monthly | 1 mo | $19.99 | `chravel_frequent_chraveler` |
| 4 | `com.chravel.frequentchraveler.annual` | Subscription, yearly | 1 yr | $199.00 | `chravel_frequent_chraveler` |
| 5 | `com.chravel.pro.starter.monthly` | Subscription, monthly | 1 mo | $49.00 | `chravel_pro_starter` |
| 6 | `com.chravel.pro.growth.monthly` | Subscription, monthly | 1 mo | $99.00 | `chravel_pro_growth` |
| 7 | `com.chravel.trippass.explorer` | **In-app product (managed)** | 45 days (backend grant) | $39.99 | `chravel_explorer` |
| 8 | `com.chravel.trippass.frequent` | **In-app product (managed)** | 90 days (backend grant) | $74.99 | `chravel_frequent_chraveler` |

Play has no "non-renewing subscription" — trip passes are **Managed In-app Products**; RevenueCat maps them to the same entitlements with the 45/90-day grant enforced by the backend (`TRIP_PASS_PRODUCTS[*].durationDays`).

## Code changes

1. **`src/billing/config.ts`** — add `googleProductId` to `TripPassConfig` (same string as `appleProductId` for both passes). Subscription products already carry `googleProductIdMonthly/Annual`.

2. **`playstore/play-products.json`** (new) — snapshot of the 8 Play product IDs, mirroring `appstore/asc-products.json`. Becomes the single source of truth the parity test diffs the Play Console against.

3. **`src/billing/__tests__/iap-parity.test.ts`** — new assertions:
   - Every `googleProductIdMonthly/Annual` in `BILLING_PRODUCTS` is present in the Play snapshot (except Enterprise, which has no Play SKU).
   - Every `TRIP_PASS_PRODUCTS[*].googleProductId` is present.
   - Play snapshot has no orphans vs. code.
   - Play IDs equal Apple IDs 1:1 (naming parity).
   - Play prices/durations equal `BILLING_PRODUCTS` / `TRIP_PASS_PRODUCTS` values (via RC pricing table already asserted).

4. **`scripts/validate-iap-parity.mjs`** — extend to read `playstore/play-products.json` and enforce the same missing/orphan checks as ASC, so `npm run iap:parity` fails on Play drift too.

## Docs

5. **`appstore/IAP_PARITY_CHECKLIST.md`** → add a **Google Play** column to the per-product checklist (Play product exists · type correct · monthly/yearly base plan · price · offer attached · RC product ID matches · in current default offering).

6. **`docs/agentic/google-play-console-iap-parity-refresh.md`** (new) — full agentic browser script for `play.google.com/console`:
   - Sign in → select ChravelApp.
   - For each subscription (IDs 1–6): open **Subscriptions**, ensure product exists with exact ID, set display name + description (paste-ready copy for each), confirm base plan (monthly/yearly), set USD price to match table, activate offer, save.
   - For each trip pass (IDs 7–8): open **In-app products**, ensure managed product exists with exact ID, set display name + description (paste-ready copy matching the refreshed trip-pass positioning), set USD price, activate.
   - Explicitly **do not** create new IDs, change existing IDs, or rename base plans. IDs are immutable.
   - Post-update: run `npm run iap:parity` locally to confirm snapshot is still in sync.

7. Paste-ready Play Console copy for all 8 products in the same doc (name + short description + long description), matching the ASC reference names and the trip-pass copy shipped last turn.

## Verification

- `npm run iap:parity` exits 0 with the new Play checks.
- `bunx vitest run src/billing/__tests__/iap-parity.test.ts` passes.
- `npm run typecheck` clean.
- No changes to product IDs, prices, RC entitlement mappings, or `durationDays`.

## Out of scope

- Creating new product IDs, deleting existing ones, or changing prices in any store.
- Google Play Billing client integration (`GOOGLE_BILLING_ENABLED` stays `false` until the native Android shell is wired).
- ASC / RevenueCat mutations (already in parity).
