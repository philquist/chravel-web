import { describe, expect, it } from 'vitest';
import {
  ENTITLEMENT_TO_PLAN,
  deriveEntitlementFromEvent,
  derivePlanFromEntitlements,
  isStaleExpiration,
  revenueCatIdempotencyKey,
  type RevenueCatEvent,
} from '../eventState';

const baseEvent: RevenueCatEvent = {
  id: 'evt-1',
  type: 'INITIAL_PURCHASE',
  app_user_id: 'rc-customer-1',
  original_app_user_id: '11111111-1111-1111-1111-111111111111',
  entitlement_ids: ['chravel_pro_growth'],
  expiration_at_ms: Date.parse('2030-01-01T00:00:00.000Z'),
};

describe('derivePlanFromEntitlements', () => {
  it('picks the highest-priority plan from active entitlements', () => {
    expect(derivePlanFromEntitlements(['chravel_explorer', 'chravel_pro_growth'])).toBe(
      'pro-growth',
    );
  });

  it('returns free when no entitlement maps', () => {
    expect(derivePlanFromEntitlements([])).toBe('free');
    expect(derivePlanFromEntitlements(['unknown_entitlement'])).toBe('free');
  });

  it('maps every known entitlement id to a plan', () => {
    for (const [id, plan] of Object.entries(ENTITLEMENT_TO_PLAN)) {
      expect(derivePlanFromEntitlements([id])).toBe(plan);
    }
  });
});

describe('deriveEntitlementFromEvent', () => {
  it('activates on purchase and renewal', () => {
    expect(deriveEntitlementFromEvent({ ...baseEvent, type: 'INITIAL_PURCHASE' }).status).toBe(
      'active',
    );
    expect(deriveEntitlementFromEvent({ ...baseEvent, type: 'RENEWAL' }).status).toBe('active');
  });

  it('marks trials as trialing', () => {
    const result = deriveEntitlementFromEvent({
      ...baseEvent,
      type: 'INITIAL_PURCHASE',
      period_type: 'TRIAL',
    });
    expect(result.status).toBe('trialing');
    expect(result.plan).toBe('pro-growth');
  });

  it('keeps access during billing issue (past_due grace) and pause', () => {
    expect(deriveEntitlementFromEvent({ ...baseEvent, type: 'BILLING_ISSUE' }).status).toBe(
      'past_due',
    );
    expect(deriveEntitlementFromEvent({ ...baseEvent, type: 'SUBSCRIPTION_PAUSED' }).status).toBe(
      'active',
    );
  });

  it('revokes access to free on expiration and refund', () => {
    const expired = deriveEntitlementFromEvent({ ...baseEvent, type: 'EXPIRATION' });
    expect(expired.status).toBe('expired');
    expect(expired.plan).toBe('free');

    const refunded = deriveEntitlementFromEvent({ ...baseEvent, type: 'REFUND' });
    expect(refunded.status).toBe('expired');
    expect(refunded.plan).toBe('free');
  });

  it('marks cancellation as canceled but retains plan until period end', () => {
    const result = deriveEntitlementFromEvent({ ...baseEvent, type: 'CANCELLATION' });
    expect(result.status).toBe('canceled');
    expect(result.plan).toBe('pro-growth');
  });

  it('serializes expiration timestamp to ISO', () => {
    expect(deriveEntitlementFromEvent(baseEvent).currentPeriodEnd).toBe('2030-01-01T00:00:00.000Z');
    expect(
      deriveEntitlementFromEvent({ ...baseEvent, expiration_at_ms: undefined }).currentPeriodEnd,
    ).toBeNull();
  });
});

describe('isStaleExpiration (reorder guard)', () => {
  const now = '2026-05-24T00:00:00.000Z';

  it('flags an EXPIRATION when stored access still extends into the future', () => {
    // A late EXPIRATION arriving after a RENEWAL already extended access.
    expect(isStaleExpiration({ type: 'EXPIRATION' }, '2026-06-30T00:00:00.000Z', now)).toBe(true);
  });

  it('does not flag an EXPIRATION that matches expired access', () => {
    expect(isStaleExpiration({ type: 'EXPIRATION' }, '2026-05-01T00:00:00.000Z', now)).toBe(false);
    expect(isStaleExpiration({ type: 'EXPIRATION' }, null, now)).toBe(false);
  });

  it('never flags non-expiration events (refund revokes immediately)', () => {
    expect(isStaleExpiration({ type: 'REFUND' }, '2026-06-30T00:00:00.000Z', now)).toBe(false);
    expect(isStaleExpiration({ type: 'RENEWAL' }, '2026-06-30T00:00:00.000Z', now)).toBe(false);
  });
});

describe('revenueCatIdempotencyKey', () => {
  it('prefixes the event id so it cannot collide with Stripe event ids', () => {
    expect(revenueCatIdempotencyKey(baseEvent)).toBe('rc_evt-1');
  });

  it('falls back to a stable composite key when id is missing', () => {
    const key = revenueCatIdempotencyKey({
      ...baseEvent,
      id: undefined,
      event_timestamp_ms: 1717000000000,
    });
    expect(key).toBe('rc_11111111-1111-1111-1111-111111111111_INITIAL_PURCHASE_1717000000000');
  });
});
