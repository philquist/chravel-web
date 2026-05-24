import { describe, expect, it } from 'vitest';
import {
  ENTITLEMENT_STALE_WINDOW_MS,
  normalizeFromEntitlement,
  normalizeStripeStatus,
  shouldReconcileFromStripe,
} from '../entitlementState.ts';

describe('check-subscription entitlementState', () => {
  it('uses active pass entitlement as subscribed response', () => {
    const response = normalizeFromEntitlement({
      user_id: 'u1',
      plan: 'explorer',
      status: 'active',
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
      purchase_type: 'pass',
      updated_at: new Date().toISOString(),
    });

    expect(response.subscribed).toBe(true);
    expect(response.purchase_type).toBe('pass');
    expect(response.status).toBe('active');
  });

  it('reconciles stale non-effective subscription rows', () => {
    const now = new Date('2026-04-14T12:00:00.000Z');
    const result = shouldReconcileFromStripe(
      [
        {
          user_id: 'u1',
          plan: 'explorer',
          status: 'expired',
          current_period_end: null,
          purchase_type: 'subscription',
          updated_at: new Date(now.getTime() - ENTITLEMENT_STALE_WINDOW_MS - 1).toISOString(),
        },
      ],
      now,
    );

    expect(result.shouldReconcile).toBe(true);
  });

  it('does not reconcile fresh pass rows even when non-effective', () => {
    const now = new Date('2026-04-14T12:00:00.000Z');
    const result = shouldReconcileFromStripe(
      [
        {
          user_id: 'u1',
          plan: 'explorer',
          status: 'expired',
          current_period_end: null,
          purchase_type: 'pass',
          updated_at: new Date(now.getTime() - 1_000).toISOString(),
        },
      ],
      now,
    );

    expect(result.shouldReconcile).toBe(false);
  });

  it('normalizes Stripe non-effective statuses to inactive', () => {
    expect(normalizeStripeStatus('incomplete')).toBe('inactive');
    expect(normalizeStripeStatus('unpaid')).toBe('inactive');
  });

  it('webhook delayed scenario: stale local expired subscription triggers reconciliation', () => {
    const now = new Date('2026-04-15T12:00:00.000Z');
    const result = shouldReconcileFromStripe(
      [
        {
          user_id: 'u1',
          plan: 'explorer',
          status: 'expired',
          current_period_end: null,
          purchase_type: 'subscription',
          updated_at: new Date(now.getTime() - ENTITLEMENT_STALE_WINDOW_MS - 10_000).toISOString(),
        },
      ],
      now,
    );

    expect(result.shouldReconcile).toBe(true);
    expect(result.primary?.status).toBe('expired');
  });

  it('webhook success scenario: fresh active subscription does not re-reconcile', () => {
    const now = new Date('2026-04-15T12:00:00.000Z');
    const result = shouldReconcileFromStripe(
      [
        {
          user_id: 'u1',
          plan: 'frequent-chraveler',
          status: 'active',
          current_period_end: new Date(now.getTime() + 86_400_000).toISOString(),
          purchase_type: 'subscription',
          updated_at: new Date(now.getTime() - 30_000).toISOString(),
        },
      ],
      now,
    );

    expect(result.shouldReconcile).toBe(false);
    expect(result.primary?.plan).toBe('frequent-chraveler');
  });
});
