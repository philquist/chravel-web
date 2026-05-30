# Chravel — Payments Fix Plan

> Companion to `PAYMENTS_AUDIT.md`. Lists what changed, what must happen to ship it, and paste-ready
> follow-ups for the deferred items. **No external-dashboard or DB-migration changes were applied in this pass.**

---

## A. Code changes applied (this branch)

| Area | File(s) | Change |
|---|---|---|
| Webhook user lookup (CRITICAL) | `supabase/functions/stripe-webhook/index.ts` | `private_profiles` → `profiles`, keyed on `user_id` (5 sites) |
| Reconcile customer-id cache | `supabase/functions/check-subscription/index.ts` | `private_profiles` upsert → `profiles` update by `user_id` |
| Invoice customer lookup | `supabase/functions/fetch-invoices/index.ts` | `private_profiles` → `profiles` by `user_id` |
| Storage-limit drift | `src/billing/entitlements.ts` | `media_upload.explorer` `2000` → `50000` (MB) + cross-link comment |
| Stale legacy price | `src/constants/stripe.ts` | `STRIPE_PRODUCTS['pro-enterprise'].price` `199` → `0` (custom) |
| Parity guard | `src/billing/__tests__/pricingParity.test.ts` | New — 11 assertions locking config mirrors |

All are non-destructive. No DB schema change.

### Required to make the webhook fix live: **redeploy edge functions**

The edge-function source is fixed but the **deployed** copies are stale. After merge, redeploy:

- `stripe-webhook`, `check-subscription`, `fetch-invoices`

Options:
1. MCP: `mcp__supabase__deploy_edge_function` for each (project `jmjiyekmxwsxkfnqwyaa`).
2. CLI: `supabase functions deploy stripe-webhook check-subscription fetch-invoices --project-ref jmjiyekmxwsxkfnqwyaa`.

After deploy, confirm with `mcp__supabase__get_edge_function` that the body references `profiles` (not
`private_profiles`).

---

## B. Supabase changes (deferred — paste-ready)

> Scope decision was "no DB migrations this pass." These are recommended next, in timestamped migration files
> under `supabase/migrations/` (pass `npx tsx scripts/lint-migrations.ts`; regenerate
> `src/integrations/supabase/types.ts`).

### B1. Create the missing billing-ops tables (finding #4) — non-destructive

```sql
-- entitlement_audit_log: compliance trail for every entitlement change
CREATE TABLE IF NOT EXISTS public.entitlement_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  old_plan text, new_plan text,
  old_status text, new_status text,
  source text NOT NULL,
  event_id text, event_type text,
  purchase_type text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.entitlement_audit_log ENABLE ROW LEVEL SECURITY;
-- service-role only: no user policies (edge functions bypass RLS)
CREATE INDEX IF NOT EXISTS idx_entitlement_audit_user ON public.entitlement_audit_log(user_id, created_at);

-- billing_webhook_processing_failures + ops views (see migration
-- 20260524120000_billing_webhook_ops_and_reconcile.sql in the repo for the full DDL — apply it as-is).
```

> Note: the repo already contains `supabase/migrations/20260524120000_billing_webhook_ops_and_reconcile.sql`
> and `…secure_profiles.sql`. The ops/reconcile migration references `private_profiles` in its reconciliation
> view — **edit that view to join `profiles` instead** before applying, to match the repointed code.

### B2. PII-separation decision (finding #1 root cause) — **needs product/security call**

Two coherent end states; pick one and stop the drift:

- **(Chosen for this pass) Consolidate on `profiles`.** Treat `private_profiles` as abandoned. Repoint the
  remaining references (`process-account-deletions`, the `join-trip` comment) and delete the unused
  `secure_profiles` migration from the repo (or mark it superseded) so no one re-applies a destructive split
  that the code no longer expects. Lowest risk; abandons PII isolation.
- **(Alternative) Apply `secure_profiles` properly.** Create `private_profiles`, migrate `stripe_customer_id` /
  `stripe_subscription_id` / `email` / `phone`, then drop them from `profiles` **as a two-phase migration**
  (CLAUDE.md requires forward-fix docs for destructive changes), and **revert** the code repoint. Restores PII
  isolation but is destructive and must be sequenced with the deploy.

Do **not** half-apply: code and schema must agree on exactly one model.

### B3. RLS verification

Confirm no policy lets a user write `profiles.subscription_status` / `subscription_product_id` /
`stripe_customer_id`. Server-side feature gating must not trust client-set values. (Entitlement truth is
`user_entitlements`, which is already service-role-only.)

### B4. Billing kill-switch (finding #7)

```sql
INSERT INTO public.feature_flags (key, enabled, rollout_percentage, description)
VALUES ('billing-checkout-enabled', true, 100, 'Kill switch for Stripe checkout / paywall entry')
ON CONFLICT (key) DO NOTHING;
```
Then gate `create-checkout` (edge: `isFeatureEnabled`) and paywall entry (`useFeatureFlag`).

---

## C. Stripe changes (via dashboard / browser agent — verify first, change nothing without approval)

1. Confirm the 6 products + 2 trip-pass products and all price IDs in §3 of the audit exist, are **active**, and
   are in the **same mode** (live) as production keys. Use `stripe-audit-browser-agent.md`.
2. **Pro annual ambiguity:** `billing/config.ts` reuses the monthly price ID for Pro annual. Decide: either create
   real annual prices for `pro-starter`/`pro-growth` and wire `stripePriceIdAnnual`, or remove `priceAnnual` from
   Pro tiers to stop implying annual Pro billing.
3. Verify the **webhook endpoint** points at the production `stripe-webhook` function URL and listens for:
   `checkout.session.completed`, `customer.subscription.created/updated/deleted`,
   `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.refunded`. Confirm `STRIPE_WEBHOOK_SECRET`
   matches.
4. Confirm Customer Portal is configured (cancel/update/payment-method) and `STRIPE_PORTAL_ENABLED` semantics hold.
5. Ensure no `sk_test_`/`pk_test_` IDs are used in production env and no `…live…` IDs in local.

## D. RevenueCat changes (browser agent — verify first)

1. Resolve finding #3: confirm whether web uses RevenueCat Web Billing (`rcb_`) or Stripe. If Stripe owns web,
   neutralize `src/config/revenuecat.ts`'s web-billing init.
2. Confirm entitlement IDs match code: `chravel_explorer`, `chravel_frequent_chraveler`,
   `chravel_pro_starter/growth/enterprise`.
3. Confirm offerings/packages map to the App Store Connect product IDs in §3.
4. Confirm `REVENUECAT_WEBHOOK_SECRET` and that the RC webhook points at the production `revenuecat-webhook`.
   Use `revenuecat-audit-browser-agent.md`.

## E. App Store Connect changes (browser agent — verify first)

1. Confirm subscription products exist with IDs `com.chravel.explorer.monthly/.annual`,
   `com.chravel.frequentchraveler.monthly/.annual` and a consumer subscription group.
2. Confirm prices match §3 ($9.99/$99, $19.99/$199) and intro/trial offers match app copy.
3. Apple product IDs must **exactly** equal RevenueCat product identifiers.
4. Apple IAP stays disabled (`APPLE_IAP_ENABLED=false`) until the chravel-mobile native flow + receipt-validation
   edge function ship. Use `app-store-connect-audit-browser-agent.md`.

---

## F. Testing plan

**Automated (this branch):**
- `npm run lint && npm run typecheck && npm run build`
- `npx vitest run src/billing/__tests__/pricingParity.test.ts` (11) + `src/billing` + `src/services/__tests__/entitlementService.test.ts`

**Post-deploy (staging/sandbox):**
- Stripe **test mode**: complete a subscription checkout → confirm `customer.subscription.created` now resolves the
  user (previously a no-op) and writes `user_entitlements` + `profiles`; cancel → access retained to period end;
  fail a payment (test card) → `past_due` retained; refund a Trip Pass → expired.
- Verify `check-subscription` returns correct tier on web for the test user.
- iOS: paywall shows "subscribe on web" (IAP disabled); restore purchases path doesn't crash.

**Manual QA matrix:** logged-out pricing page · free→paid upgrade · checkout success/cancel return · customer
portal · expired/canceled state · paid-feature access vs free limits · mobile + desktop + installed-PWA viewports ·
super-admin bypass does not leak to a normal user.

**DB checks:** one `user_entitlements` row per `(user_id, purchase_type)`; `webhook_events` dedupes replays;
RLS blocks client entitlement mutation.

---

## G. Rollback

- **Code:** revert this branch's commit; the repoint is isolated to 3 edge functions + 2 config files + 1 test.
- **Edge functions:** redeploy the previous versions (they were already non-functional for subscriptions, so
  rollback strands no working flow — `check-subscription` email reconcile remains the fallback either way).
- **No external products deleted**; no destructive DB change made. Record current env vars / product IDs / price
  IDs before any dashboard edit. Prefer **deactivating** over deleting external objects, and only after verifying
  no live customer or webhook history depends on them.

---

## H. Deferred follow-ups (paste-ready prompts)

> Each is intentionally deferred (scope: no DB migrations; product decision required) — not dropped.

1. **Apply billing-ops migrations.** "Create timestamped migrations for `entitlement_audit_log` and apply the
   existing `20260524120000_billing_webhook_ops_and_reconcile.sql`, editing its reconciliation view to join
   `profiles` instead of `private_profiles`; regenerate `src/integrations/supabase/types.ts`; verify
   `to_regclass` for each new object."
2. **Resolve the RevenueCat dual-config (#3).** "Decide whether web billing uses Stripe or RevenueCat Web Billing;
   if Stripe, neutralize the web-billing init in `src/config/revenuecat.ts` and delete the unused path; otherwise
   reconcile the two configs into one. Add a test asserting a single active web provider."
3. **PII-separation decision (#1 root cause / B2).** "Either remove the abandoned `secure_profiles`/`private_profiles`
   migration and repoint the remaining references, or apply the split as a two-phase destructive migration and
   revert the `profiles` repoint. Pick one; make code and schema agree."
4. **Separate billing idempotency from Stream (#6).** "Move billing webhook idempotency keys out of the shared
   `webhook_events` table into a dedicated table (or add a `source` discriminator + composite unique)."
5. **Billing kill-switch (#7).** "Seed `billing-checkout-enabled` flag (B4) and gate `create-checkout` +
   paywall entry."
6. **Pro annual pricing (#3 in §C).** "Decide whether Pro tiers bill annually; create distinct Stripe annual prices
   and wire `stripePriceIdAnnual`, or drop `priceAnnual` for Pro tiers."
7. **Collapse hardcoded UI price strings.** "Replace literal prices in `UpgradeModal.tsx` / `ProUpgradeModal.tsx`
   with values derived from `billing/config.ts`; extend `pricingParity.test.ts` to assert the rendered values."
