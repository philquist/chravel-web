# App Store Launch Readiness Audit (REWRITTEN — TRUE STATE)
## Chravel — Group Travel & Event Platform

**Audit Date:** June 4, 2026
**Supersedes:** Jan 10, 2026 audit (which was materially stale — see §2)
**Scope:** This repo (`chravel-web`) — the React/Vite web + PWA shell that is wrapped by the native
iOS app. The native binary, Apple IAP, `Info.plist`, entitlements, and push-to-production live in the
**separate `chravel-mobile` repo** and in the App Store Connect / RevenueCat dashboards (see §6).

---

## 1) EXECUTIVE SUMMARY

**This web repo is submission-ready for every App Store surface it owns.** A three-track audit
(billing boundary · auth + account deletion · iOS config / permissions / reviewer-facing copy) plus
direct file verification confirms that the items most likely to trigger an Apple rejection are already
implemented correctly:

- ✅ **Stripe-vs-Apple-IAP boundary** — consumer digital subscriptions are blocked from web/Stripe
  checkout inside any native shell, enforced server-side at the edge function (not just client UI).
- ✅ **In-app account deletion** (Guideline 5.1.1) — full UI → RPC → cron-executed data purge with a
  30-day grace period and `auth.users` deletion.
- ✅ **Sign in with Apple** — present alongside Google (required since a third-party login is offered),
  using system-browser OAuth in native contexts (no embedded-WebView OAuth).
- ✅ **Privacy Policy + Terms**, screenshots, demo/reviewer account, deep links / Universal Links, and
  **zero reviewer-facing placeholder/"coming soon" copy** (all mock/admin surfaces are gated).

**The remaining genuine blockers are NOT in this repo.** They are native-shell + dashboard tasks owned
by `chravel-mobile` and a human with Apple Developer / RevenueCat access (§6). None can be resolved from
`chravel-web`.

**Verdict for this repo:** ready. **Verdict for submission overall:** gated on the §6 cross-repo /
dashboard checklist.

---

## 2) CORRECTION OF THE PRIOR (Jan 10 2026) AUDIT

The previous version of this file listed two open **P1** blockers. Both are now **closed** — verified by
direct inspection of the current tree. Do not re-implement them:

| Prior "open" P1 | Actual status | Evidence |
|---|---|---|
| Account Deletion RPC not implemented | ✅ **Implemented** | `supabase/migrations/20260110000000_account_deletion_rpc.sql` defines `request_account_deletion()`, `cancel_account_deletion()`, `get_account_deletion_status()`; executor in `supabase/functions/process-account-deletions/index.ts` |
| OAuth UI buttons not rendered | ✅ **Implemented** | `src/components/AuthModal.tsx:447-495` (Google) and `:498-537` (Apple), wired to `useAuth` `signInWithGoogle`/`signInWithApple` |

The prior audit also referenced native files (`AppDelegate.swift`, `App.entitlements`, `capacitor.config.ts`)
as if they lived here. They do **not** exist in `chravel-web` — `package.json` carries no `@capacitor/*`
deps and only `@revenuecat/purchases-js` (web SDK). Those artifacts live in `chravel-mobile`.

---

## 3) COMPLIANCE MATRIX (with file:line evidence)

| Apple requirement | Status | Evidence |
|---|---|---|
| **In-app account deletion** (5.1.1) | ✅ | UI `src/components/consumer/ConsumerGeneralSettings.tsx:341-353` (type-`DELETE` + password re-auth + status check `:63-89`); RPCs `supabase/migrations/20260110000000_account_deletion_rpc.sql`; executor `supabase/functions/process-account-deletions/index.ts` (anonymize chat, orphan shared records, delete 32+ user tables, purge storage buckets, `auth.admin.deleteUser`); 30-day grace + cancel path |
| **Sign in with Apple** (since Google offered) | ✅ | `src/components/AuthModal.tsx:498-537`; `useAuth.tsx` `signInWithApple`; native system-browser OAuth via `src/utils/installedAuthBrowser.ts` (Capacitor Browser → `ChravelNative.openOAuthUrl` → `location.assign`), avoiding Google's `disallowed_useragent` |
| **Stripe (web) vs Apple IAP (iOS)** (3.1.1) | ✅ | Server-side block: `supabase/functions/create-checkout/checkoutTier.ts` `shouldBlockConsumerStripeCheckout(platform, userAgent)`, applied to consumer subs + Trip Passes in `create-checkout/index.ts`; centralized platform detection `src/utils/platformDetection.ts` (`detectNativeBillingPlatform` fails closed to non-web); Pro/B2B web-checkout exception is intentional and allowed |
| **Entitlement state not stale** | ✅ | Backend-resolved via `check-subscription`; cached + refreshed on visibility change in `useConsumerSubscription.tsx`; native paywall reads RevenueCat entitlements, web paywall returns null on native |
| **Privacy Policy / Terms links** | ✅ | Routes `/privacy`, `/terms`, `/sms-terms` (public); linked in `src/components/native/NativeSettings.tsx` and `src/components/landing/FooterSection.tsx` |
| **No reviewer-facing placeholder/mock/"coming soon"** | ✅ | Mock/admin surfaces gated by `src/components/InternalAdminRoute.tsx` (super-admin or explicit demo-preview); `MobileBottomNav` `comingSoon` is an internal flag that **hides** tabs (no visible text); `revenuecat.ts`/`iap.ts` "PLACEHOLDER"/"SCAFFOLD" strings are code comments, not shipped UI |
| **Hidden/admin features not leaked** | ✅ | `/recs`, `/advertiser`, `/admin/*`, `/organizations*` all behind `InternalAdminRoute` |
| **Screenshots + metadata + demo account** | ✅ | `appstore/screenshots/` (8× iPhone 6.7", 4× iPad 12.9"); `appstore/metadata/review_notes.md` (demo `demo@chravel.app` + 9-step path); usage strings in `appstore/INFO_PLIST_ADDITIONS.md` |
| **Deep links / Universal Links** | ✅ | Static `public/.well-known/apple-app-site-association` (real Team ID `2T6WY43H3X`, full route list incl. `/j/*`, `/auth-callback`); served via `vercel.json` header rule; guarded by `src/__tests__/aasa.test.ts` |
| **No reviewer-access gate** (waitlist/invite) | ✅ | Open email/password signup at `/auth`; email confirmation is a standard step, not a block; invite codes only gate trip joins, not signup |
| **Permissions contextual + described** | ✅ (web side) | Usage strings documented in `appstore/INFO_PLIST_ADDITIONS.md` (camera/photos/location/mic); actual prompt timing is owned by native plugins in `chravel-mobile` — see §6 |

---

## 4) FIXES APPLIED THIS PASS (in `chravel-web`)

1. **Deleted dead AASA serverless endpoint `api/aasa.ts`.** It defaulted the Apple Team ID to
   `PLACEHOLDER_APPLE_TEAM_ID`, listed fewer routes than the static file, and was **not wired** in
   `vercel.json` (no rewrite to `/api/aasa`). The served source of truth is the static
   `public/.well-known/apple-app-site-association` (correct Team ID). Removing the endpoint eliminates a
   placeholder-Team-ID drift / duplicate-source risk. The test `src/__tests__/aasa.test.ts` validates the
   **static** file and remains green.

2. **Corrected stale pricing in the IAP scaffold comment** (`src/billing/providers/iap.ts`). The
   implementation checklist listed Explorer `$4.99/$49.99` and Frequent Chraveler `$9.99/$99.99`; the
   source of truth (`src/billing/config.ts`, mirrored in `src/constants/revenuecat.ts`) is Explorer
   **$9.99/$99** and Frequent Chraveler **$19.99/$199**. Comment-only change — prevents a price/metadata
   mismatch when products are created in App Store Connect (itself a rejection risk under 3.1.1).

3. **Rewrote this audit** to reflect true state and close the two stale P1s.

---

## 5) WHAT THIS PASS INTENTIONALLY DID NOT DO

- No changes to `chravel-mobile` (native IAP, `Info.plist`, entitlements, `AppDelegate`, push) — not in
  this repo or session scope.
- No App Store Connect / RevenueCat / APNs dashboard configuration — human-only.
- No refactors of the already-correct billing-boundary, auth, or account-deletion code paths.
- No new dependencies.

---

## 6) REMAINING BLOCKERS — EXTERNAL / CROSS-REPO CHECKLIST

> None of these are fixable from `chravel-web`. Owner column: **Human** (dashboard/Apple) or
> **chravel-mobile** (native code).

### App Store Connect — Needs Owner (Human)
- [ ] Create subscription group + IAP products: `com.chravel.explorer.monthly|annual`,
      `com.chravel.frequentchraveler.monthly|annual` at the **§4-corrected prices** ($9.99/$99, $19.99/$199),
      plus Trip Passes `com.chravel.explorer.pass45`, `com.chravel.frequentchraveler.pass90`.
- [ ] App privacy questionnaire; age rating; support/marketing URLs; Privacy Policy URL `https://chravel.app/privacy`.
- [ ] Fill `[DATE]` and confirm version `1.0.0` in `appstore/metadata/review_notes.md`; attach demo creds.
- [ ] Banking / tax / agreements.
- [ ] Upload screenshots from `appstore/screenshots/` and metadata.

### RevenueCat dashboard — Needs Owner (Human)
- [ ] iOS (and Android) app configured; import Apple product IDs; map entitlements
      (`chravel_explorer`, `chravel_frequent_chraveler`) per `src/constants/revenuecat.ts`.
- [ ] Set production `VITE_REVENUECAT_IOS_API_KEY` / `VITE_REVENUECAT_ANDROID_API_KEY` in Vercel/native env.
- [ ] Sandbox purchase + restore verified.

### chravel-mobile (native iOS) — Owner: chravel-mobile repo
- [ ] `Info.plist` usage strings from `appstore/INFO_PLIST_ADDITIONS.md` (camera/photos/location/mic);
      confirm each permission is prompted **on user action**, not at launch.
- [ ] `aps-environment` = `production` in entitlements; APNs `.p8` generated + uploaded.
- [ ] Apple IAP wiring: StoreKit purchase/restore, `validate-apple-receipt` edge function + App Store
      Server Notifications updating Supabase entitlements; set `BILLING_FLAGS.APPLE_IAP_ENABLED = true`.
- [ ] RevenueCat native SDK key (was historically in `AppDelegate.swift`).

### Vercel / env — Needs Owner (Human)
- [ ] `APPLE_TEAM_ID=2T6WY43H3X`, `IOS_BUNDLE_ID=com.chravel.app` if any server code reads them.
      **Note:** Universal Links do **not** depend on these env vars — the served static AASA already
      hardcodes the correct Team ID.
- [ ] Production keys present (RevenueCat / Supabase / Stream / LiveKit); no staging leakage.

### Stripe — N/A for iOS, verify web
- [x] Web checkout + billing portal intact; consumer Stripe blocked on native (verified §3).

### Google Cloud / OAuth — Needs Owner (Human)
- [ ] Production redirect URIs include `https://chravel.app/auth-callback`; iOS/web client IDs; consent screen published.

---

## 7) RESIDUAL RISKS (non-blocking for this repo)

- **Email-confirmation step at signup** — standard; reviewers handle it. If concerned, note in review
  notes that the demo account is pre-confirmed.
- **iap.ts is a scaffold** (`isAvailable()` returns false) — intentional; native IAP lives in
  `chravel-mobile`. Not reviewer-reachable from web.
- **Pricing parity** — keep `billing/config.ts` ↔ `revenuecat.ts` ↔ App Store Connect product prices in
  sync; the §4 comment fix removes the one drift found.

---

## 8) DEFERRAL-DISCIPLINE FOOTER

1. **Fixed now** — deleted dead placeholder AASA endpoint; corrected stale IAP price comment; rewrote this audit to true state.
2. **Discovered** — prior audit stale (2 already-closed P1s); duplicate AASA sources w/ placeholder Team ID (resolved); native blockers live in `chravel-mobile`.
3. **Intentionally deferred** — all native-shell + dashboard P0s in §6.
4. **Why deferral necessary** — those artifacts are not in this repo/session scope and cannot be edited here.
5. **Paste-ready follow-up prompt** — see §6 "chravel-mobile" block; run it in a `chravel-mobile` session with Apple Developer + RevenueCat dashboard access.
6. **Validation completed** — `npm run lint && npm run typecheck && npm run build`; targeted vitest (AASA + `create-checkout/checkoutTier`); reference grep confirming no `api/aasa` refs remain.
7. **Remaining launch blockers** — the §6 cross-repo / dashboard P0s; none are blockable from `chravel-web`.
