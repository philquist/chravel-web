# Chravel — Payments, Subscriptions & Pricing Audit

> Audited: 2026-05-30 · Branch `claude/brave-maxwell-G6N6z`
> Scope: codebase + live Supabase project **Chravel** (`jmjiyekmxwsxkfnqwyaa`, the only `ACTIVE_HEALTHY` project).
> External dashboards (Stripe / RevenueCat / App Store Connect) were **not** directly accessed — use the
> companion browser-agent scripts to complete those legs. Code/DB evidence is first-hand.

---

## 1. Executive summary

Chravel runs a **two-provider** billing model:

- **Stripe** — web / PWA checkout, customer portal, invoices, recurring subscriptions + one-time Trip Passes.
- **RevenueCat + Apple IAP / Google Play** — native mobile. **Scaffold only today**
  (`BILLING_FLAGS.APPLE_IAP_ENABLED = false`, `GOOGLE_BILLING_ENABLED = false`); the native app lives in a
  separate `chravel-mobile` repo. iOS consumer purchases currently fall back to "subscribe on web".

Cross-platform entitlement state is normalized into one Supabase table, **`public.user_entitlements`**, which
the app reads through `check-subscription`. Stripe and RevenueCat webhooks are meant to keep it current.

**One critical defect** was found and fixed in this pass; several duplication/drift issues are fixed or
documented below.

### Findings by severity

| # | Sev | Finding | Status |
|---|-----|---------|--------|
| 1 | **CRITICAL** | Stripe **webhook** subscription handlers are a silent no-op in production — they resolve the user via a `private_profiles` table that does not exist in the live DB. | **Fixed** (repointed to `profiles`) |
| 2 | HIGH | Two divergent limit maps: Explorer storage = 2000 MB (`FEATURE_LIMITS`) vs 50 GB (`FREEMIUM_LIMITS`, the enforced value). | **Fixed** (aligned to 50 GB) |
| 3 | HIGH | Two contradictory RevenueCat configs (web-billing `rcb_` vs native `appl_`/`goog_`); unclear which is live. | Documented (deferred) |
| 4 | MEDIUM | `entitlement_audit_log`, `billing_webhook_processing_failures` + 2 views referenced by deployed code but **not deployed**. | Documented (migration deferred) |
| 5 | MEDIUM | Pricing duplicated across 4+ files + hardcoded UI strings; could drift undetected. | **Mitigated** (parity test added) |
| 6 | MEDIUM | `webhook_events` idempotency table is **shared** between Stream chat (`stream:message.new`) and billing events. | Documented (deferred) |
| 7 | LOW | No billing **kill-switch** feature flag (all 4 flags are Stream-chat). | Documented (deferred) |
| 8 | LOW | Apple IAP / Google Billing scaffold-only; `process-account-deletions` skips missing `private_profiles`; `join-trip` comment updated. | **Fixed** (graceful skip + comment) |

---

## 2. Canonical source-of-truth model

| Concern | Canonical owner | File / location |
|---|---|---|
| Tier names, prices, Stripe & store IDs | **`BILLING_PRODUCTS` / `TRIP_PASS_PRODUCTS`** | `src/billing/config.ts` |
| Feature gating limits | **`FEATURE_LIMITS`** ("do not duplicate this map") | `src/billing/entitlements.ts` |
| Enforced storage / media caps | `FREEMIUM_LIMITS` / `PRO_LIMITS` | `src/utils/featureTiers.ts` |
| Web price (charge) | Stripe Price object | Stripe dashboard |
| Apple IAP price (charge) | App Store Connect subscription product | ASC dashboard |
| Cross-platform entitlement state | **`public.user_entitlements`** | Supabase |
| User-facing subscription status | `user_entitlements` (primary) → `profiles` (legacy fallback) | `check-subscription`, `useSubscription` |

**Precedence:** `check-subscription` reads `user_entitlements` first; if missing/stale it reconciles from the
Stripe API (looked up **by email**), upserts `user_entitlements`, and mirrors status onto `profiles`.
Super-admin emails bypass to `pro-enterprise`. Conflict target for entitlement upserts is
`(user_id, purchase_type)` so a subscription and a Trip Pass can coexist.

---

## 3. Current-state tier inventory

Prices, IDs and limits below are from the codebase (verified consistent by `pricingParity.test.ts`).
External-dashboard columns are **to be filled** by the browser-agent scripts.

| Tier | Display | Monthly | Annual | Stripe product (monthly / annual) | Stripe price (monthly / annual) | Apple product IDs | RC entitlement | Status |
|---|---|---|---|---|---|---|---|---|
| free | Free | $0 | — | — | — | — | (none) | Active |
| explorer | Explorer | $9.99 | $99 | `prod_U73VxEnvEHbBrx` / `prod_U73VrTc4sE8AIv` | `price_1T8pOc47wCAQ57MmWsPX3Jku` / `price_1T8pOl47wCAQ57MmDT7uefS7` | `com.chravel.explorer.monthly` / `.annual` | `chravel_explorer` | Active |
| frequent-chraveler | Frequent Chraveler | $19.99 | $199 | `prod_U73VfiKf3VrJKf` / `prod_U73VqblRTSr2XZ` | `price_1T8pOd47wCAQ57MmIrACPNpc` / `price_1T8pOl47wCAQ57MmrhqSZM2j` | `com.chravel.frequentchraveler.monthly` / `.annual` | `chravel_frequent_chraveler` | Active |
| pro-starter | Starter Pro | $49 | $490* | `prod_U73Vlcl4lqgsb4` | `price_1T8pOe47wCAQ57MmkShIK75i` | — (B2B via Stripe) | `chravel_pro_starter` | Active |
| pro-growth | Growth Pro | $99 | $990* | `prod_U73VPX6TlClQ7J` | `price_1T8pOf47wCAQ57Mm5k8uVQrW` | — | `chravel_pro_growth` | Active |
| pro-enterprise | Enterprise | Custom | Custom | `prod_U73Vd6QW4pEY9x` | `price_1T8pOg47wCAQ57MmcEPnjd3s` | — | `chravel_pro_enterprise` | Active |

\* Pro annual price IDs in `billing/config.ts` reuse the monthly price ID (comment: "Pro plans monthly only").
The `priceAnnual` numbers (490/990) are display-only; there is **no distinct annual Stripe price** for Pro tiers.
**Verify in Stripe** whether annual Pro billing is intended; if so, create distinct annual prices.

**Trip Passes (one-time):** `pass-explorer-45` → `prod_U73WaALe9yjrAR` / `price_1T8pP047wCAQ57Mm6sfNTg2w`, $39.99, 45 days ·
`pass-frequent-90` → `prod_U73W99ebeJvbLB` / `price_1T8pP047wCAQ57Mm2DOch99F`, $74.99, 90 days.

### Feature limits (`FEATURE_LIMITS`, `src/billing/entitlements.ts`; `-1` = unlimited, `0` = unavailable)

| Feature | free | explorer | frequent-chraveler | pro-starter | pro-growth | pro-enterprise |
|---|---|---|---|---|---|---|
| ai_concierge (per trip) | 10 | 25 | -1 | -1 | -1 | -1 |
| trip_creation | 3 | 10 | -1 | -1 | -1 | -1 |
| pro_trip_creation /mo | 0 | 0 | 1 | -1 | -1 | -1 |
| media_upload (MB) | 500 | **50000** | -1 | -1 | -1 | -1 |
| payment_splitting | 3 | 10 | -1 | -1 | -1 | -1 |
| pdf_export / calendar_sync | 0 | -1 | -1 | -1 | -1 | -1 |
| event_creation | 0 | 0 | -1 | -1 | -1 | -1 |
| channels / roles / roster | 0 | 0 | 0 | -1 | -1 | -1 |
| logistics | 0 | 0 | 0 | 0 | -1 | -1 |
| approvals / quickbooks / audit | 0 | 0 | 0 | 0 | 0 | -1 |
| voice_concierge | 0 | 0 | -1 | -1 | -1 | -1 |

(`media_upload.explorer` was `2000`; corrected to `50000` to match the enforced `FREEMIUM_LIMITS` — finding #2.)

---

## 4. Live Supabase evidence (verified this session)

**Object existence map** (`to_regclass`):

| Object | Referenced by deployed code | Live DB |
|---|---|---|
| `public.user_entitlements` (has `purchase_type`) | all billing | ✅ present |
| `public.webhook_events` (unique `event_id`) | idempotency | ✅ present |
| `public.profiles` (`stripe_customer_id`, `stripe_subscription_id`, `subscription_*`, `free_pro_trip_limit`) | billing + app | ✅ present |
| `public.private_profiles` | stripe-webhook, check-subscription, fetch-invoices, join-trip, process-account-deletions | ❌ **NULL** |
| `public.entitlement_audit_log` | stripe + revenuecat webhooks | ❌ NULL |
| `public.billing_webhook_processing_failures` + `billing_webhook_ops_dashboard` + `billing_entitlement_reconciliation_candidates` | stripe-webhook ops | ❌ NULL |

**Data:** `user_entitlements` has exactly **1 row**: `source='admin'`, `plan='frequent-chraveler'`, `status='active'`,
no `stripe_customer_id` / `revenuecat_customer_id` — i.e. a manually granted comp, never a real purchase.
`profiles` mirrors it for the same user (`subscription_product_id='frequent-chraveler'`). 93 users are free
(`free_pro_trip_limit=1`); the comped user has `999`.

**`webhook_events` is shared:** 646 rows, all `stream:message.new` / `stream:message.updated` (Stream chat).
Billing idempotency keys are inserted into the **same** table (finding #6).

**Feature flags:** 4 rows, all Stream-chat (`stream-chat-trip`, `-channels`, `-broadcasts`, `-concierge`).
No billing kill-switch (finding #7).

**Migration ledger drift:** `supabase_migrations.schema_migrations` has **no record** of the billing migrations
(`20251224…secure_profiles`, `20260307…`, `20260401…`, `20260413…`, `20260524…`), yet *some* of their effects
are live (`user_entitlements.purchase_type`, `webhook_events` unique index). Migrations are being applied
out-of-band and the schema has drifted from the migration files. This is the root environment problem behind #1 and #4.

---

## 5. Finding details

### #1 — CRITICAL: Stripe webhook can't resolve the user (FIXED)

`supabase/functions/stripe-webhook/index.ts` resolved the user in **every** subscription handler via:

```ts
const { data: profiles } = await supabase
  .from('private_profiles').select('id').eq('stripe_customer_id', customerId).limit(1);
if (!profiles || profiles.length === 0) return;   // ← always taken: table doesn't exist
```

Because `private_profiles` does not exist in the live DB, the query returns an error, `profiles` is null, and the
guard returns early. Affected: `customer.subscription.created/updated/deleted`, `invoice.payment_failed`,
`charge.refunded`, and the customer-id link write in `checkout.session.completed`.

**Effect:** the authoritative real-time push path is dead. Seat counts, `past_due` grace handling, cancellation,
refund revocation, audit logging, and subscription notifications **never fire**. The system only "works" because
`check-subscription` independently reconciles from Stripe **by email** on app load/foreground/paywall/post-checkout
and upserts `user_entitlements` — so a paying web user eventually gets access, but cancellations/failures/refunds
are not enforced until a client triggers reconciliation, and a user who never reopens the app keeps access.
Matches the live data (no Stripe purchase ever reached `user_entitlements`).

**Fix applied:** repointed the lookups/writes in `stripe-webhook`, `check-subscription`, and `fetch-invoices`
from `private_profiles` to the existing **`profiles`** table, keyed consistently on **`user_id`** (which already
holds `stripe_customer_id` / `stripe_subscription_id`). Non-destructive; no schema change. **Requires
edge-function redeploy to take effect** (see PAYMENTS_FIX_PLAN.md).

### #2 — HIGH: divergent Explorer storage cap (FIXED)

`FEATURE_LIMITS.media_upload.explorer = 2000` (MB) but `FREEMIUM_LIMITS.explorer.storageAccountMB = 50000` (50 GB).
Upload enforcement (`src/hooks/useMediaLimits.ts`, `src/services/uploadService.ts`) reads `FREEMIUM_LIMITS`;
gating/display (`useUnifiedEntitlements`, `useEntitlements`, `useBilling`) reads `FEATURE_LIMITS`. So Explorer's
displayed cap (2 GB) contradicted the enforced cap (50 GB). **Fixed** by setting `FEATURE_LIMITS.media_upload.explorer = 50000`
(the enforced value) and cross-linking the maps in comments. Locked by `pricingParity.test.ts`.

### #3 — HIGH: two contradictory RevenueCat configs (DEFERRED)

- `src/config/revenuecat.ts` — wired into `initRevenueCat()`; expects a **Web Billing** key
  (`VITE_REVENUECAT_API_KEY`, must start `rcb_`). This is a *web* RevenueCat integration via `@revenuecat/purchases-js`.
- `src/constants/revenuecat.ts` + `src/integrations/revenuecat/revenuecatClient.ts` — expect **native** keys
  (`VITE_REVENUECAT_IOS_API_KEY` / `_ANDROID_API_KEY`); `isRevenueCatConfigured('web')` returns `false`.

These are parallel, mutually exclusive integrations with different key formats and different views of whether web
uses RevenueCat at all. Until the team confirms whether web billing goes through Stripe (current default) or
RevenueCat Web Billing, this is ambiguous and a footgun. **Recommendation:** pick one; if Stripe owns web (per
`getBillingProvider` → web ⇒ Stripe), delete/neutralize the `config/revenuecat.ts` web-billing path or gate it
behind an explicit flag. Deferred — needs a product decision (see fix plan).

### #4 — MEDIUM: referenced-but-undeployed billing tables (DEFERRED)

`entitlement_audit_log` writes are wrapped in try/catch (`logEntitlementChange`) → **non-blocking**, audit trail is
silently lost. `billing_webhook_processing_failures` writes use unchecked `{ error }` returns → **silent no-op**,
ops dashboard/reconciliation views are empty. Neither blocks the webhook, but compliance auditing and ops
visibility are absent. **Fix:** apply the create-table migrations (paste-ready in fix plan). Deferred per scope
(no DB migrations this pass).

### #5 — MEDIUM: pricing duplication (MITIGATED)

Pricing/IDs are mirrored across `billing/config.ts` (SoT), `constants/stripe.ts`, `constants/revenuecat.ts`, and
hardcoded strings in `UpgradeModal.tsx` / `ProUpgradeModal.tsx`. They are currently **in sync** (one stale value —
legacy `STRIPE_PRODUCTS['pro-enterprise'].price = 199` vs custom/0 — was corrected to `0`). Added
`src/billing/__tests__/pricingParity.test.ts` (11 assertions) to fail CI on future drift between config files.
Hardcoded UI strings are not auto-asserted; collapsing them onto config is deferred.

### #6 — MEDIUM: shared idempotency table (DEFERRED)

`webhook_events` stores both Stream chat event IDs and Stripe/RevenueCat event IDs. Collision risk is low (Stripe
`evt_…`, RC composite keys, Stream `stream:…` are distinct namespaces) but the mixing complicates TTL/cleanup and
ops reasoning. **Recommendation:** separate billing idempotency into its own table (or a `source` column +
composite unique). Deferred.

### #7 — LOW: no billing kill-switch (DEFERRED)

Per CLAUDE.md feature-flag rules, paid surfaces should have a runtime kill switch. None exists. **Recommendation:**
seed `billing-checkout-enabled` (and/or per-provider) flags and gate `create-checkout` + paywall entry. Deferred.

### #8 — LOW: other `private_profiles` references / scaffold (PARTIAL / INTENDED)

`process-account-deletions` deletes from `private_profiles` (non-fatal cleanup error). `join-trip` only mentions it
in a comment (uses `auth` email — not broken). Apple IAP / Google Billing are intentionally scaffold-only. The two
non-billing `private_profiles` references share the same root cause as #1 and should be repointed when the PII model
is resolved (see #1/#4 follow-ups).

---

## 6. Edge-function inventory (deployed to `jmjiyekmxwsxkfnqwyaa`)

| Function | Purpose | Notes |
|---|---|---|
| `create-checkout` | Start Stripe Checkout; cross-provider double-bill guard; blocks iOS consumer subs | Reads `user_entitlements` |
| `check-subscription` | Resolve tier (entitlements → Stripe reconcile by email) | Self-heal path; repointed to `profiles` |
| `stripe-webhook` | Process Stripe events → `user_entitlements` + `profiles` | **Repointed to `profiles`** |
| `customer-portal` | Stripe billing portal session | Looks up customer by email |
| `fetch-invoices` | List Stripe invoices | Repointed to `profiles` |
| `revenuecat-webhook` | Process RC events → `user_entitlements` | Auth via `REVENUECAT_WEBHOOK_SECRET`; idempotent; stale-expiration guard |
| `sync-revenuecat-entitlement` | Client-initiated RC → Supabase sync | Web RC path |
| `organization-billing-portal` | B2B org billing portal | `organization_billing` table |
| `payment-reminders` | Overdue **trip expense** reminders | Not subscription billing |

**Env / secrets:** Frontend `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_ENABLE_STRIPE_PAYMENTS`,
`VITE_REVENUECAT_API_KEY` (web), `VITE_REVENUECAT_IOS_API_KEY` / `_ANDROID_API_KEY`,
`VITE_REVENUECAT_*_ENTITLEMENT_ID`. Edge secrets (Supabase Dashboard, **not** in `.env`): `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `REVENUECAT_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`. Test vs live is governed by key
prefix (`sk_test_`/`sk_live_`, `pk_test_`/`pk_live_`, `whsec_…`). **Confirm production uses live keys and the
Stripe webhook endpoint points at the production function** via the browser-agent scripts.

---

## 7. RLS posture (subscription tables)

`user_entitlements`: RLS on; users may `SELECT` own row (`auth.uid() = user_id`); **no** user INSERT/UPDATE/DELETE
policy → only the service role (edge functions) mutates it. `webhook_events` / (intended) `billing_webhook_*`:
service-role only. `profiles`: holds the stripe/subscription columns; verify there is **no** user-writable policy
that lets a client set `subscription_status`/`subscription_product_id` (server-side gating must not depend on these
being immutable — they aren't the entitlement source of truth, but they back the legacy fallback). Action item for
the Supabase leg of the fix plan.

---

## 8. What changed in this pass

- **Fixed** `private_profiles → profiles` in `stripe-webhook`, `check-subscription`, `fetch-invoices` (finding #1).
- **Fixed** Explorer storage cap `2000 → 50000` in `FEATURE_LIMITS` (finding #2).
- **Fixed** stale legacy enterprise price `199 → 0` (finding #5).
- **Added** `src/billing/__tests__/pricingParity.test.ts`.

See `PAYMENTS_FIX_PLAN.md` for redeploy steps, deferred migrations (paste-ready), the RevenueCat-config decision,
testing, and rollback.
