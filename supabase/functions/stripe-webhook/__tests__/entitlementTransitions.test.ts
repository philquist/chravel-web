import { describe, expect, it } from 'vitest';
import {
  normalizeSeatCount,
  resolveCanceledTransition,
  resolveEntitlementTransition,
} from '../entitlementTransitions';

describe('resolveEntitlementTransition', () => {
  it('supports upgrade and downgrade transitions', () => {
    const upgraded = resolveEntitlementTransition({
      stripeStatus: 'active',
      mappedTier: 'pro-growth',
      subscriptionPeriodEndIso: '2030-01-01T00:00:00.000Z',
      nowIso: '2026-05-24T00:00:00.000Z',
    });
    expect(upgraded.plan).toBe('pro-growth');

    const downgraded = resolveEntitlementTransition({
      stripeStatus: 'unpaid',
      mappedTier: 'pro-growth',
      subscriptionPeriodEndIso: '2030-01-01T00:00:00.000Z',
      nowIso: '2026-05-24T00:00:00.000Z',
    });
    expect(downgraded.plan).toBe('free');
    expect(downgraded.currentPeriodEnd).toBeNull();
  });

  it('keeps grace-period access for payment failure', () => {
    const result = resolveEntitlementTransition({
      stripeStatus: 'past_due',
      mappedTier: 'explorer',
      subscriptionPeriodEndIso: '2026-06-10T00:00:00.000Z',
      nowIso: '2026-05-24T00:00:00.000Z',
    });
    expect(result.plan).toBe('explorer');
    expect(result.status).toBe('past_due');
  });
});

describe('resolveCanceledTransition', () => {
  it('keeps access during cancellation grace and expires after period', () => {
    const grace = resolveCanceledTransition({
      mappedTier: 'pro-starter',
      subscriptionPeriodEndIso: '2026-06-01T00:00:00.000Z',
      nowIso: '2026-05-24T00:00:00.000Z',
    });
    expect(grace.plan).toBe('pro-starter');

    const expired = resolveCanceledTransition({
      mappedTier: 'pro-starter',
      subscriptionPeriodEndIso: '2026-05-01T00:00:00.000Z',
      nowIso: '2026-05-24T00:00:00.000Z',
    });
    expect(expired.plan).toBe('free');
  });
});

describe('normalizeSeatCount', () => {
  it('normalizes seat updates safely', () => {
    expect(normalizeSeatCount(5)).toBe(5);
    expect(normalizeSeatCount(0)).toBe(1);
    expect(normalizeSeatCount(undefined)).toBe(1);
  });
});
