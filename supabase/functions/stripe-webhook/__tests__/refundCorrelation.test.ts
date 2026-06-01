import { describe, expect, it } from 'vitest';
import {
  extractRefundedPurchaseType,
  resolvePaymentIntentId,
  shouldRevokeTripPassOnRefund,
} from '../refundCorrelation';

describe('shouldRevokeTripPassOnRefund', () => {
  it('revokes only when the refunded checkout was a Trip Pass', () => {
    expect(shouldRevokeTripPassOnRefund('pass')).toBe(true);
    expect(shouldRevokeTripPassOnRefund('subscription')).toBe(false);
    expect(shouldRevokeTripPassOnRefund(null)).toBe(false);
    expect(shouldRevokeTripPassOnRefund(undefined)).toBe(false);
  });
});

describe('extractRefundedPurchaseType', () => {
  it('reads purchase_type from checkout session metadata', () => {
    expect(extractRefundedPurchaseType({ metadata: { purchase_type: 'pass' } })).toBe('pass');
    expect(extractRefundedPurchaseType({ metadata: { purchase_type: 'subscription' } })).toBe(
      'subscription',
    );
    expect(extractRefundedPurchaseType({ metadata: {} })).toBeNull();
    expect(extractRefundedPurchaseType(undefined)).toBeNull();
  });
});

describe('resolvePaymentIntentId', () => {
  it('normalizes string and expanded PaymentIntent shapes', () => {
    expect(resolvePaymentIntentId('pi_123')).toBe('pi_123');
    expect(resolvePaymentIntentId({ id: 'pi_456' })).toBe('pi_456');
    expect(resolvePaymentIntentId(null)).toBeNull();
    expect(resolvePaymentIntentId(undefined)).toBeNull();
  });
});
