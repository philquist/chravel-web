# Browser-Agent Script — RevenueCat Audit (Chravel)

> Paste this to a browser agent with access to the Chravel RevenueCat dashboard.
> **READ-ONLY. Do not create, edit, or delete entitlements, offerings, products, or integrations.**
> **Do not paste API keys or webhook secrets into chat.** Safe to copy: entitlement IDs, offering IDs, package
> IDs, product identifiers. Redact `rcb_…`/`appl_…`/`goog_…` keys and any webhook auth header value.

## Goal
Confirm RevenueCat entitlements/offerings/products match the code and that store + webhook wiring is correct.
Also help resolve the **dual-config ambiguity**: the repo has both a web-billing (`rcb_`) path
(`src/config/revenuecat.ts`) and a native (`appl_`/`goog_`) path (`src/constants/revenuecat.ts`).

## Canonical values to diff against
**Entitlement IDs** (`src/constants/revenuecat.ts`): `chravel_explorer`, `chravel_frequent_chraveler`,
`chravel_pro_starter`, `chravel_pro_growth`, `chravel_pro_enterprise`.
**Product identifiers** (must match App Store Connect / Google Play):
`com.chravel.explorer.monthly`, `com.chravel.explorer.annual`,
`com.chravel.frequentchraveler.monthly`, `com.chravel.frequentchraveler.annual`,
`com.chravel.explorer.pass45`, `com.chravel.frequentchraveler.pass90`.
**Display pricing:** Explorer $9.99/mo, $99/yr · Frequent Chraveler $19.99/mo, $199/yr · passes $39.99 / $74.99.

## Steps & what to capture
1. **Project / Apps**: record project name, and each app (iOS bundle ID, Android package, and any Web Billing app).
   Note **sandbox vs production** indicators. **Key question:** is there a **Web Billing** app/store configured
   (would use an `rcb_` key), or only native App Store / Play Store apps? Record the answer — it resolves the
   dual-config ambiguity.
2. **Entitlements**: list every entitlement ID + attached products. Confirm the 5 canonical IDs exist; flag extras
   or missing ones, and any entitlement with no attached product.
3. **Offerings**: list each offering ID, whether it's the **current/default**, and its packages
   (package ID -> product identifier). Confirm packages reference the canonical product IDs.
4. **Products**: list each product identifier, type (subscription/non-consumable), the store it comes from, and
   status. Confirm they match the canonical list and the App Store Connect IDs (compare with the ASC audit).
5. **Integrations**: note whether **App Store Connect** and/or **Stripe / Web Billing** integrations are connected
   (status only — redact secrets). Confirm the App Store Connect integration is active for production.
6. **Webhooks / API keys** (`Project settings`): record webhook target URL(s) — confirm one points at the
   production `…/functions/v1/revenuecat-webhook` — and that an Authorization header is configured (redact value;
   it must equal the edge secret `REVENUECAT_WEBHOOK_SECRET`). List public/secret API key **names/types** only.
7. **Customer history** (optional): for a known sandbox test user, note recent events (purchase/renewal/expiration)
   to confirm flow — redact PII.

## Output
- Tables: Entitlement ID · attached products · status — and — Offering ID · current? · package -> product.
- Product table: identifier · type · store · status · matches-code?
- A **mismatch summary** (Critical/High/Medium/Low) for IDs that don't match code, missing/stale products,
  inactive integrations, or webhook misconfig.
- Explicit answers: "Is Web Billing (`rcb_`) configured? YES/NO." · "Production webhook points at
  `revenuecat-webhook`? YES/NO." · "All 5 entitlement IDs present and match code? YES/NO."
- Screenshots: Entitlements, Offerings, Products, Integrations status (secrets redacted).
