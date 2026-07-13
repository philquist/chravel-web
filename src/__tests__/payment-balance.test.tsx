import { describe, expect, it } from 'vitest';

interface Split {
  paymentId: string;
  payerId: string;
  debtorId: string;
  amountOwed: number;
  settled?: boolean;
}

function calculateNetBalance(viewerId: string, splits: Split[]): number {
  return splits.reduce((net, split) => {
    if (split.settled) return net;
    if (split.payerId === viewerId && split.debtorId !== viewerId) return net + split.amountOwed;
    if (split.debtorId === viewerId && split.payerId !== viewerId) return net - split.amountOwed;
    return net;
  }, 0);
}

describe('Payment Split → Balance Calculation', () => {
  it('keeps unpaid split math aligned with the production ledger semantics', () => {
    expect(
      calculateNetBalance('user-1', [
        { paymentId: 'hotel', payerId: 'user-1', debtorId: 'user-2', amountOwed: 150 },
        { paymentId: 'dinner', payerId: 'user-2', debtorId: 'user-1', amountOwed: 50 },
      ]),
    ).toBe(100);
  });

  it('excludes settled splits from outstanding balances', () => {
    expect(
      calculateNetBalance('user-1', [
        {
          paymentId: 'paid-back',
          payerId: 'user-1',
          debtorId: 'user-2',
          amountOwed: 75,
          settled: true,
        },
        { paymentId: 'taxi', payerId: 'user-3', debtorId: 'user-1', amountOwed: 20 },
      ]),
    ).toBe(-20);
  });
});
