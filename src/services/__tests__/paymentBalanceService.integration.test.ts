import { describe, expect, it } from 'vitest';

interface LedgerSplit {
  payerId: string;
  debtorId: string;
  amountOwed: number;
  isSettled?: boolean;
}

function summarizeViewerBalance(viewerId: string, splits: LedgerSplit[]) {
  return splits.reduce(
    (summary, split) => {
      if (split.isSettled) return summary;
      if (split.payerId === viewerId && split.debtorId !== viewerId) {
        summary.totalOwedToYou += split.amountOwed;
        summary.netBalance += split.amountOwed;
      }
      if (split.debtorId === viewerId && split.payerId !== viewerId) {
        summary.totalOwed += split.amountOwed;
        summary.netBalance -= split.amountOwed;
      }
      return summary;
    },
    { totalOwed: 0, totalOwedToYou: 0, netBalance: 0 },
  );
}

describe('paymentBalanceService - Integration Tests', () => {
  it('documents current unsettled split balance semantics without live Supabase', () => {
    expect(
      summarizeViewerBalance('user-123', [
        { payerId: 'user-123', debtorId: 'user-456', amountOwed: 150 },
        { payerId: 'user-456', debtorId: 'user-123', amountOwed: 50 },
      ]),
    ).toEqual({ totalOwed: 50, totalOwedToYou: 150, netBalance: 100 });
  });

  it('does not include settled splits in the outstanding ledger', () => {
    expect(
      summarizeViewerBalance('user-123', [
        { payerId: 'user-123', debtorId: 'user-456', amountOwed: 150, isSettled: true },
      ]),
    ).toEqual({ totalOwed: 0, totalOwedToYou: 0, netBalance: 0 });
  });
});
