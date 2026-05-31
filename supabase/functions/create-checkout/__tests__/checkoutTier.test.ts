import { describe, expect, it } from 'vitest';
import {
  normalizeSubscriptionTierForCheckout,
  shouldBlockConsumerStripeCheckout,
} from '../checkoutTier';

describe('normalizeSubscriptionTierForCheckout', () => {
  it('keeps canonical subscription tiers unchanged', () => {
    expect(normalizeSubscriptionTierForCheckout('explorer')).toBe('explorer');
    expect(normalizeSubscriptionTierForCheckout('consumer-frequent-chraveler')).toBe(
      'frequent-chraveler',
    );
    expect(normalizeSubscriptionTierForCheckout('pro-growth')).toBe('pro-growth');
  });

  it('preserves the legacy Pro Growing checkout request contract', () => {
    expect(normalizeSubscriptionTierForCheckout('pro-growing')).toBe('pro-growth');
  });

  it('blocks consumer Stripe checkout for native or unknown platform contexts', () => {
    expect(shouldBlockConsumerStripeCheckout('web', 'Mozilla/5.0')).toBe(false);
    expect(shouldBlockConsumerStripeCheckout('unknown', 'Mozilla/5.0')).toBe(true);
    expect(shouldBlockConsumerStripeCheckout('ios', 'Mozilla/5.0')).toBe(true);
    expect(shouldBlockConsumerStripeCheckout('android', 'Mozilla/5.0')).toBe(true);
    expect(shouldBlockConsumerStripeCheckout('web', 'ChravelNative/1')).toBe(true);
    expect(shouldBlockConsumerStripeCheckout('web', 'Mozilla/5.0 (; wv)')).toBe(true);
  });
});
