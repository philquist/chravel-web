# App Store Connect + Google Play — Trip Pass Copy Refresh

Paste-ready Agentic Browser script to update **display names, descriptions, and review notes only**.
No product IDs, prices, durations, subscription groups, or screenshots are touched — this keeps you
out of Apple's structural IAP re-review queue.

## Why this exists

Trip Pass durations (45 days Explorer, 90 days Frequent Chraveler) are enforced entirely by our
backend (`TRIP_PASS_PRODUCTS[*].durationDays` → RevenueCat grant → `user_entitlements.current_period_end`).
ASC and RevenueCat only know the product ID and price — they don't validate duration. So we're
sharpening the *positioning* on both stores without changing any product structure.

## Canonical copy (paste into the store fields)

### Explorer Trip Pass
- **Product ID (immutable, do NOT change):** `com.chravel.trippass.explorer`
- **Reference Name / Display Name:** `Explorer Trip Pass — 45 Days`
- **Description (App Store, 45–200 chars):**
  > One-time purchase. 45 days of Explorer premium features — no subscription, no auto-renew, no card kept on file after checkout. Your exports stay forever.
- **Google Play in-app product description:**
  > One-time purchase. 45 days of Explorer features. No subscription, no auto-renew.

### Frequent Chraveler Trip Pass
- **Product ID (immutable, do NOT change):** `com.chravel.trippass.frequent`
- **Reference Name / Display Name:** `Frequent Chraveler Trip Pass — 90 Days`
- **Description (App Store, 45–200 chars):**
  > One-time purchase. 90 days of the full Frequent Chraveler experience — double the window, best value per day. No auto-renew, no card kept on file. Exports stay forever.
- **Google Play in-app product description:**
  > One-time purchase. 90 days of Frequent Chraveler features. Best value per day. No auto-renew.

### Review Notes (both Trip Passes)
> One-time purchase (non-renewing subscription in StoreKit terms). CTA reads "Buy with Apple" because the app uses StoreKit / RevenueCat for all iOS purchases. Access duration (45 or 90 days) is granted by our backend on receipt validation via RevenueCat; ASC does not need to enforce the window. No external payment links. No auto-renew — users see a clear "one-time purchase" label on the paywall.

## Agentic Browser Script — App Store Connect

```
For each Trip Pass in the table below, perform these steps in App Store Connect:

Table:
| Product ID                        | New Reference Name                          | New Description                                                                                                                                                                     |
|-----------------------------------|---------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| com.chravel.trippass.explorer     | Explorer Trip Pass — 45 Days                | One-time purchase. 45 days of Explorer premium features — no subscription, no auto-renew, no card kept on file after checkout. Your exports stay forever.                            |
| com.chravel.trippass.frequent     | Frequent Chraveler Trip Pass — 90 Days      | One-time purchase. 90 days of the full Frequent Chraveler experience — double the window, best value per day. No auto-renew, no card kept on file. Exports stay forever.            |

Steps per row:
1. Go to https://appstoreconnect.apple.com/apps and click the Chravel app.
2. In the left sidebar under "Monetization", click "In-App Purchases and Subscriptions".
3. Search for the Product ID in the table.
4. Open the product. VERIFY the Product ID matches exactly. Do NOT touch price, type, or subscription group.
5. Under "Reference Name", replace with the "New Reference Name" from the table. Save.
6. Under "Localizations" → "English (U.S.)", edit "Display Name" to match the "New Reference Name" and "Description" to match the "New Description". Save.
7. Under "App Review Information" → "Review Notes", replace with the block below. Save.
8. Confirm status remains "Ready to Submit" or "Approved" (should not drop to "Missing Metadata").

Review Notes (paste for both Trip Passes):
"One-time purchase (non-renewing subscription in StoreKit terms). CTA reads 'Buy with Apple' because the app uses StoreKit / RevenueCat for all iOS purchases. Access duration (45 or 90 days) is granted by our backend on receipt validation via RevenueCat; ASC does not need to enforce the window. No external payment links. No auto-renew — users see a clear 'one-time purchase' label on the paywall."

After both rows are done, take a screenshot of the IAP list page showing both Trip Pass products still in "Ready to Submit" or "Approved" state and report the before/after diff for each row.

Do NOT: create new products, change prices, change subscription type, upload new screenshots, or modify any of the 6 auto-renewable subscription products (Explorer/FC/Pro monthly & annual).
```

## Agentic Browser Script — Google Play Console

```
For each Trip Pass in the table below, perform these steps in Google Play Console:

Table:
| Product ID                        | New Title                                   | New Description                                                                                    |
|-----------------------------------|---------------------------------------------|----------------------------------------------------------------------------------------------------|
| com.chravel.trippass.explorer     | Explorer Trip Pass — 45 Days                | One-time purchase. 45 days of Explorer features. No subscription, no auto-renew.                    |
| com.chravel.trippass.frequent     | Frequent Chraveler Trip Pass — 90 Days      | One-time purchase. 90 days of Frequent Chraveler features. Best value per day. No auto-renew.       |

Steps per row:
1. Go to https://play.google.com/console and open the Chravel app.
2. In the left sidebar, click "Monetize" → "In-app products" (Trip Passes are one-time products, not subscriptions).
3. Search for the Product ID in the table.
4. Open the product. VERIFY the Product ID matches exactly. Do NOT touch price or currency.
5. Edit "Name" (title) to the "New Title" from the table. Save.
6. Edit "Description" to the "New Description" from the table. Save.
7. Confirm status remains "Active".

After both rows are done, take a screenshot of the in-app products list showing both Trip Pass products still Active and report the before/after diff for each row.

Do NOT: create new products, change prices, or modify any subscriptions.
```

## Manual fallback (~10 minutes total)

If you don't want to run the script, just do the two rows in ASC and the two rows in Play Console by
hand using the tables above. Total fields changed: 2 reference names + 2 descriptions + 2 review
notes on ASC, plus 2 titles + 2 descriptions on Play. That's it.

## What is NOT changing

- ❌ Product IDs (immutable on both stores anyway)
- ❌ Prices ($39.99 / $74.99)
- ❌ Product type (non-renewing subscription on ASC, in-app product on Play)
- ❌ Subscription groups on ASC
- ❌ Review screenshots (still valid — same products at same prices)
- ❌ Any of the 6 auto-renewable subscription products
- ❌ `TRIP_PASS_PRODUCTS.durationDays` in code (still 45 and 90)
- ❌ RevenueCat product/entitlement mappings
