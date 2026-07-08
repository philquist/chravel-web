## Objective
Resolve the App Store Connect IAP submission loop without uploading a new binary unless Apple blocks resubmission or the submitted build’s product IDs do not match App Store Connect.

## What the screenshots show right now

### Done
- The in-app paywall UI exists for:
  - Explorer monthly/annual
  - Frequent Chraveler monthly/annual
  - Starter Pro monthly
  - Growth Pro monthly
  - Explorer Trip Pass
  - Frequent Chraveler Trip Pass
- The app UI shows the corrected prices:
  - Explorer: $9.99/mo, $99/yr
  - Frequent Chraveler: $19.99/mo, $199/yr
  - Starter Pro: $49/mo
  - Growth Pro: $99/mo
  - Explorer Trip Pass: $39.99
  - Frequent Chraveler Trip Pass: $74.99
- App Store Connect shows at least five subscriptions in `Ready to Submit` status.
- App Store Connect’s review screenshot error is specifically dimensional, not content-based.

### Still risky / likely blocking
- The screenshot of App Store Connect shows these Apple product IDs:
  - `com.chravel.app.frequent.monthly`
  - `com.chravel.app.explorer.annual`
  - `com.chravel.app.frequent.annual`
  - `com.chravel.app.pro.starter.monthly`
  - `com.chravel.app.pro.growth.monthly`
- The current repo/config references different IDs:
  - `com.chravel.explorer.monthly`
  - `com.chravel.explorer.annual`
  - `com.chravel.frequentchraveler.monthly`
  - `com.chravel.frequentchraveler.annual`
  - `com.chravel.pro.starter.monthly`
  - `com.chravel.pro.growth.monthly`
  - `com.chravel.trippass.explorer`
  - `com.chravel.trippass.frequent`
- Product IDs are immutable in App Store Connect. If the submitted binary 2.0 (60) asks StoreKit/RevenueCat for IDs that do not exist in App Store Connect/RevenueCat offerings, Apple review can still fail even when metadata says `Ready to Submit`.
- The visible subscription list has five products, but the marketing/app surfaces currently imply eight iOS-purchasable products if Pro is included in iOS:
  1. Explorer Monthly
  2. Explorer Annual
  3. Frequent Chraveler Monthly
  4. Frequent Chraveler Annual
  5. Starter Pro Monthly
  6. Growth Pro Monthly
  7. Explorer Trip Pass
  8. Frequent Chraveler Trip Pass

## Screenshot fix plan

### Required screenshot format
Apple says the App Review Screenshot must meet one of the app screenshot specifications. The safest format is an iPhone screenshot size that App Store Connect accepts broadly:

```text
1290 x 2796 PNG
RGB
No alpha/transparency
No browser chrome
Shows the actual in-app purchase/paywall product clearly
```

### Screenshots to generate
Generate two review screenshots from the existing paywall UI:

1. `explorer-trip-pass-iap-review.png`
   - Target product: Explorer Trip Pass
   - Visible name: `Explorer Trip Pass`
   - Visible price: `$39.99`
   - Visible access window: `45-day access window`
   - Visible CTA: `Get Explorer Pass` or iOS-specific `Buy with Apple`

2. `frequent-chraveler-trip-pass-iap-review.png`
   - Target product: Frequent Chraveler Trip Pass
   - Visible name: `Frequent Chraveler Trip Pass`
   - Visible price: `$74.99`
   - Visible access window: `90-day access window`
   - Visible CTA: `Get Frequent Pass` or iOS-specific `Buy with Apple`

### How I will generate them after approval
- Use Playwright against the local app preview.
- Set mobile viewport to a valid iPhone screenshot size: `1290x2796`.
- Navigate to the billing/subscription/paywall surface.
- Capture the Trip Passes tab twice:
  - once focused on Explorer Trip Pass
  - once focused on Frequent Chraveler Trip Pass
- If the UI cannot show each pass individually, crop/compose each valid screenshot into a 1290x2796 PNG with the selected card centered and enough surrounding UI to prove it is in-app.
- Inspect each output image before delivery for:
  - exact pixel dimensions
  - no alpha channel
  - no clipping
  - product name and price visible
  - CTA visible
  - no external payment link visible
- Save final files under `/mnt/documents` and provide download artifacts.

## Apple Connect cleanup checklist

### 1. Decide the canonical product ID set before touching anything
The next step must be to determine what the submitted iOS build 2.0 (60) actually requests. There are only two safe paths:

#### Path A — Keep build 2.0 (60), align dashboards to the build
Use this if build 2.0 (60) already requests the `com.chravel.app.*` IDs shown in App Store Connect.

Actions:
- Keep the existing binary.
- Make RevenueCat products/packages use the same `com.chravel.app.*` IDs.
- Update repo documentation/config later to match the real production IDs.
- Attach all matching IAPs/subscriptions to version 2.0 (60).

#### Path B — Keep current repo IDs, create matching App Store Connect products
Use this if build 2.0 (60) requests the current repo IDs like `com.chravel.explorer.monthly`.

Actions:
- Create missing App Store Connect products with exactly the current repo IDs.
- Do not try to rename existing `com.chravel.app.*` products; IDs cannot be edited.
- Attach the correctly matched products to version 2.0 (60).

#### Path C — Upload a new binary only if required
Only upload a new binary if:
- version 2.0 cannot be edited/resubmitted,
- build 2.0 (60) requests product IDs that cannot be made available in App Store Connect/RevenueCat,
- StoreKit/RevenueCat is not present/working in the submitted binary,
- or Apple explicitly requires a corrected binary after the IAP metadata is fixed.

### 2. Complete every product Apple can see in-app
For every product shown in the app’s billing/paywall UI, App Store Connect needs:
- status: `Ready to Submit`, `Waiting for Review`, `In Review`, or `Approved`
- price saved
- availability saved
- en-US localization saved
- review screenshot uploaded with valid dimensions
- review notes saved
- product attached to iOS version 2.0 before resubmission

### 3. Confirm subscription group localization
The subscription group must have at least one localization:

```text
Display name: Chravel Plans
Locale: English (U.S.)
```

### 4. Confirm subscription level order
The current screenshot order appears wrong because Frequent Monthly is Level 1 while Explorer Annual/Frequent Annual are lower. Recommended ordering by service level:

```text
Level 1: Growth Pro Monthly
Level 2: Starter Pro Monthly
Level 3: Frequent Chraveler Annual
Level 4: Frequent Chraveler Monthly
Level 5: Explorer Annual
Level 6: Explorer Monthly
```

If Apple only allows levels inside one subscription group and these products are all in one group, keep highest service first. If Pro and consumer plans are meant to be separate upgrade families, use separate subscription groups.

## App code parity plan

### Files to inspect/possibly update after approval
- `src/constants/revenuecat.ts`
  - product IDs
  - required iOS product list
  - entitlement mapping
- `src/billing/config.ts`
  - prices
  - Apple product IDs
  - plan names
  - access-period logic for subscriptions/pass products
- `src/billing/pricingDisplay.ts`
  - marketing/settings display strings
- `src/components/consumer/ConsumerBillingSection.tsx`
  - logged-in Settings/Billing surface
  - Trip Pass visibility
  - Apple purchase CTAs
  - Restore Purchases
  - cancellation/manage wording
- `src/integrations/revenuecat/revenuecatClient.ts`
  - purchase by product ID
  - trip pass purchase calls
  - offering audit
  - entitlement restore/sync
- `scripts/validate-iap-product-ids.mjs`
  - canonical product ID list
- `appstore/asc-products.json`
  - App Store Connect product snapshot
- `appstore/IAP_REVIEW_RECOVERY.md`
  - human runbook

### Required code/business rules
- Names and prices must be pulled from one source of truth.
- Logged-in billing/settings must include both Trip Pass options, not just the marketing page.
- iOS CTAs must use Apple-compliant copy:
  - subscriptions: `Subscribe with Apple`
  - trip passes: `Buy with Apple`
- Web can still use Stripe where allowed.
- iOS must not show external Stripe checkout links for Apple-controlled digital goods.
- `Restore Purchases` must remain visible on iOS.
- Cancelled subscriptions must keep feature access until `current_period_end` / RevenueCat expiration date.
- Refund policy and subscription policy should be visible through app/legal surfaces, not invented ad hoc inside the paywall.

## Apple review notes to paste per IAP

```text
Screenshot captured from the in-app Settings > Billing panel showing this product on the Chravel paywall. Purchases on iOS are processed through Apple In-App Purchase via StoreKit/RevenueCat. No external payment links are shown for Apple-controlled digital goods. If a user cancels an auto-renewable subscription, access remains active until the end of the already-paid billing period.
```

For Trip Pass products:

```text
Screenshot captured from the in-app Settings > Billing panel showing this Trip Pass on the Chravel paywall. The Trip Pass is purchased through Apple In-App Purchase via StoreKit/RevenueCat. It grants the displayed premium access window and does not create a recurring subscription. No external payment links are shown for this purchase on iOS.
```

## Claude prompt to use after screenshots are generated

```text
This is ChravelApp. Stack: React 18 / TypeScript / Supabase / Tailwind / RevenueCat for iOS IAP.

Goal:
Make Apple IAP, RevenueCat, App Store Connect metadata, and the logged-in Settings > Billing UI fully consistent before resubmitting iOS version 2.0 (60), without uploading a new binary unless product ID mismatch or App Store Connect forces it.

Current evidence:
- App Store Connect currently shows these subscription product IDs in screenshots:
  - com.chravel.app.frequent.monthly
  - com.chravel.app.explorer.annual
  - com.chravel.app.frequent.annual
  - com.chravel.app.pro.starter.monthly
  - com.chravel.app.pro.growth.monthly
- Current repo/config may reference a different set:
  - com.chravel.explorer.monthly
  - com.chravel.explorer.annual
  - com.chravel.frequentchraveler.monthly
  - com.chravel.frequentchraveler.annual
  - com.chravel.pro.starter.monthly
  - com.chravel.pro.growth.monthly
  - com.chravel.trippass.explorer
  - com.chravel.trippass.frequent
- Product IDs are immutable in App Store Connect. Do not rename IDs. Align RevenueCat/app code/ASC around the IDs actually requested by the submitted build, or require a new binary only if unavoidable.

Files to inspect:
- src/constants/revenuecat.ts
- src/billing/config.ts
- src/billing/pricingDisplay.ts
- src/components/consumer/ConsumerBillingSection.tsx
- src/integrations/revenuecat/revenuecatClient.ts
- scripts/validate-iap-product-ids.mjs
- appstore/asc-products.json
- appstore/IAP_REVIEW_RECOVERY.md

Requirements:
1. Verify the canonical iOS product IDs against the submitted build 2.0 (60), RevenueCat offerings, and App Store Connect.
2. Ensure the logged-in Settings > Billing UI includes both Trip Pass options:
   - Explorer Trip Pass, $39.99, 45 days
   - Frequent Chraveler Trip Pass, $74.99, 90 days
3. Ensure subscriptions match:
   - Explorer $9.99/mo, $99/yr
   - Frequent Chraveler $19.99/mo, $199/yr
   - Starter Pro $49/mo
   - Growth Pro $99/mo
4. iOS purchase CTAs must use Apple IAP/RevenueCat only. No Stripe/external checkout links for Apple-controlled digital purchases.
5. Restore Purchases must remain available on iOS.
6. If a subscription is cancelled before the next billing date, paid access must continue until the RevenueCat/App Store expiration date.
7. Update the IAP validation script and appstore/asc-products.json to reflect the final canonical IDs.
8. Add/update tests or validation scripts proving pricing/product-ID parity.
9. Do not modify demo mode mock data.
10. Keep changes surgical.

Screenshots generated for App Review:
- explorer-trip-pass-iap-review.png
- frequent-chraveler-trip-pass-iap-review.png

Definition of done:
- node scripts/validate-iap-product-ids.mjs passes against the final App Store Connect product list.
- Settings > Billing shows the same names/prices/products as the marketing page.
- Both Trip Passes are purchasable via RevenueCat on iOS or clearly blocked until matching RevenueCat products exist.
- Cancellation/access-until-period-end behavior is verified in code.
- Final App Store Connect checklist identifies any product still Missing Metadata or not attached to iOS 2.0 (60).
```

## Implementation sequence after you approve this plan

1. Generate the two valid-dimension Trip Pass App Review screenshots and inspect them.
2. Produce an updated Apple Connect checklist based on the screenshots you uploaded.
3. Audit the product ID source of truth across app config, RevenueCat config, validation script, and App Store Connect snapshot.
4. If needed, propose the smallest code/doc changes to align IDs, prices, CTAs, and settings billing parity.
5. Validate with product-ID script, targeted tests, and visual inspection of Settings > Billing.
6. Deliver:
   - two PNG artifacts
   - final App Store Connect action checklist
   - exact Claude prompt
   - explicit “do not upload new binary unless…” decision tree

## Key warning
The biggest unresolved issue is not screenshot dimensions. It is product ID drift. Your App Store Connect screenshot appears to use `com.chravel.app.*` IDs, while the current repo references `com.chravel.*` IDs. If build 2.0 (60) and RevenueCat do not request the same IDs that are `Ready to Submit` in App Store Connect, resubmission can keep failing even after the screenshots upload correctly.