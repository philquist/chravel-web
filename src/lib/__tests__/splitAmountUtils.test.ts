import { describe, expect, it } from 'vitest';
import {
  distributeEqualSplitCents,
  getDisplayPerPersonAmount,
  hasUniformSplitShares,
  sumSplitShares,
} from '../splitAmountUtils';

describe('splitAmountUtils', () => {
  it('distributes $100 across 3 participants with penny remainder', () => {
    const shares = distributeEqualSplitCents(100, 3);
    expect(shares).toEqual([33.34, 33.33, 33.33]);
    expect(sumSplitShares(shares)).toBeCloseTo(100, 2);
  });

  it('distributes evenly when amount divides cleanly', () => {
    const shares = distributeEqualSplitCents(100, 4);
    expect(shares).toEqual([25, 25, 25, 25]);
    expect(hasUniformSplitShares(shares)).toBe(true);
  });

  it('handles 100-way split', () => {
    const shares = distributeEqualSplitCents(100, 100);
    expect(shares).toHaveLength(100);
    expect(sumSplitShares(shares)).toBeCloseTo(100, 2);
  });

  it('returns display amount for empty selection', () => {
    expect(getDisplayPerPersonAmount(50, 0)).toBe(0);
  });

  it('returns base share for uneven splits', () => {
    expect(getDisplayPerPersonAmount(10, 3)).toBe(3.33);
  });
});
