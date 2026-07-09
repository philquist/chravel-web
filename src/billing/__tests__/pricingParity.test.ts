/**
 * Pricing Parity Test
 *
 * `src/billing/config.ts` (BILLING_PRODUCTS / TRIP_PASS_PRODUCTS) is the single
 * source of truth for tier pricing and Stripe / store product identifiers.
 *
 * Pricing is intentionally mirrored in a few other places for ergonomics:
 *   - src/constants/stripe.ts        (checkout + legacy STRIPE_PRODUCTS)
 *   - src/constants/revenuecat.ts    (native iOS/Android display pricing)
 *   - src/utils/featureTiers.ts      (FREEMIUM_LIMITS storage caps)
 *
 * These can drift silently. This test fails CI the moment any mirror diverges
 * from billing/config.ts, so a price/ID change in one place must be reflected in
 * all. See docs/ACTIVE/PAYMENTS_AUDIT.md for the full source-of-truth model.
 */

import { describe, expect, it } from 'vitest';

import { BILLING_FLAGS, BILLING_PRODUCTS, TRIP_PASS_PRODUCTS } from '@/billing/config';
import { CONSUMER_PLANS, PRO_PLANS, TRIP_PASS_PLANS, STRIPE_PRODUCTS } from '@/constants/stripe';
import {
  REVENUECAT_PRICING,
  ENTITLEMENT_TO_TIER,
  REVENUECAT_PRODUCTS,
  isTripPassProductId,
} from '@/constants/revenuecat';
import { FREEMIUM_LIMITS } from '@/utils/featureTiers';
import { FEATURE_LIMITS } from '@/billing/entitlements';
import { CONSUMER_PRICING } from '@/types/consumer';
import { SUBSCRIPTION_TIERS } from '@/types/pro';
import { CONSUMER_PRICE_DISPLAY } from '@/billing/pricingDisplay';

const dollarsToCents = (usd: number): number => Math.round(usd * 100);

// Mirror of formatUsd in pricingDisplay (whole -> "$99", fractional -> "$9.99")
const formatExpected = (n: number): string => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

describe('iOS App Store billing guard', () => {
  it('keeps Apple IAP enabled for iOS review builds', () => {
    expect(BILLING_FLAGS.APPLE_IAP_ENABLED).toBe(true);
  });
});

describe('pricing parity — constants/stripe.ts mirrors billing/config.ts', () => {
  it('consumer Explorer matches (product IDs, price IDs, amounts)', () => {
    const cfg = BILLING_PRODUCTS['consumer-explorer'];
    const c = CONSUMER_PLANS.explorer;
    expect(c.product_id).toBe(cfg.stripeProductId);
    expect(c.product_id_annual).toBe(cfg.stripeProductIdAnnual);
    expect(c.monthly.price_id).toBe(cfg.stripePriceIdMonthly);
    expect(c.annual.price_id).toBe(cfg.stripePriceIdAnnual);
    expect(c.monthly.amount).toBe(dollarsToCents(cfg.priceMonthly));
    expect(c.annual.amount).toBe(dollarsToCents(cfg.priceAnnual!));
  });

  it('consumer Frequent Chraveler matches (product IDs, price IDs, amounts)', () => {
    const cfg = BILLING_PRODUCTS['consumer-frequent-chraveler'];
    const c = CONSUMER_PLANS['frequent-chraveler'];
    expect(c.product_id).toBe(cfg.stripeProductId);
    expect(c.product_id_annual).toBe(cfg.stripeProductIdAnnual);
    expect(c.monthly.price_id).toBe(cfg.stripePriceIdMonthly);
    expect(c.annual.price_id).toBe(cfg.stripePriceIdAnnual);
    expect(c.monthly.amount).toBe(dollarsToCents(cfg.priceMonthly));
    expect(c.annual.amount).toBe(dollarsToCents(cfg.priceAnnual!));
  });

  it('pro Starter / Growth match (product IDs, price IDs, monthly amount)', () => {
    const starter = BILLING_PRODUCTS['pro-starter'];
    expect(PRO_PLANS.starter.product_id).toBe(starter.stripeProductId);
    expect(PRO_PLANS.starter.price_id).toBe(starter.stripePriceIdMonthly);
    expect(PRO_PLANS.starter.amount).toBe(dollarsToCents(starter.priceMonthly));

    const growth = BILLING_PRODUCTS['pro-growth'];
    expect(PRO_PLANS.growth.product_id).toBe(growth.stripeProductId);
    expect(PRO_PLANS.growth.price_id).toBe(growth.stripePriceIdMonthly);
    expect(PRO_PLANS.growth.amount).toBe(dollarsToCents(growth.priceMonthly));
  });

  it('pro Enterprise matches IDs and is custom-priced (0) on both sides', () => {
    const ent = BILLING_PRODUCTS['pro-enterprise'];
    expect(PRO_PLANS.enterprise.product_id).toBe(ent.stripeProductId);
    expect(PRO_PLANS.enterprise.price_id).toBe(ent.stripePriceIdMonthly);
    expect(ent.priceMonthly).toBe(0);
    expect(PRO_PLANS.enterprise.amount).toBe(0);
    expect(STRIPE_PRODUCTS['pro-enterprise'].price).toBe(0);
  });

  it('legacy STRIPE_PRODUCTS price IDs match billing/config.ts', () => {
    expect(STRIPE_PRODUCTS['consumer-explorer'].price_monthly_id).toBe(
      BILLING_PRODUCTS['consumer-explorer'].stripePriceIdMonthly,
    );
    expect(STRIPE_PRODUCTS['consumer-explorer'].price_annual_id).toBe(
      BILLING_PRODUCTS['consumer-explorer'].stripePriceIdAnnual,
    );
    expect(STRIPE_PRODUCTS['consumer-frequent-chraveler'].price_monthly_id).toBe(
      BILLING_PRODUCTS['consumer-frequent-chraveler'].stripePriceIdMonthly,
    );
    expect(STRIPE_PRODUCTS['consumer-frequent-chraveler'].price_annual_id).toBe(
      BILLING_PRODUCTS['consumer-frequent-chraveler'].stripePriceIdAnnual,
    );
    expect(STRIPE_PRODUCTS['pro-starter'].price).toBe(BILLING_PRODUCTS['pro-starter'].priceMonthly);
    expect(STRIPE_PRODUCTS['pro-growing'].price).toBe(BILLING_PRODUCTS['pro-growth'].priceMonthly);
  });

  it('Trip Passes match (product IDs, price IDs, price, duration)', () => {
    const explorerPass = TRIP_PASS_PRODUCTS['pass-explorer-45'];
    const explorerPassLegacy = TRIP_PASS_PLANS['pass-explorer-45'];
    expect(explorerPassLegacy.product_id).toBe(explorerPass.stripeProductId);
    expect(explorerPassLegacy.price_id).toBe(explorerPass.stripePriceId);
    expect(explorerPassLegacy.amount).toBe(dollarsToCents(explorerPass.price));
    expect(explorerPassLegacy.durationDays).toBe(explorerPass.durationDays);
    expect(explorerPass.appleProductId).toBe('com.chravel.trippass.explorer');

    const fcPass = TRIP_PASS_PRODUCTS['pass-frequent-90'];
    const fcPassLegacy = TRIP_PASS_PLANS['pass-frequent-90'];
    expect(fcPassLegacy.product_id).toBe(fcPass.stripeProductId);
    expect(fcPassLegacy.price_id).toBe(fcPass.stripePriceId);
    expect(fcPassLegacy.amount).toBe(dollarsToCents(fcPass.price));
    expect(fcPassLegacy.durationDays).toBe(fcPass.durationDays);
    expect(fcPass.appleProductId).toBe('com.chravel.trippass.frequent');
  });
});

describe('pricing parity — constants/revenuecat.ts mirrors billing/config.ts', () => {
  it('RevenueCat display pricing matches Stripe subscription pricing', () => {
    expect(REVENUECAT_PRICING.explorer.monthly).toBe(
      BILLING_PRODUCTS['consumer-explorer'].priceMonthly,
    );
    expect(REVENUECAT_PRICING.explorer.annual).toBe(
      BILLING_PRODUCTS['consumer-explorer'].priceAnnual,
    );
    expect(REVENUECAT_PRICING.frequentChraveler.monthly).toBe(
      BILLING_PRODUCTS['consumer-frequent-chraveler'].priceMonthly,
    );
    expect(REVENUECAT_PRICING.frequentChraveler.annual).toBe(
      BILLING_PRODUCTS['consumer-frequent-chraveler'].priceAnnual,
    );
  });

  it('RevenueCat trip-pass product IDs match billing/config Trip Pass appleProductId', () => {
    expect(REVENUECAT_PRODUCTS.explorerPass45).toBe('com.chravel.trippass.explorer');
    expect(REVENUECAT_PRODUCTS.frequentChravelerPass90).toBe('com.chravel.trippass.frequent');
    expect(isTripPassProductId(REVENUECAT_PRODUCTS.explorerPass45)).toBe(true);
  });

  it('RevenueCat trip-pass pricing matches Stripe trip-pass pricing', () => {
    expect(REVENUECAT_PRICING.tripPasses.explorer.price).toBe(
      TRIP_PASS_PRODUCTS['pass-explorer-45'].price,
    );
    expect(REVENUECAT_PRICING.tripPasses.explorer.durationDays).toBe(
      TRIP_PASS_PRODUCTS['pass-explorer-45'].durationDays,
    );
    expect(REVENUECAT_PRICING.tripPasses.frequentChraveler.price).toBe(
      TRIP_PASS_PRODUCTS['pass-frequent-90'].price,
    );
    expect(REVENUECAT_PRICING.tripPasses.frequentChraveler.durationDays).toBe(
      TRIP_PASS_PRODUCTS['pass-frequent-90'].durationDays,
    );
  });

  it('every paid tier has a RevenueCat entitlement → tier mapping', () => {
    const mappedTiers = new Set(Object.values(ENTITLEMENT_TO_TIER));
    for (const tier of ['explorer', 'frequent-chraveler'] as const) {
      expect(mappedTiers.has(tier)).toBe(true);
    }
  });
});

describe('limit parity — FEATURE_LIMITS aligns with FREEMIUM_LIMITS storage', () => {
  it('ai_concierge caps match marketed per-trip limits', () => {
    expect(FEATURE_LIMITS.ai_concierge.free).toBe(FREEMIUM_LIMITS.free.aiQueriesPerTrip);
    expect(FEATURE_LIMITS.ai_concierge.free).toBe(3);
    expect(FEATURE_LIMITS.ai_concierge.explorer).toBe(FREEMIUM_LIMITS.explorer.aiQueriesPerTrip);
    expect(FEATURE_LIMITS.ai_concierge.explorer).toBe(25);
    expect(FEATURE_LIMITS.ai_concierge['frequent-chraveler']).toBe(-1);
  });

  it('media_upload caps match the enforced storage caps (MB)', () => {
    expect(FEATURE_LIMITS.media_upload.free).toBe(FREEMIUM_LIMITS.free.storageAccountMB);
    expect(FEATURE_LIMITS.media_upload.explorer).toBe(FREEMIUM_LIMITS.explorer.storageAccountMB);
    // Frequent Chraveler is unlimited on both sides (-1)
    expect(FEATURE_LIMITS.media_upload['frequent-chraveler']).toBe(
      FREEMIUM_LIMITS['frequent-chraveler'].storageAccountMB,
    );
  });

  it('event_creation: events folded into Frequent Chraveler (Free/Explorer 3, FC unlimited)', () => {
    // Events are an FC benefit. Free + Explorer get 3 events total; FC/Pro unlimited (-1).
    expect(FEATURE_LIMITS.event_creation.free).toBe(3);
    expect(FEATURE_LIMITS.event_creation.explorer).toBe(3);
    expect(FEATURE_LIMITS.event_creation['frequent-chraveler']).toBe(-1);
    expect(FEATURE_LIMITS.event_creation['pro-starter']).toBe(-1);
    // FEATURE_LIMITS and FREEMIUM_LIMITS must agree on the event caps.
    expect(FREEMIUM_LIMITS.free.eventsLimit).toBe(FEATURE_LIMITS.event_creation.free);
    expect(FREEMIUM_LIMITS.explorer.eventsLimit).toBe(FEATURE_LIMITS.event_creation.explorer);
    expect(FREEMIUM_LIMITS['frequent-chraveler'].eventsLimit).toBe(
      FEATURE_LIMITS.event_creation['frequent-chraveler'],
    );
  });
});

describe('pricing parity — secondary numeric tables derive from billing/config.ts', () => {
  it('CONSUMER_PRICING matches config (no hardcoded consumer prices)', () => {
    expect(CONSUMER_PRICING.explorer.monthly).toBe(
      BILLING_PRODUCTS['consumer-explorer'].priceMonthly,
    );
    expect(CONSUMER_PRICING.explorer.annual).toBe(
      BILLING_PRODUCTS['consumer-explorer'].priceAnnual,
    );
    expect(CONSUMER_PRICING['frequent-chraveler'].monthly).toBe(
      BILLING_PRODUCTS['consumer-frequent-chraveler'].priceMonthly,
    );
    expect(CONSUMER_PRICING['frequent-chraveler'].annual).toBe(
      BILLING_PRODUCTS['consumer-frequent-chraveler'].priceAnnual,
    );
    expect(CONSUMER_PRICING.explorer.tripPass).toBe(TRIP_PASS_PRODUCTS['pass-explorer-45'].price);
    expect(CONSUMER_PRICING['frequent-chraveler'].tripPass).toBe(
      TRIP_PASS_PRODUCTS['pass-frequent-90'].price,
    );
  });

  it('SUBSCRIPTION_TIERS (Pro) matches config (no hardcoded pro prices)', () => {
    expect(SUBSCRIPTION_TIERS.starter.price).toBe(BILLING_PRODUCTS['pro-starter'].priceMonthly);
    expect(SUBSCRIPTION_TIERS.growing.price).toBe(BILLING_PRODUCTS['pro-growth'].priceMonthly);
    expect(SUBSCRIPTION_TIERS.enterprise.price).toBe(
      BILLING_PRODUCTS['pro-enterprise'].priceMonthly,
    );
  });

  it('pricingDisplay renders config-derived labels', () => {
    expect(CONSUMER_PRICE_DISPLAY.explorer.monthly).toBe(
      formatExpected(BILLING_PRODUCTS['consumer-explorer'].priceMonthly),
    );
    expect(CONSUMER_PRICE_DISPLAY.explorer.annual).toBe(
      formatExpected(BILLING_PRODUCTS['consumer-explorer'].priceAnnual!),
    );
    // annual-per-month is always 2dp
    expect(CONSUMER_PRICE_DISPLAY.explorer.annualPerMonth).toBe(
      `$${(BILLING_PRODUCTS['consumer-explorer'].priceAnnual! / 12).toFixed(2)}`,
    );
  });
});

describe('marketing plan permissions parity', () => {
  it('Explorer grants unlimited saved trips and standard planning exports', () => {
    const explorer = BILLING_PRODUCTS['consumer-explorer'];
    expect(explorer.entitlements).toEqual(
      expect.arrayContaining([
        'ai_queries_extended',
        'trips_unlimited',
        'pdf_export',
        'calendar_sync',
      ]),
    );
    expect(explorer.entitlements).not.toContain('trips_extended');
    expect(FEATURE_LIMITS.trip_creation.explorer).toBe(FREEMIUM_LIMITS.explorer.activeTripsLimit);
    expect(FEATURE_LIMITS.ai_concierge.explorer).toBe(FREEMIUM_LIMITS.explorer.aiQueriesPerTrip);
  });

  it('Frequent Chraveler grants unlimited consumer usage plus role-based channels', () => {
    const frequent = BILLING_PRODUCTS['consumer-frequent-chraveler'];
    expect(frequent.entitlements).toEqual(
      expect.arrayContaining([
        'ai_queries_unlimited',
        'trips_unlimited',
        'pdf_export',
        'calendar_sync',
        'channels_enabled',
        'roles_enabled',
      ]),
    );
    expect(FEATURE_LIMITS.ai_concierge['frequent-chraveler']).toBe(-1);
    expect(FEATURE_LIMITS.trip_creation['frequent-chraveler']).toBe(-1);
    expect(FEATURE_LIMITS.channels['frequent-chraveler']).toBe(-1);
    expect(FEATURE_LIMITS.roles['frequent-chraveler']).toBe(-1);
  });
});

describe('completeness — every paid Stripe tier exposes required IDs', () => {
  it('each consumer/pro product has a monthly price ID; consumer tiers have Apple IDs', () => {
    for (const [key, product] of Object.entries(BILLING_PRODUCTS)) {
      expect(product.stripeProductId, `${key} stripeProductId`).toMatch(/^prod_/);
      expect(product.stripePriceIdMonthly, `${key} stripePriceIdMonthly`).toMatch(/^price_/);
      if (product.requiresIAPOnIOS) {
        expect(product.appleProductIdMonthly, `${key} appleProductIdMonthly`).toBeTruthy();
      }
    }
  });
});
