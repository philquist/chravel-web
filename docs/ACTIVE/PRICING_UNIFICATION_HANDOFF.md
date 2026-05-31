# Pricing Unification — Status

Branch `claude/brave-maxwell-G6N6z`, PR #664.

## ✅ Done (verified: tsc 0 errors, build green, pricingParity 15/15, eslint clean)

**Single source of truth = `src/billing/config.ts`.** All pricing now derives from it.

- `src/billing/pricingDisplay.ts` — formats every price label (monthly/annual/annual-per-month/
  savings/savings-%/trip-pass) from `BILLING_PRODUCTS` / `TRIP_PASS_PRODUCTS`. No hardcoded numbers.
- `src/types/consumer.ts` `CONSUMER_PRICING` and `src/types/pro.ts` `SUBSCRIPTION_TIERS` — prices
  derive from `BILLING_PRODUCTS` (no literals).
- **No hardcoded consumer price strings remain** in the UI (swept `src/**`, excluding the canonical
  config files + the `iap.ts` scaffold → 0 hits). Components converted:
  `UpgradeModal`, `ConsumerBillingSection`, `TripPassModal`, `NativeSubscriptionPaywall`,
  `PricingSection`, `TripExportModal` (and `PlusUpsellModal` already used `CONSUMER_PRICING`).
- **RevenueCat collapse** — deleted dead `src/config/revenuecat.ts` (+test); web=Stripe, RC native-only.
  `constants/revenuecat.ts` + `integrations/revenuecat/revenuecatClient.ts` are the single integration.
- **Events fold-in (config + copy):** removed the paid Events tab, the dead/unreachable
  "Chravel Events" else-branch, and the $29/$199 Events pricing cards from `UpgradeModal` entirely
  (file 571→384 lines).
  `FEATURE_LIMITS.event_creation` and `FREEMIUM_LIMITS.*.eventsLimit` now agree: **Free 3 / Explorer 3 /
  Frequent Chraveler -1 (unlimited) / Pro -1**. Copy reads "Up to 3 events" (Free/Explorer) and
  "Unlimited events" (Frequent Chraveler). Parity test asserts these invariants.

## ⚠️ Remaining follow-up — event-count ENFORCEMENT (not just display)

`useUnifiedEntitlements.canCreateEvent = canUse('event_creation')` is called WITHOUT a usage count, so
it only checks feature availability (now always true for Free since the limit is 3 > 0). The actual
"3 events then must upgrade" cap is enforced via the DB columns `profiles.free_event_limit` /
`profiles.free_events_used` (read in `useAuth.tsx`). To make the 3-event lifetime cap real:

1. Migration: set `profiles.free_event_limit` default to **3** (was 1) and backfill existing rows
   (`UPDATE profiles SET free_event_limit = 3 WHERE free_event_limit = 1;`). Two-phase if needed.
2. Ensure the event-create flow increments `free_events_used` and blocks at the limit for Free/Explorer,
   routing the upgrade CTA to **Frequent Chraveler**. (Or pass `usageCount` into
   `canUse('event_creation', { usageCount })` so the FEATURE_LIMITS path enforces it directly — then the
   two systems converge on one.)

This is a deliberate, separate change (DB default + gate wiring) and was left out of the UI/config PR.

## Dashboard UPDATE scripts (Stripe / RevenueCat / App Store Connect)

In the plan file `/root/.claude/plans/comprehensive-payment-stateful-mochi.md`. They diff each dashboard
against the canonical matrix and update mismatches to the LOWER price. Move into `docs/ACTIVE/` if they
should live in the repo. (Audit-only scripts already in `docs/ACTIVE/{stripe,revenuecat,app-store-connect}-audit-browser-agent.md`.)
