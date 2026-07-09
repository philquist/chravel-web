# Browser-Agent Script — RevenueCat + App Store Connect IAP Parity Audit

> Paste this to a browser agent signed in to **both** RevenueCat and App Store Connect.
> **READ-ONLY.** Do not create, edit, submit, or delete products, entitlements, offerings, integrations, or agreements.
> **Do not paste secrets or financials into chat.** Safe to copy: entitlement IDs, offering IDs, package IDs, product identifiers, prices, review status. Redact `rcb_…` / `appl_…` / `goog_…` keys, webhook auth header values, banking, and tax IDs.

## Goal

Confirm the code's canonical IAP set matches App Store Connect and RevenueCat exactly. Any drift blocks App Review and can break payouts.

## Canonical set (source of truth: `src/billing/config.ts` + `src/constants/revenuecat.ts`)

| # | Product ID | Type | Entitlement | Price (USD) | Duration | Reference Name |
|---|---|---|---|---|---|---|
| 1 | `com.chravel.explorer.monthly` | Auto-Renewable Subscription | `chravel_explorer` | 9.99 | 1 month | Explorer Monthly |
| 2 | `com.chravel.explorer.annual` | Auto-Renewable Subscription | `chravel_explorer` | 99.00 | 1 year | Explorer Annual |
| 3 | `com.chravel.frequentchraveler.monthly` | Auto-Renewable Subscription | `chravel_frequent_chraveler` | 19.99 | 1 month | Frequent Chraveler Monthly |
| 4 | `com.chravel.frequentchraveler.annual` | Auto-Renewable Subscription | `chravel_frequent_chraveler` | 199.00 | 1 year | Frequent Chraveler Annual |
| 5 | `com.chravel.pro.starter.monthly` | Auto-Renewable Subscription | `chravel_pro_starter` | 49.00 | 1 month | Starter Pro Monthly |
| 6 | `com.chravel.pro.growth.monthly` | Auto-Renewable Subscription | `chravel_pro_growth` | 99.00 | 1 month | Growth Pro Monthly |
| 7 | `com.chravel.trippass.explorer` | Non-Renewing Subscription | `chravel_explorer` (45-day grant) | 39.99 | 45 days | Explorer Trip Pass |
| 8 | `com.chravel.trippass.frequent` | Non-Renewing Subscription | `chravel_frequent_chraveler` (90-day grant) | 74.99 | 90 days | Frequent Chraveler Trip Pass |

**Enterprise is intentionally NOT in this list** — contact-sales, web-only, hidden on iOS.

## Steps

### A. App Store Connect

1. Open the Chravel app → record the **Bundle ID**.
2. **Monetization → In-App Purchases and Subscriptions**. For each of the 8 rows above, record: Product ID, Reference Name, Type, Subscription Group (if applicable), US Price, Status, and whether the product is attached to the current binary submission (`2.0 (60)` or newer).
3. Confirm Explorer + Frequent Chraveler auto-renewable subscriptions live in the **same** consumer Subscription Group (needed for upgrade/downgrade).
4. Confirm Trip Passes are **Non-Renewing Subscriptions** (not consumables, not non-consumables).
5. Confirm each product has a review screenshot uploaded (Missing Metadata is a rejection trigger).
6. **Agreements, Tax, and Banking** — note only whether the **Paid Apps Agreement** is `Active`. Do not copy any account or banking numbers.
7. **App Information → App Store Server Notifications** — record the URL host only (should be RevenueCat's endpoint).

### B. RevenueCat

1. **Project settings → Apps** — record the iOS app's Bundle ID. It must equal the ASC Bundle ID from A.1.
2. **Entitlements** — list every entitlement ID and its attached products.
3. **Offerings** — list each offering, mark which is `current`, and list each package's `identifier → product identifier`.
4. **Products** — list every product identifier, its Store, and its Type. Confirm the 8 canonical IDs are present and no legacy/extra IDs are attached to the current offering.
5. **Integrations** — confirm App Store Connect integration status is `Active` (redact any secrets or keys).
6. **Webhooks** — record the target URL host only. It should point at `…/functions/v1/revenuecat-webhook`. Confirm an Authorization header is configured (do not copy its value).

## Output

Return one table with one row per canonical product and three columns:

| Product ID | Code | ASC | RevenueCat |
|---|---|---|---|
| `com.chravel.explorer.monthly` | ✓ / ✗ | ✓ / ✗ | ✓ / ✗ |
| … | | | |

Then a **mismatch summary** ranked Critical / High / Medium:

- **Critical** — Product ID missing in ASC or RevenueCat · price mismatch · Paid Apps Agreement not Active · Bundle ID mismatch between ASC and RevenueCat · Trip Pass type is not Non-Renewing · product not attached to current binary.
- **High** — Entitlement not attached · product missing from current Offering · Explorer + FC not in the same Subscription Group · missing review screenshot · webhook not pointing at RevenueCat.
- **Medium** — Reference Name drift · legacy/extra product present in ASC or RevenueCat but not in the canonical set · missing Authorization header on webhook.

Explicit yes/no answers to include at the top of the report:

- Bundle ID matches between ASC and RevenueCat? YES / NO
- All 8 canonical Product IDs present in ASC? YES / NO
- All 8 canonical Product IDs present in RevenueCat and attached to the current Offering? YES / NO
- Paid Apps Agreement Active? YES / NO
- Webhook target = `…/functions/v1/revenuecat-webhook`? YES / NO

Attach screenshots of: ASC IAP list, one detail view per Trip Pass, RevenueCat Entitlements, RevenueCat current Offering, and Integrations status. Redact all secrets and financials.
