import { describe, expect, it } from 'vitest';
import { mapEntitlementTierToFreemiumTier } from '../uploadService';

describe('mapEntitlementTierToFreemiumTier', () => {
  it('preserves free and explorer limits', () => {
    expect(mapEntitlementTierToFreemiumTier('free')).toBe('free');
    expect(mapEntitlementTierToFreemiumTier('explorer')).toBe('explorer');
  });

  it('maps paid consumer and pro tiers to unlimited upload limits', () => {
    expect(mapEntitlementTierToFreemiumTier('frequent-chraveler')).toBe('frequent-chraveler');
    expect(mapEntitlementTierToFreemiumTier('pro-starter')).toBe('frequent-chraveler');
    expect(mapEntitlementTierToFreemiumTier('pro-growth')).toBe('frequent-chraveler');
    expect(mapEntitlementTierToFreemiumTier('pro-enterprise')).toBe('frequent-chraveler');
  });
});
