# Browser-Agent Script — Stripe Subscription Audit (Chravel)

> Paste this to a browser agent with access to the Chravel Stripe Dashboard.
> **READ-ONLY. Do not create, edit, archive, or delete anything. Do not type or paste secrets into chat.**
> Redact all secrets (API keys `sk_…`/`pk_…`/`rk_…`, webhook signing secrets `whsec_…`, bank/financial info).
> Only safe object IDs may be copied: product IDs (`prod_…`), price IDs (`price_…`), lookup keys, metadata.

## Goal
Verify Stripe matches Chravel's canonical pricing matrix and that the production webhook is wired correctly.

## Mode check (do this first)
1. Note the **Test/Live toggle** state (top of dashboard). Audit **Live** mode unless told otherwise.
2. Record which mode you are in on every screenshot. Flag any test-mode object that looks production-intended.

## Canonical matrix to diff against (from `src/billing/config.ts`)
| Tier | Monthly | Annual | Product (monthly / annual) | Price (monthly / annual) |
|---|---|---|---|---|
| Explorer | $9.99 | $99 | `prod_U73VxEnvEHbBrx` / `prod_U73VrTc4sE8AIv` | `price_1T8pOc47wCAQ57MmWsPX3Jku` / `price_1T8pOl47wCAQ57MmDT7uefS7` |
| Frequent Chraveler | $19.99 | $199 | `prod_U73VfiKf3VrJKf` / `prod_U73VqblRTSr2XZ` | `price_1T8pOd47wCAQ57MmIrACPNpc` / `price_1T8pOl47wCAQ57MmrhqSZM2j` |
| Starter Pro | $49 | — | `prod_U73Vlcl4lqgsb4` | `price_1T8pOe47wCAQ57MmkShIK75i` |
| Growth Pro | $99 | — | `prod_U73VPX6TlClQ7J` | `price_1T8pOf47wCAQ57Mm5k8uVQrW` |
| Enterprise | Custom | — | `prod_U73Vd6QW4pEY9x` | `price_1T8pOg47wCAQ57MmcEPnjd3s` |
| Explorer Pass (45d) | $39.99 one-time | — | `prod_U73WaALe9yjrAR` | `price_1T8pP047wCAQ57Mm6sfNTg2w` |
| Frequent Pass (90d) | $74.99 one-time | — | `prod_U73W99ebeJvbLB` | `price_1T8pP047wCAQ57Mm2DOch99F` |

## Steps & what to capture
1. **Products** (`/products`): for each product above, screenshot and record Product Name, Product ID, Active
   status. Flag any listed product **not** in the matrix (stale/duplicate) and any matrix product that is missing
   or **archived**.
2. **Prices**: for each product, record every Price ID, amount, currency (expect `usd`), interval
   (`month`/`year`/one-time), active status, and any `lookup_key`/`metadata`. Confirm amounts equal the matrix.
   Flag inactive prices that the matrix still references. **Specifically check** whether Starter/Growth Pro have a
   distinct **annual** price (the code currently reuses the monthly price ID for annual — note what exists).
3. **Webhooks** (`/webhooks`): record each endpoint URL (redact signing secret), enabled events, and status.
   Confirm one endpoint points at the production `…/functions/v1/stripe-webhook` and listens for:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.refunded`.
   Flag missing events or extra/duplicate endpoints. Note recent delivery failures if shown.
4. **Customer Portal** (`/settings/billing/portal`): record whether it's active and which actions are enabled
   (cancel, update plan, update payment method, invoice history).
5. **Checkout/Tax/Coupons**: note if Stripe Tax is enabled, and list any active promotion codes/coupons (ID + %/amount).
6. **Metadata**: if any product/price uses metadata for tier mapping, record the keys/values (the app maps by
   product ID, so flag any metadata-based assumption).

## Output
- A filled table: Product Name · Product ID · Price ID · Amount · Currency · Interval · Active · Lookup Key ·
  Metadata · Mode · Notes.
- A **mismatch summary**: missing / stale / archived / duplicate / wrong-amount / mode-leak, each tagged
  Critical/High/Medium/Low.
- Screenshots of Products, each Price, the Webhooks list, and Customer Portal config (secrets redacted).
- Explicit answer: "Production webhook endpoint correct & all 7 events subscribed? YES/NO."
