import { describe, expect, it } from 'vitest';
import { normalizePaymentRows } from '@/hooks/usePayments';

describe('normalizePaymentRows', () => {
  it.each([undefined, null, {}, 'bad'])('returns [] for non-array values: %p', input => {
    expect(normalizePaymentRows(input)).toEqual([]);
  });

  it('preserves valid array rows', () => {
    const rows = [
      { id: 'pay-1', amount: 100 },
      { id: 'pay-2', amount: 200 },
    ];

    expect(normalizePaymentRows(rows)).toBe(rows);
    expect(normalizePaymentRows(rows)).toEqual(rows);
  });
});
