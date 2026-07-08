# App Store Connect — IAP Review Screenshot Upload (v3)

Paste into Claude Code Agentic Browser after signing in to https://appstoreconnect.apple.com.

## Files (in `chravel-iap-screenshots-v3.zip`)

| # | File | Product Apple ID | Reference Name |
|---|------|------------------|----------------|
| 1 | iap-01-frequent-monthly.png       | com.chravel.frequentchraveler.monthly | Frequent Chraveler Monthly |
| 2 | iap-02-explorer-annual.png        | com.chravel.explorer.annual           | Explorer Annual |
| 3 | iap-03-frequent-annual.png        | com.chravel.frequentchraveler.annual  | Frequent Chraveler Annual |
| 4 | iap-04-pro-starter-monthly.png    | com.chravel.pro.starter.monthly       | Starter Pro Monthly |
| 5 | iap-05-pro-growth-monthly.png     | com.chravel.pro.growth.monthly        | Growth Pro Monthly |
| 6 | iap-06-trippass-explorer.png      | com.chravel.trippass.explorer         | Explorer Trip Pass |
| 7 | iap-07-trippass-frequent.png      | com.chravel.trippass.frequent         | Frequent Chraveler Trip Pass |
| 8 | iap-08-explorer-monthly.png       | com.chravel.explorer.monthly          | Explorer Monthly |

All PNGs are 1290×2796 (iPhone 6.9"), well above Apple's 640×920 minimum.

## Agentic Browser Script

```
For each row in the table above, perform these steps in App Store Connect:

1. Navigate to https://appstoreconnect.apple.com/apps
2. Click the Chravel app.
3. In the left sidebar under "Monetization", click "In-App Purchases and Subscriptions".
4. Search for or click the product whose Product ID matches the "Product Apple ID" column.
5. Scroll to the "App Review Information" section.
6. Under "Review Screenshot", click "Choose File" (or the pencil/replace icon if one already exists).
7. Upload the file from the "File" column of the table.
8. In the "Review Notes" field, paste:
   "Screenshot captured from the in-app Settings → Billing panel showing this product on the paywall. CTA reads 'Subscribe with Apple' (or 'Buy with Apple' for Trip Passes) because the app uses StoreKit / RevenueCat for all iOS purchases. No external payment links are present."
9. Click "Save" at the top-right.
10. Verify the product status changes from "Missing Metadata" to "Ready to Submit".

After all 7 uploads succeed, take a screenshot of the IAP list page showing all products in "Ready to Submit" state and report back.
```

## Verification Notes

- Pricing parity: `PricingSection.tsx` (marketing homepage) and `ConsumerBillingSection.tsx` (Settings → Billing) both read from `src/billing/pricingDisplay.ts`, which derives from `src/billing/config.ts`. No hardcoded prices in either component — the two views are guaranteed in sync.
- Confirmed values: Explorer $9.99/mo ($99/yr), Frequent Chraveler $19.99/mo ($199/yr), Starter Pro $49/mo, Growth Pro $99/mo, Enterprise $199/mo, Explorer Trip Pass $39.99 / 45 days, Frequent Chraveler Trip Pass $74.99 / 90 days.
- CTA copy: Screenshots were captured with `?app_context=native` and an iOS WKWebView user agent so `isIOSNativeShell()` returns true, forcing Apple-branded CTAs required by App Store guideline 3.1.1.
