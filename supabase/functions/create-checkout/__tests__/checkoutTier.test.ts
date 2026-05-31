import { describe, expect, it } from 'vitest';
import { normalizeSubscriptionTierForCheckout } from '../checkoutTier';

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
});
