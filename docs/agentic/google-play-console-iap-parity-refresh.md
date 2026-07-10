# Google Play Console — IAP Parity Refresh

Bring the 8 Chravel IAPs in Google Play Console to full parity with App Store Connect,
RevenueCat, and `src/billing/config.ts`.

**Do not** create new product IDs, delete existing ones, or rename base plans — IDs are
immutable and any rename cascades through RevenueCat and breaks entitlements. This script
only edits **display name**, **description**, **price** (only if drifted), and **base plan
period** (only if drifted). All 8 Play product IDs mirror the Apple IDs 1:1.

Snapshot enforced by CI: `playstore/play-products.json`. After the changes below, run:

```bash
npm run iap:parity
bunx vitest run src/billing/__tests__/iap-parity.test.ts
```

Both must exit 0.

---

## Canonical product set (must exist exactly)

| # | Product ID | Play type | Base plan / period | USD price | RC entitlement |
|---|---|---|---|---|---|
| 1 | `com.chravel.explorer.monthly` | Subscription | monthly | $9.99 | `chravel_explorer` |
| 2 | `com.chravel.explorer.annual` | Subscription | yearly | $99.00 | `chravel_explorer` |
| 3 | `com.chravel.frequentchraveler.monthly` | Subscription | monthly | $19.99 | `chravel_frequent_chraveler` |
| 4 | `com.chravel.frequentchraveler.annual` | Subscription | yearly | $199.00 | `chravel_frequent_chraveler` |
| 5 | `com.chravel.pro.starter.monthly` | Subscription | monthly | $49.00 | `chravel_pro_starter` |
| 6 | `com.chravel.pro.growth.monthly` | Subscription | monthly | $99.00 | `chravel_pro_growth` |
| 7 | `com.chravel.trippass.explorer` | Managed in-app product | one-time | $39.99 | `chravel_explorer` (45-day backend grant) |
| 8 | `com.chravel.trippass.frequent` | Managed in-app product | one-time | $74.99 | `chravel_frequent_chraveler` (90-day backend grant) |

Google Play has **no non-renewing subscription** primitive. Trip Passes are **Managed
In-app Products** (INAPP). RevenueCat receives the purchase and the Chravel backend grants
the entitlement for `TRIP_PASS_PRODUCTS[key].durationDays`.

Enterprise ($custom) is **not** in Play Console — web-only contact-sales.

---

## Paste-ready copy

### Subscriptions

**1. `com.chravel.explorer.monthly`**
- Name: `Explorer Monthly`
- Benefit 1: `Unlimited trips & extended AI Concierge`
- Benefit 2: `Extended storage, calendar sync, PDF export`
- Description: `Explorer unlocks unlimited trips, extended AI Concierge queries, extended cloud storage, calendar sync, and PDF export. Billed monthly. Cancel anytime in Google Play.`

**2. `com.chravel.explorer.annual`**
- Name: `Explorer Annual`
- Benefits: same as #1
- Description: `Explorer, billed yearly. Save vs. monthly. Unlocks unlimited trips, extended AI Concierge, extended storage, calendar sync, and PDF export. Cancel anytime in Google Play.`

**3. `com.chravel.frequentchraveler.monthly`**
- Name: `Frequent Chraveler Monthly`
- Benefit 1: `Unlimited AI Concierge (text + voice)`
- Benefit 2: `Create Pro trips & events, roles & channels`
- Description: `The full Chravel experience: unlimited AI Concierge with voice, unlimited storage & payments, Pro trip creation, event creation, role-based channels, and PDF export. Billed monthly. Cancel anytime in Google Play.`

**4. `com.chravel.frequentchraveler.annual`**
- Name: `Frequent Chraveler Annual`
- Benefits: same as #3
- Description: `Frequent Chraveler, billed yearly. Save vs. monthly. Unlimited AI Concierge with voice, unlimited storage, Pro trip & event creation, roles, channels, and PDF export. Cancel anytime in Google Play.`

**5. `com.chravel.pro.starter.monthly`**
- Name: `Starter Pro Monthly`
- Benefit 1: `Roster management, roles & channels`
- Benefit 2: `Unlimited AI, storage, payments, PDF export`
- Description: `Starter Pro for touring teams and small orgs: roster management, role-based channels, unlimited AI Concierge with voice, unlimited storage & payments, PDF export, and calendar sync. Billed monthly. Cancel anytime in Google Play.`

**6. `com.chravel.pro.growth.monthly`**
- Name: `Growth Pro Monthly`
- Benefit 1: `Logistics + event creation (up to 200 attendees)`
- Benefit 2: `Full Pro toolkit: roster, roles, channels, AI`
- Description: `Growth Pro adds logistics management and event creation (up to 200 attendees) on top of the full Starter Pro toolkit. Billed monthly. Cancel anytime in Google Play.`

### Managed in-app products (Trip Passes)

**7. `com.chravel.trippass.explorer`**
- Name: `Explorer Trip Pass`
- Description: `One trip, done. 45 days of Explorer features — unlimited trips, extended AI Concierge, extended storage, calendar sync, PDF export. One-time purchase, no auto-renew, no card kept on file.`

**8. `com.chravel.trippass.frequent`**
- Name: `Frequent Chraveler Trip Pass`
- Description: `90 days of the full Frequent Chraveler experience — unlimited AI Concierge with voice, unlimited storage, Pro trip & event creation, roles, channels, PDF export. Double the window of the Explorer Trip Pass, less than double the price. One-time purchase, no auto-renew.`

---

## Agentic browser script (Google Play Console)

Prereqs: signed into Play Console with a role that includes **Manage store presence** and
**Manage monetization**. App selected: **ChravelApp** (Android package = the one wired
into RevenueCat Android app).

Perform the steps in order. For each product, **only** edit the fields listed. Do not
touch product IDs, base plan IDs, offer IDs, or grace-period settings.

### Subscriptions loop (IDs 1–6)

For each of the six subscription product IDs above:

1. Navigate: left nav → **Monetize** → **Products** → **Subscriptions**.
2. Locate the row whose **Product ID** matches (exact, case-sensitive). If missing, stop and file a follow-up — do **not** create a new ID in this pass.
3. Click the product → **Basic details**:
   - Set **Name** to the paste-ready name above. Save.
   - Set **Benefits** (add up to two) to the bullets above. Save.
   - Set **Description** to the paste-ready description above. Save.
4. Open **Base plans** tab. Confirm there is exactly one active base plan with:
   - **Billing period** = monthly for `.monthly` IDs, yearly for `.annual` IDs.
   - **Renewal type** = auto-renewing.
   - **Price (US)** matches the table above; if it drifts, click **Set prices** → US → enter the price → **Apply** → **Update**.
   - Base plan status = **Active**.
5. Confirm the subscription itself is **Active** (top-right toggle).
6. Move to the next product.

### Managed in-app products loop (IDs 7–8)

For each Trip Pass:

1. Navigate: **Monetize** → **Products** → **In-app products**.
2. Locate the row whose **Product ID** matches. If missing, stop — do **not** create a new ID here.
3. Confirm **Product type** = **Managed product**. If it is a Subscription, stop and file a follow-up — this is a data-model mismatch that must be resolved with a fresh Product ID, which is out of scope for a copy-only refresh.
4. Click the product → **Basic details**:
   - Set **Name** and **Description** to the paste-ready copy above. Save.
5. **Pricing** → US → confirm price matches the table (39.99 / 74.99). If drifted, correct it and apply.
6. Product status = **Active**.

### Cross-store validations after the loop

1. RevenueCat → **Products** → confirm each Play product ID above exists under the Android app and is attached to the matching entitlement (`chravel_explorer`, `chravel_frequent_chraveler`, `chravel_pro_starter`, `chravel_pro_growth`).
2. RevenueCat → **Offerings** → confirm the default offering exposes the six subscription packages plus the two Trip Pass packages for Android identically to iOS.
3. Play Console → **Monetize setup** → confirm **Real-time developer notifications** Pub/Sub topic is the RevenueCat topic (`projects/revenuecat-...`).
4. Local repo: `npm run iap:parity` exits 0.

---

## What this doc explicitly does not change

- Product IDs (Apple or Google) — immutable, mirrored 1:1.
- Any subscription group, base plan ID, or offer ID.
- Any price in a currency other than USD (localized prices are set via Play's auto-conversion or, if manually overridden, handled in a separate task).
- `TRIP_PASS_PRODUCTS[*].durationDays` — the 45/90-day window is a backend grant and stays authoritative in code.
- ASC or RevenueCat records (already in parity per `IAP_PARITY_CHECKLIST.md`).
