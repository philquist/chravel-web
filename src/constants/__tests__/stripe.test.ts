import { describe, expect, it } from 'vitest';
import { getPriceId, PRO_PLANS, STRIPE_PRODUCTS, SUBSCRIPTION_TIER_MAP } from '../stripe';

describe('Stripe constants', () => {
  it('maps Pro Growth UI selection to the checkout tier priced by create-checkout', () => {
    expect(SUBSCRIPTION_TIER_MAP.growing).toBe('pro-growth');
    expect(getPriceId(SUBSCRIPTION_TIER_MAP.growing)).toBe(PRO_PLANS.growth.price_id);
  });

  it('keeps the legacy pro-growing product alias equivalent to pro-growth', () => {
    expect(STRIPE_PRODUCTS['pro-growing'].price_id).toBe(STRIPE_PRODUCTS['pro-growth'].price_id);
    expect(STRIPE_PRODUCTS['pro-growing'].product_id).toBe(
      STRIPE_PRODUCTS['pro-growth'].product_id,
    );
  });
});
