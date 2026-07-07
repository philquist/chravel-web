## What the screenshots show

### Done

| Area | Evidence | Meaning |
|---|---|---|
| Subscription group exists | `Chravel Subscriptions` page exists | The auto-renewable subscription group has been created. |
| Four consumer subscriptions exist | Explorer Monthly, Explorer Annual, Frequent Chraveler Monthly, Frequent Chraveler Annual are listed | The core subscription product IDs are created in App Store Connect. |
| Subscription levels are assigned | Levels 1–4 are shown | Upgrade/downgrade ordering exists, though the order may need review. |
| Two trip pass IAPs exist | Explorer Trip Pass and Frequent Chraveler Trip Pass are listed under In-App Purchases | The one-time trip pass products have been created. |
| One trip pass is close | `Chravel Frequent Chraveler Trip Pass` says `Ready to Submit` | Its required metadata is likely complete, but it still has not been submitted/attached to the app version. |
| Existing reviewed build is known | Apple reviewed version `2.0 (60)` | The rejection is tied to the current app version/build, not an unknown binary. |

### Not done / blocking review

| Item | Current status | Required fix |
|---|---|---|
| Subscription metadata | All four subscriptions show `Missing Metadata` | Each subscription needs required metadata completed: price, availability, localization, and App Review screenshot. |
| Subscription group localization | `Localization` section shows `Create` | Add at least `en-US` localization for the subscription group. |
| Explorer Trip Pass | `Missing Metadata` | Complete its required metadata before it can be submitted. |
| Frequent Trip Pass | `Ready to Submit` | Submit it, and attach it to the app version if the app references it. |
| IAP submission with app version | Apple says products were not submitted for review | Attach the subscriptions/IAPs to iOS app version `2.0 (60)` and resubmit the version. |
| App Review screenshot per product | Apple doc requires it | Each subscription/IAP needs an App Review screenshot showing the purchase/paywall in the app. This is separate from marketing screenshots. |

## The “new build / new binary” confusion

Apple uses two similar phrases that are easy to misread:

1. **“Your first subscription must be submitted with a new app version.”**  
   This means the first subscription must be attached to an App Store app version submission. It does **not automatically mean you need to upload a new binary**.

2. **“Upload a new binary” in the rejection text.**  
   This is Apple’s generic 2.1(b) language. If build `2.0 (60)` is still attached to an editable rejected app version, you should usually be able to resubmit the same build after attaching the IAPs/subscriptions and completing metadata.

### Practical rule

You should **not upload a new binary yet** unless App Store Connect blocks resubmission or Apple explicitly says the binary itself is wrong.

Use the existing app version `2.0 (60)` if:

- The version is in a rejected / editable state.
- Build `60` is still selected on the version page.
- The only rejection reason is that referenced IAP products were not submitted.
- You can attach IAPs/subscriptions in the version page’s **In-App Purchases and Subscriptions** section.

Upload a new binary only if:

- App Store Connect will not let you edit/resubmit version `2.0`.
- The IAP/subscription section is unavailable for the current version.
- Apple later says the app binary/paywall behavior itself is defective.

## Product-by-product checklist

### Auto-renewable subscriptions

These four products exist but are not review-ready because all show `Missing Metadata`:

| Product | Product ID | Status | Action |
|---|---|---|---|
| Chravel Explorer Monthly | `com.chravel.explorer.monthly` | Missing Metadata | Complete metadata, price, availability, localization, review screenshot. |
| Chravel Explorer Annual | `com.chravel.explorer.annual` | Missing Metadata | Complete metadata, price, availability, localization, review screenshot. |
| Chravel Frequent Chraveler Monthly | `com.chravel.frequentchraveler.monthly` | Missing Metadata | Complete metadata, price, availability, localization, review screenshot. |
| Chravel Frequent Chraveler Annual | `com.chravel.frequentchraveler.annual` | Missing Metadata | Complete metadata, price, availability, localization, review screenshot. |

Recommended level order should usually be by service level, not necessarily monthly before annual:

```text
Level 1: Frequent Chraveler Annual
Level 2: Frequent Chraveler Monthly
Level 3: Explorer Annual
Level 4: Explorer Monthly
```

Apple says the highest level of service should be first. Annual vs monthly of the same tier can be adjacent, but Frequent Chraveler should normally rank above Explorer.

### Trip passes

| Product | Product ID | Current screenshot status | Action |
|---|---|---|---|
| Chravel Explorer Trip Pass | `com.chravel.trippass.explorer` | Missing Metadata | Complete metadata, then submit/attach. |
| Chravel Frequent Chraveler Trip Pass | `com.chravel.trippass.frequent` | Ready to Submit | Submit/attach to the app version if referenced in the app. |

Important: your screenshot shows both trip passes as **Non-Consumable**. If these passes are truly time-limited 45-day / 90-day access passes, verify the product type before submission. Apple’s more appropriate type for fixed-duration access is often **Non-Renewing Subscription**. If the type is wrong, you cannot edit the product type after creation; you would need to create replacement product IDs. If the pass unlocks a permanent one-time entitlement for a specific trip, Non-Consumable may be acceptable.

## Why Save may have been blocked after uploading screenshots

The App Review screenshot upload alone does not make a product complete. App Store Connect can still block Save or keep `Missing Metadata` if any required field is incomplete.

Common causes:

1. **No localization saved**  
   Each product needs at least one localization, usually `en-US`, with Display Name and Description.

2. **Subscription group localization missing**  
   Your screenshot shows the group localization section still has `Create`; add it.

3. **Price/schedule not saved**  
   Each subscription needs a selected price tier and start date/availability.

4. **Availability not enabled**  
   At minimum, enable United States territory. If no territory is selected, the product is not eligible.

5. **Screenshot still processing or invalid**  
   The App Review screenshot must satisfy Apple screenshot specs for a supported device. Wait for upload processing to finish before saving.

6. **A nested Save button was missed**  
   App Store Connect has multiple saves: localization save, price save, product save, and app version save. Missing one nested save can leave the product in `Missing Metadata`.

## Exact recovery steps

### Step 1 — Fix the subscription group

Go to:

```text
App Store Connect → My Apps → ChravelApp → Monetization → Subscriptions → Chravel Subscriptions
```

Then:

1. Click **Localization → Create**.
2. Choose **English (U.S.) / en-US**.
3. Set the subscription group display name, for example:

```text
Chravel Plans
```

4. Save.

### Step 2 — Fix each subscription product

For each of the four subscriptions:

```text
Explorer Monthly
Explorer Annual
Frequent Chraveler Monthly
Frequent Chraveler Annual
```

Open the product and confirm all required sections are complete:

1. **Reference Name** exists.
2. **Product ID** matches exactly.
3. **Subscription Duration** is correct:
   - Monthly products: 1 month
   - Annual products: 1 year
4. **Price** is selected and saved for the U.S.
5. **Availability** includes United States at minimum.
6. **Localization en-US** exists:
   - Display Name
   - Description
7. **App Review Screenshot** is uploaded and processed.
8. **Review Notes** are added if useful.
9. Click every available **Save** button.
10. Return to the subscription group list and confirm the status changes from `Missing Metadata` to `Ready to Submit`.

### Step 3 — Fix the trip passes

Go to:

```text
App Store Connect → My Apps → ChravelApp → Monetization → In-App Purchases
```

For `Chravel Explorer Trip Pass`:

1. Complete missing metadata.
2. Add `en-US` localization.
3. Add price.
4. Enable United States availability.
5. Upload App Review screenshot.
6. Save until status becomes `Ready to Submit`.

For `Chravel Frequent Chraveler Trip Pass`:

1. Confirm metadata is truly complete.
2. Confirm United States availability.
3. Confirm App Review screenshot exists.
4. Leave it ready for attachment/submission.

### Step 4 — Attach products to existing app version 2.0 (60)

Go to:

```text
App Store Connect → My Apps → ChravelApp → App Store → iOS App → Version 2.0
```

Then find:

```text
In-App Purchases and Subscriptions
```

Add every product the app references:

```text
com.chravel.explorer.monthly
com.chravel.explorer.annual
com.chravel.frequentchraveler.monthly
com.chravel.frequentchraveler.annual
com.chravel.trippass.explorer
com.chravel.trippass.frequent
```

Then:

1. Confirm build `2.0 (60)` is still selected.
2. Do not upload a new binary unless App Store Connect forces it.
3. Save the app version.
4. Submit the app version for review again.

### Step 5 — Add App Review notes

Use concise notes like:

```text
Chravel uses Apple In-App Purchase for iOS consumer subscriptions and trip passes. The attached products are used by the in-app paywall and are submitted with this app version for review. The existing build 2.0 (60) already contains the StoreKit/RevenueCat purchase flow; this resubmission completes the missing App Store Connect product submission metadata.
```

If trip passes remain Non-Consumable, only say they are permanent one-time unlocks if that is true. Do not describe them as 45/90-day expiring passes unless the product type supports that behavior.

## Definition of done

Before resubmitting, every referenced product should be in one of these states:

```text
Ready to Submit
Waiting for Review
In Review
Approved
```

None should say:

```text
Missing Metadata
Developer Action Needed
Rejected
```

## Most likely reason this has not worked yet

The products were created, but they were not all metadata-complete and not all attached/submitted with app version `2.0 (60)`. Apple rejected the app because the binary references subscriptions/IAPs that App Review could not review as submitted products.

The fix is not primarily a code fix or binary upload. It is an App Store Connect product-completion and app-version attachment workflow.