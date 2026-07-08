
## Goal

In Settings → Billing on iOS/mobile:
1. Remove the "$199/month" Enterprise tier (Apple IAP has no Enterprise SKU — showing a price with no purchase path is what triggers review confusion).
2. Add both **Trip Pass** in-app purchases as real, expandable options with name, price, duration, benefits, and a "Purchase with Apple" button — matching the two SKUs already in App Store Connect (`com.chravel.trippass.explorer`, `com.chravel.trippass.frequent`).

No pricing changes. No changes to Stripe/web billing. No changes to marketing pages.

## Scope

Single file: `src/components/consumer/ConsumerBillingSection.tsx`.

Config (`src/billing/config.ts`, `TRIP_PASS_PRODUCTS`) already holds the canonical Trip Pass data (name, price, duration, entitlements, Apple product IDs via `src/constants/revenuecat.ts`). No config edits needed.

## Changes

### 1. Enterprise row — hide on iOS, keep on web as "Contact Sales"

In the Organization Plans list, filter `pro-enterprise` out of `proPlans` when `isNativeIOS` is true. On web, keep the existing row but force the price label to `Custom` (already the case in `proPlans`) and the CTA to `Contact Sales` (already the case). Also drop the "$199" that appears in any stale copy — verify the rendered price for `pro-enterprise` reads `Custom`, not `$199/month`.

Result:
- iOS: Enterprise card not shown at all.
- Web: Enterprise card shown with "Custom" pricing and "Contact Sales" CTA (unchanged behavior).

### 2. Trip Passes — replace the single "Get a Trip Pass" banner with two expandable option cards

Today the section is a single gold banner that opens `TripPassModal`. Replace with a "Trip Passes (One-time)" section that mirrors the Available Plans / Organization Plans visual pattern:

```text
Trip Passes (One-time)
For a single trip — no recurring charge.

[ 🎟  Explorer Trip Pass
      $39.99 · 45 days                                +
]
   Features:
   • All Explorer benefits for one trip
   • 25 AI Concierge queries per trip
   • Unlimited photos/videos, extended storage
   • 10 payment splits
   • PDF trip export
   [ Purchase with Apple — Explorer Trip Pass ]   (iOS)
   [ Buy Explorer Trip Pass — $39.99 ]            (web)

[ 🎟  Frequent Chraveler Trip Pass
      $74.99 · 90 days                              +
]
   Features:
   • All Frequent Chraveler benefits for one trip
   • Unlimited AI Concierge
   • Unlimited storage & payment splits
   • Voice Concierge, PDF export, calendar sync
   • Pro Trip creation
   [ Purchase with Apple — FC Trip Pass ]
```

- Prices/durations pulled from `TRIP_PASS_DISPLAY` (already derived from `TRIP_PASS_PRODUCTS`) — no hardcoded dollar amounts.
- Feature bullets derived by mapping each pass's `entitlements` to a short label list local to this component (same style as `plans` / `proPlans` above).
- Purchase button reuses the existing `handleConsumerUpgrade` path with `purchaseType: 'pass'` (already supported by `PurchaseRequest`); on iOS this routes through RevenueCat with the correct `com.chravel.trippass.*` product ID, on web it opens Stripe checkout for the pass price.
- Section is shown to signed-in users regardless of current subscription (a pass is a valid one-off even for Free users; subscribed users can still gift/extend — keep visible, matches App Store Connect where both passes are always purchasable).
- The old compact banner and standalone `TripPassModal` trigger are removed (component import + `tripPassOpen` state deleted since the new inline UI replaces them).

## Non-goals

- No changes to `src/billing/config.ts`, `src/constants/revenuecat.ts`, or `TRIP_PASS_PRODUCTS`.
- No changes to Stripe products, prices, or webhooks.
- No changes to Pro Starter ($49) or Pro Growth ($99) rows.
- No changes to App Store Connect metadata — the two Trip Pass SKUs are already configured; this only makes them visible/purchasable inside the app so Apple review can see them wired up.

## Validation

- `npm run typecheck && npm run lint`
- Manual (mobile viewport 440px): open Settings → Billing → confirm Enterprise card is gone, both Trip Pass cards render and expand, purchase button label reads "Purchase with Apple — …".
- Manual (desktop): Enterprise card still present with "Custom" / "Contact Sales"; Trip Pass cards render with Stripe-style "Buy …" CTAs.
- Existing tests: `src/components/__tests__/UpgradeModal.test.tsx` untouched (UpgradeModal not modified).
