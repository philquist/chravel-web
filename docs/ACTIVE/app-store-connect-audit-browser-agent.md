# Browser-Agent Script — App Store Connect Audit (Chravel)

> Paste this to a browser agent with access to Chravel's App Store Connect account.
> **READ-ONLY. Do not create, edit, submit, or delete products, prices, or agreements.**
> **Do not paste shared secrets, certificates, or banking/tax/agreement financials into chat.** Safe to copy:
> product IDs, subscription group names, price tiers, localized display names, review status.

## Goal
Confirm Apple IAP subscription products exist with IDs/prices that match RevenueCat + the code, and that the
account is in a state that could support submission. Apple IAP is currently **disabled in the app**
(`APPLE_IAP_ENABLED = false`); this audit validates readiness, it does not enable anything.

## Canonical values to diff against
**Apple product IDs** (must equal RevenueCat product identifiers):
`com.chravel.explorer.monthly`, `com.chravel.explorer.annual`,
`com.chravel.frequentchraveler.monthly`, `com.chravel.frequentchraveler.annual`,
`com.chravel.trippass.explorer`, `com.chravel.trippass.frequent`,
`com.chravel.pro.starter.monthly`, `com.chravel.pro.growth.monthly`.
**Prices:** Explorer $9.99/mo, $99/yr · Frequent Chraveler $19.99/mo, $199/yr · passes $39.99 / $74.99.

## Steps & what to capture
1. **App record**: record app name and **Bundle ID**. Confirm it matches the RevenueCat iOS app bundle ID
   (compare with the RevenueCat audit). Flag mismatch.
2. **Subscriptions → Subscription Groups**: list each group and its subscriptions. Confirm a consumer group exists
   (e.g. "Chravel Consumer") containing Explorer + Frequent Chraveler. Record group structure — upgrade/downgrade
   behavior depends on tiers being in the **same** group.
3. **For each subscription product**: record Product ID, Reference Name, Duration, **Price** (per territory if
   shown — confirm US matches the matrix), Availability, and **Status** (Missing Metadata / Ready to Submit /
   Approved / etc.). Confirm IDs exactly match the canonical list (Apple IDs are case-sensitive and immutable).
4. **One-time products** (if passes are modeled as non-consumables/consumables): record their Product IDs and
   prices; confirm `…pass45` / `…pass90` match.
5. **Introductory / promotional offers**: record any free-trial or intro pricing and confirm it matches in-app
   copy. Flag offers that exist in Apple but not reflected in the app, or vice-versa.
6. **Localization**: confirm display name/description exist for required locales (at least en-US).
7. **Agreements / Tax / Banking** (status only — redact all financial detail): note whether the **Paid Apps
   Agreement** is active (required for IAP). Do **not** copy any account/banking numbers.
8. **Sandbox test accounts** (Users and Access → Sandbox): note whether sandbox testers exist for QA (IDs/emails
   redacted).
9. **App Store Server Notifications**: note whether a notifications URL is set and to where (RevenueCat usually
   owns this; flag if it points somewhere unexpected).

## Output
- Subscription table: Product ID · Group · Duration · US Price · Status · matches-code? · matches-RevenueCat?
- A **mismatch summary** (Critical/High/Medium/Low): ID mismatches vs RevenueCat/code, price mismatches, wrong
  group structure, missing localization, agreement not active, pending price changes that would create drift.
- Explicit answers: "Bundle ID matches RevenueCat? YES/NO." · "All product IDs match RevenueCat identifiers
  exactly? YES/NO." · "Paid Apps Agreement active? YES/NO."
- Screenshots: subscription group(s), each product's detail, agreement status banner (financials redacted).
