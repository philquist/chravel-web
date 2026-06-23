
## Current state (verified)

- **Stripe**: Trip Pass is fully wired. `src/constants/stripe.ts` exports `TRIP_PASS_PLANS` with real `prod_…` and `price_…` IDs ($39.99 / $74.99). The `create-checkout` edge function already handles `purchase_type: 'pass'`, blocks double-billing against active subscriptions, and creates a one-time `mode: 'payment'` session for `pass-explorer-45` / `pass-frequent-90`.
- **RevenueCat**: Product identifiers are declared (`com.chravel.explorer.pass45`, `com.chravel.frequentchraveler.pass90`) in `src/constants/revenuecat.ts`, but the client (`revenuecatClient.ts`) only exposes a generic `purchasePackage(...)` against the default offering. There is no Trip Pass-specific selector, and `NativeSettings` never lists passes.
- **Settings UI**: `ConsumerBillingSection` (web/Android) and `NativeSettings` (iOS) only render Explorer / Frequent Chraveler monthly + annual. The `TripPassModal` exists but is only triggered from the marketing `PricingSection` on the landing page — not from in-app Settings.

## Goal

Let a signed-in user buy a Trip Pass from Settings → Subscription, on web (Stripe) and iOS/Android (RevenueCat), with the same modal/CTA shown on the marketing page.

## Changes

### 1. Settings entry point (web + Android, Stripe path)
- File: `src/components/consumer/ConsumerBillingSection.tsx`
  - Import `TripPassModal` and add a `tripPassOpen` state.
  - Add a new section under the billing-cycle toggle titled **"One-time Trip Pass"** with a short description ("Full premium for one trip — no recurring charge") and a single `Get a Trip Pass` button that opens `TripPassModal`.
  - Hide the section when `isSuperAdmin` or when the user already has an active pass/subscription (reuse `subscription.purchaseType` / `tier !== 'free'` check that the section already has).
  - Keep the existing monthly/annual upgrade flow untouched.

### 2. Settings entry point (iOS, RevenueCat path)
- File: `src/components/native/NativeSettings.tsx`
  - Add a "Trip Pass" row beneath the recurring plan list with two buttons: `Explorer · $39.99 / 45 days` and `Frequent Chraveler · $74.99 / 90 days`.
  - On tap, call a new `purchaseTripPass(passId)` helper (see §3) instead of opening the Stripe checkout modal — Apple/Google IAP only on native.
  - Reuse the existing native purchase success toast + entitlement refresh path that `purchasePackage` already feeds into.

### 3. RevenueCat helper for one-time passes
- File: `src/integrations/revenuecat/revenuecatClient.ts`
  - Add `purchaseTripPass(passKey: 'explorer' | 'frequent-chraveler')` that:
    1. Loads offerings via `getOfferings()`.
    2. Looks up the package whose `product.identifier` matches `REVENUECAT_PRODUCTS.explorerPass45` or `…frequentChravelerPass90`.
    3. Calls the existing `purchasePackage(...)` flow so the global purchase listener, entitlement sync, and toast already work.
    4. Returns the same `{ customerInfo, error }` shape as `purchasePackage`.
  - No new entitlement plumbing — pass purchases unlock the same `chravel_explorer` / `chravel_frequent_chraveler` entitlements as subscriptions, and `ENTITLEMENT_TO_TIER` already maps them. Duration (45/90 days) is enforced server-side by RevenueCat's non-renewing product config.

### 4. Cross-provider guard surface (no logic change)
- `create-checkout` already blocks pass purchases when an active subscription exists, and vice versa. Re-export the same `purchase_type: 'pass'` payload from the Settings Stripe path so the modal's existing `handlePurchase` keeps working without modification.

### 5. Documentation / config notes (no code execution)
- Add a short comment block at the top of `src/constants/revenuecat.ts` reminding the operator that **non-renewing** App Store / Play products with the IDs `com.chravel.explorer.pass45` and `com.chravel.frequentchraveler.pass90` must exist in the RevenueCat dashboard and grant the matching consumer entitlement for 45 / 90 days. (Configuration in the RevenueCat dashboard cannot be done from code — flag this to the user as the only remaining manual step.)

## What is NOT changing

- Stripe product/price IDs (already live).
- The `TripPassModal` UI itself.
- The marketing `PricingSection` Trip Pass CTA.
- Subscription tier mapping or entitlement schema.
- Webhook handling (`stripe-webhook` already records pass purchases into `user_entitlements` with `purchase_type: 'pass'` and `current_period_end = now + durationDays`).

## Verification

1. Web (signed-in, free tier): Settings → Billing → new "One-time Trip Pass" section visible → click `Get a Trip Pass` → modal opens → click `Get Trip Pass` on Explorer → redirected to Stripe Checkout in new tab with $39.99 one-time line item.
2. Web (already subscribed): Trip Pass section hidden (or shown disabled with the existing "manage current plan" copy).
3. iOS native (RevenueCat sandbox): Settings → new Trip Pass row → tap Explorer → native StoreKit sheet shows the `com.chravel.explorer.pass45` $39.99 product → after sandbox purchase, entitlement listener fires and tier flips to `explorer` for 45 days.
4. `npm run lint && npm run typecheck && npm run build` pass.

## Out of scope (call out, do not silently defer)

- Creating the RevenueCat non-renewing products in the App Store Connect / Play Console dashboards — manual operator step. I will flag this in the final response with the exact product IDs and entitlements to attach.
- Refund / restore-purchases UX changes (the existing "Restore Purchases" button already covers pass restores via RevenueCat).
