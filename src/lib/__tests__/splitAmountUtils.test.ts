import { describe, expect, it } from 'vitest';
import {
  amountsFromPercentageMap,
  distributeEqualSplitCents,
  distributePercentageSplitCents,
  getDisplayPerPersonAmount,
  hasUniformSplitShares,
  resolveSplitAmounts,
  seedEqualAmountMap,
  seedEqualPercentageMap,
  sumSplitShares,
  validateCustomAmountMap,
  validatePercentageMap,
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

  it('distributes percentage shares with exact cent total', () => {
    const shares = distributePercentageSplitCents(100, [50, 30, 20]);
    expect(sumSplitShares(shares)).toBeCloseTo(100, 2);
    expect(shares).toEqual([50, 30, 20]);
  });

  it('handles percentage remainders via largest-remainder', () => {
    const shares = distributePercentageSplitCents(10, [33.33, 33.33, 33.34]);
    expect(sumSplitShares(shares)).toBeCloseTo(10, 2);
  });

  it('seeds equal amount and percentage maps', () => {
    expect(seedEqualAmountMap(100, ['a', 'b', 'c'])).toEqual({
      a: 33.34,
      b: 33.33,
      c: 33.33,
    });
    const pct = seedEqualPercentageMap(['a', 'b', 'c']);
    expect(Object.values(pct).reduce((s, n) => s + n, 0)).toBeCloseTo(100, 1);
  });

  it('validates custom amounts must sum to total', () => {
    expect(validateCustomAmountMap(100, ['a', 'b'], { a: 60, b: 40 })).toEqual({ ok: true });
    expect(validateCustomAmountMap(100, ['a', 'b'], { a: 60, b: 30 }).ok).toBe(false);
  });

  it('validates percentages must sum to 100', () => {
    expect(validatePercentageMap(['a', 'b'], { a: 60, b: 40 })).toEqual({ ok: true });
    expect(validatePercentageMap(['a', 'b'], { a: 60, b: 30 }).ok).toBe(false);
  });

  it('resolves percentage split into dollar amounts', () => {
    const result = resolveSplitAmounts('percentage', 90, ['a', 'b', 'c'], undefined, {
      a: 50,
      b: 25,
      c: 25,
    });
    expect('amounts' in result).toBe(true);
    if ('amounts' in result) {
      expect(sumSplitShares(Object.values(result.amounts))).toBeCloseTo(90, 2);
      expect(result.amounts.a).toBe(45);
    }
  });

  it('amountsFromPercentageMap mirrors resolve path', () => {
    const amounts = amountsFromPercentageMap(200, ['x', 'y'], { x: 75, y: 25 });
    expect(amounts).toEqual({ x: 150, y: 50 });
  });
});
