# App Store Connect IAP Review Recovery

Use this when App Review rejects Chravel with `Guideline 2.1(b) - Performance - App Completeness` because in-app purchases or subscriptions were referenced but not submitted for review.

## Current diagnosis from screenshots

### Done

| Area | Evidence | Meaning |
|---|---|---|
| Subscription group exists | `Chravel Subscriptions` page exists | The auto-renewable subscription group has been created. |
| Consumer subscriptions exist | Explorer Monthly, Explorer Annual, Frequent Chraveler Monthly, Frequent Chraveler Annual are listed | The core consumer subscription products exist. |
| Subscription levels exist | Levels 1-4 are shown | Upgrade/downgrade ordering exists, but should be ordered by service level. |
| Trip pass products exist | Explorer Trip Pass and Frequent Chraveler Trip Pass appear under In-App Purchases | One-time pass products exist in App Store Connect. |
| Existing build is identified | Apple reviewed version `2.0 (60)` | The rejection is tied to the current submitted app version/build. |

### Still blocking review

| Item | Screenshot status | Required fix |
|---|---|---|
| Four subscriptions | `Missing Metadata` | Complete price, availability, localization, and App Review screenshot for each. |
| Subscription group localization | `Create` button shown | Add at least `en-US` subscription group localization. |
| Explorer Trip Pass | `Missing Metadata` | Complete metadata, price, availability, localization, and App Review screenshot. |
| Frequent Trip Pass | `Ready to Submit` | Attach/submit it with the app version. |
| App version attachment | Apple says IAPs were not submitted | Attach every referenced product to iOS version `2.0 (60)` before resubmitting. |

## Why Apple says “new app version” or “new binary”

Apple’s warning says the first subscription must be submitted with a **new app version**. That means the subscription must be attached to an App Store version submission. It does not automatically mean a new binary upload is required.

Do **not** upload a new binary yet if all of these are true:

- Version `2.0` is rejected/editable.
- Build `60` is still selected on the version page.
- The only rejection is missing/unsubmitted IAP products.
- The version page lets you add products in **In-App Purchases and Subscriptions**.

Upload a new binary only if App Store Connect blocks resubmission, the version cannot be edited, or Apple later says the binary/paywall behavior itself is defective.

## Critical product ID check

The current App Store Connect product list must include exactly the products the app can request:

```text
com.chravel.explorer.monthly
com.chravel.explorer.annual
com.chravel.frequentchraveler.monthly
com.chravel.frequentchraveler.annual
com.chravel.trippass.explorer
com.chravel.trippass.frequent
```

If build `2.0 (60)` was compiled before the trip-pass IDs were aligned to `com.chravel.trippass.*`, verify in RevenueCat/App Store Connect whether the binary requests older IDs. If the submitted binary requests older IDs that do not exist in App Store Connect, either create matching products in App Store Connect/RevenueCat or upload a corrected binary.

## Step-by-step recovery

### 1. Create subscription group localization

Path:

```text
App Store Connect -> My Apps -> ChravelApp -> Monetization -> Subscriptions -> Chravel Subscriptions
```

Actions:

1. In **Localization**, click **Create**.
2. Choose **English (U.S.) / en-US**.
3. Display name: `Chravel Plans`.
4. Save.

### 2. Complete every subscription

For each product below, open it and complete every required section:

```text
Chravel Explorer Monthly
Chravel Explorer Annual
Chravel Frequent Chraveler Monthly
Chravel Frequent Chraveler Annual
```

Required fields:

1. Reference name.
2. Product ID.
3. Correct duration: monthly = 1 month, annual = 1 year.
4. U.S. price tier saved.
5. United States availability enabled.
6. `en-US` localization with display name and description.
7. App Review screenshot uploaded and processed.
8. Review notes if needed.
9. Save at the localization/product page level.

Return to the group list and confirm each product changes from `Missing Metadata` to `Ready to Submit`.

### 3. Complete trip passes

Path:

```text
App Store Connect -> My Apps -> ChravelApp -> Monetization -> In-App Purchases
```

For `Chravel Explorer Trip Pass`:

1. Complete missing metadata.
2. Add `en-US` localization.
3. Add price.
4. Enable United States availability.
5. Upload App Review screenshot.
6. Save until status becomes `Ready to Submit`.

For `Chravel Frequent Chraveler Trip Pass`:

1. Confirm metadata is complete.
2. Confirm United States availability.
3. Confirm App Review screenshot exists.
4. Keep it ready for attachment/submission.

### 4. Attach products to version 2.0 (60)

Path:

```text
App Store Connect -> My Apps -> ChravelApp -> App Store -> iOS App -> Version 2.0
```

In **In-App Purchases and Subscriptions**, add every referenced product:

```text
com.chravel.explorer.monthly
com.chravel.explorer.annual
com.chravel.frequentchraveler.monthly
com.chravel.frequentchraveler.annual
com.chravel.trippass.explorer
com.chravel.trippass.frequent
```

Then confirm build `2.0 (60)` is still selected, save the app version, and resubmit.

### 5. Paste-ready App Review notes

```text
Chravel uses Apple In-App Purchase for iOS consumer subscriptions and trip passes. The attached products are used by the in-app paywall and are submitted with this app version for review. The existing build 2.0 (60) already contains the StoreKit/RevenueCat purchase flow; this resubmission completes the missing App Store Connect product metadata and submission attachment.
```

## Save button troubleshooting

If Save is disabled or does not persist after screenshot upload, check these in order:

1. Screenshot upload has finished processing.
2. A valid `en-US` localization exists and has its own nested save completed.
3. Price tier is saved.
4. United States availability is selected.
5. Subscription group localization is saved.
6. The product page itself is saved after nested sections are saved.
7. Browser cache/session is not stale; hard refresh App Store Connect and reopen the product.

## Definition of done

Before resubmitting, every referenced product should be one of:

```text
Ready to Submit
Waiting for Review
In Review
Approved
```

No referenced product should say:

```text
Missing Metadata
Developer Action Needed
Rejected
```

## Product type warning for trip passes

The screenshot shows trip passes as **Non-Consumable**. If these passes are fixed-duration 45-day/90-day access products, verify whether they should instead be **Non-Renewing Subscriptions**. Product type cannot be edited after creation, so a wrong type requires replacement product IDs. If they are permanent one-time unlocks for a trip, Non-Consumable may be acceptable.