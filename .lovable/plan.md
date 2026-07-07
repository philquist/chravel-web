## Reply to paste back to Claude in App Store Connect

Below is a copy-paste answer for Claude. It gives explicit go-ahead, resolves all 4 decisions, and locks in the naming/group/copy so nothing gets guessed. After Claude finishes, I'll generate the Lovable/codebase sync prompt so the app's product IDs match exactly what ends up in ASC.

---

**Paste this to Claude:**

Confirmed — go ahead and create the 4 missing products. I accept that Apple product IDs are permanent and that these exact IDs, names, prices, and group assignments will be the canonical source of truth going forward. Do NOT touch the 3 existing correct products, the 5 `.app.`-prefixed "Chravel Memberships" products, or the extra `com.chravel.explorer.monthly`. Leave all of those exactly as they are — I will clean up / delete the `.app.` duplicates and the stray monthly Explorer myself later.

Answers to your 4 questions:

**1. Subscription group placement**
Create a **new, separate** subscription group for the Pro tiers.
- Group Reference Name: `Chravel Organization Plans`
- Both `com.chravel.pro.starter.monthly` and `com.chravel.pro.growth.monthly` go in this new group.
- Rationale: Org-tier plans must be independently held from individual Explorer/Frequent plans (a Pro admin may also be an individual subscriber). Keeping them in a separate group avoids Apple's mutual-exclusion behavior.

**2. Reference Name format**
Use the **"Chravel [Name]" pattern** for consistency with the 3 existing correct products. Exact reference names:
- `com.chravel.pro.starter.monthly` → **Chravel Starter Pro Monthly**
- `com.chravel.pro.growth.monthly` → **Chravel Growth Pro Monthly**
- `com.chravel.trippass.explorer` → **Chravel Explorer Trip Pass**
- `com.chravel.trippass.frequent` → **Chravel Frequent Chraveler Trip Pass**

**3. Display Name + Description (en-US, use verbatim)**

`com.chravel.pro.starter.monthly`
- Display Name: `Starter Pro`
- Description: `Chravel Starter Pro for small organizations. Manage up to 5 pro trips with roles, permissions, broadcasts, and organization-wide admin controls. Billed monthly. Auto-renews until canceled.`

`com.chravel.pro.growth.monthly`
- Display Name: `Growth Pro`
- Description: `Chravel Growth Pro for growing teams. Unlimited pro trips, advanced roles and permissions, priority support, broadcast channels, and organization-wide admin controls. Billed monthly. Auto-renews until canceled.`

`com.chravel.trippass.explorer` (Non-Consumable)
- Display Name: `Explorer Trip Pass`
- Description: `One-time 45-day Explorer access pass. Unlocks Explorer-tier features for a single trip window. Does not auto-renew.`

`com.chravel.trippass.frequent` (Non-Consumable)
- Display Name: `Frequent Chraveler Trip Pass`
- Description: `One-time 90-day Frequent Chraveler access pass. Unlocks Frequent Chraveler-tier features for a single trip window. Does not auto-renew.`

Review Notes (paste verbatim into every one of these 4 + all uploads later): `Screenshot captured from the in-app Settings → Billing panel showing this product on the paywall. CTA reads 'Subscribe with Apple' (or 'Buy with Apple' for Trip Passes) because the app uses StoreKit / RevenueCat for all iOS purchases. No external payment links are present.`

**4. Pricing (US tier — confirm the tier label before saving; do NOT proceed if the tier doesn't map cleanly to the exact USD amount)**
- Starter Pro Monthly: **$49.00 USD / month**, 1 month duration
- Growth Pro Monthly: **$99.00 USD / month**, 1 month duration
- Explorer Trip Pass: **$39.99 USD** one-time (Non-Consumable)
- Frequent Chraveler Trip Pass: **$74.99 USD** one-time (Non-Consumable)

**Sequence to follow, then STOP:**
1. Create the new "Chravel Organization Plans" subscription group.
2. Create the 2 Pro subscriptions in it with the IDs/names/prices/descriptions above.
3. Create the 2 Trip Passes as Non-Consumable In-App Purchases with the IDs/names/prices/descriptions above.
4. For the 3 existing correct products (Explorer Annual, Frequent Chraveler Monthly, Frequent Chraveler Annual): paste the Review Notes verbatim into the App Review Information field and Save. Do NOT edit their reference names, prices, or group.
5. For all 7 products: leave the Review Screenshot slot empty — I'll upload those myself.
6. Do NOT attach anything to Version 2.0 yet. Do NOT resubmit. Stop and report back with a per-product table (ID · Reference Name · Group · Duration · US Price · Status) so I can verify before uploads.

Once you report back and I've uploaded the 7 screenshots, I'll give you a fresh go-ahead for Phase 2 (attach all 7 to Version 2.0) and Phase 3 (Submit to App Review).

Re: "Clog" — that was autocorrect for **Lovable**. After you finish, I'll generate the Lovable prompt to sync the codebase (`src/constants/stripe.ts`, RevenueCat product identifiers, and `src/billing/config.ts`) to the exact IDs you end up saving. No code changes happen until ASC is locked in.

---

## What I'll do on my side after Claude reports back

- Take Claude's final per-product table and produce a Lovable prompt that updates: RevenueCat product identifiers, `src/constants/stripe.ts` Pro tier price IDs (web-Stripe parity later), `src/billing/config.ts` display prices, and the DevBillingPreview mapping so `iap-04/05/06/07` continue to render the exact new IDs.
- Regenerate `iap-04` through `iap-07` screenshots against the new IDs so the printed "Apple Product ID:" line on each PNG matches ASC exactly. (`iap-01/02/03` stay as-is since those IDs already match.)
- Deliver the 4 refreshed PNGs individually + a new zip.

Nothing in the app code or screenshots changes until you confirm ASC creation succeeded.
