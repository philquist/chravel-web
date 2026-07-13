/**
 * Distribute a total amount equally across participants in whole cents.
 * Remainder pennies are assigned deterministically to the first N participants.
 */
export function distributeEqualSplitCents(totalAmount: number, participantCount: number): number[] {
  if (participantCount <= 0) return [];
  if (!Number.isFinite(totalAmount) || totalAmount < 0) return [];

  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / participantCount);
  const remainder = totalCents - baseCents * participantCount;

  return Array.from({ length: participantCount }, (_, index) => {
    const cents = baseCents + (index < remainder ? 1 : 0);
    return cents / 100;
  });
}

/**
 * Distribute a total by percentage shares in whole cents.
 * Uses largest-remainder so the shares always sum exactly to the total.
 * Percentages need not sum to exactly 100 — they are treated as relative weights
 * when the sum is positive (callers should still validate ~100 for UX).
 */
export function distributePercentageSplitCents(
  totalAmount: number,
  percentages: number[],
): number[] {
  if (percentages.length === 0) return [];
  if (!Number.isFinite(totalAmount) || totalAmount < 0) return [];

  const totalCents = Math.round(totalAmount * 100);
  const weightSum = percentages.reduce(
    (sum, p) => sum + (Number.isFinite(p) ? Math.max(p, 0) : 0),
    0,
  );
  if (weightSum <= 0) {
    return percentages.map(() => 0);
  }

  const raw = percentages.map(p => {
    const weight = Number.isFinite(p) ? Math.max(p, 0) : 0;
    return (totalCents * weight) / weightSum;
  });
  const floors = raw.map(value => Math.floor(value));
  const remainder = totalCents - floors.reduce((sum, cents) => sum + cents, 0);

  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  const result = [...floors];
  for (let i = 0; i < remainder; i += 1) {
    result[order[i % order.length].index] += 1;
  }

  return result.map(cents => cents / 100);
}

/** Sum of distributed shares — should equal totalAmount within floating tolerance. */
export function sumSplitShares(shares: number[]): number {
  return shares.reduce((sum, share) => sum + share, 0);
}

/**
 * Display amount for equal splits. Returns the majority (base) share; when shares
 * are uniform, all participants owe the same amount.
 */
export function getDisplayPerPersonAmount(totalAmount: number, participantCount: number): number {
  const shares = distributeEqualSplitCents(totalAmount, participantCount);
  if (shares.length === 0) return 0;
  return Math.min(...shares);
}

export function hasUniformSplitShares(shares: number[]): boolean {
  if (shares.length <= 1) return true;
  const first = shares[0];
  return shares.every(share => Math.abs(share - first) < 0.0001);
}

export type PaymentSplitType = 'equal' | 'custom' | 'percentage';

const CENTS_TOLERANCE = 0;

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function seedEqualAmountMap(
  totalAmount: number,
  participantIds: string[],
): Record<string, number> {
  const shares = distributeEqualSplitCents(totalAmount, participantIds.length);
  return Object.fromEntries(participantIds.map((id, index) => [id, shares[index] ?? 0]));
}

export function seedEqualPercentageMap(participantIds: string[]): Record<string, number> {
  if (participantIds.length === 0) return {};
  const base = Math.floor(10000 / participantIds.length) / 100; // two-decimal %
  const map: Record<string, number> = {};
  let allocated = 0;
  participantIds.forEach((id, index) => {
    if (index === participantIds.length - 1) {
      map[id] = Math.round((100 - allocated) * 100) / 100;
    } else {
      map[id] = base;
      allocated += base;
    }
  });
  return map;
}

export function amountsFromPercentageMap(
  totalAmount: number,
  participantIds: string[],
  percentages: Record<string, number>,
): Record<string, number> {
  const pctList = participantIds.map(id => percentages[id] ?? 0);
  const shares = distributePercentageSplitCents(totalAmount, pctList);
  return Object.fromEntries(participantIds.map((id, index) => [id, shares[index] ?? 0]));
}

export function validateCustomAmountMap(
  totalAmount: number,
  participantIds: string[],
  amounts: Record<string, number>,
): { ok: true } | { ok: false; error: string } {
  if (participantIds.length === 0) {
    return { ok: false, error: 'At least one participant must be selected' };
  }

  for (const id of participantIds) {
    const value = amounts[id];
    if (value === undefined || !Number.isFinite(value) || value < 0) {
      return { ok: false, error: 'Every participant needs a non-negative amount' };
    }
  }

  const totalCents = toCents(totalAmount);
  const sumCents = participantIds.reduce((sum, id) => sum + toCents(amounts[id] ?? 0), 0);
  if (Math.abs(sumCents - totalCents) > CENTS_TOLERANCE) {
    const sum = sumCents / 100;
    return {
      ok: false,
      error: `Custom amounts must add up to the total ($${totalAmount.toFixed(2)}). Currently $${sum.toFixed(2)}.`,
    };
  }

  return { ok: true };
}

export function validatePercentageMap(
  participantIds: string[],
  percentages: Record<string, number>,
): { ok: true } | { ok: false; error: string } {
  if (participantIds.length === 0) {
    return { ok: false, error: 'At least one participant must be selected' };
  }

  for (const id of participantIds) {
    const value = percentages[id];
    if (value === undefined || !Number.isFinite(value) || value < 0) {
      return { ok: false, error: 'Every participant needs a non-negative percentage' };
    }
  }

  const sum = participantIds.reduce((acc, id) => acc + (percentages[id] ?? 0), 0);
  if (Math.abs(sum - 100) > 0.05) {
    return {
      ok: false,
      error: `Percentages must add up to 100%. Currently ${sum.toFixed(1)}%.`,
    };
  }

  return { ok: true };
}

/**
 * Resolve final per-participant dollar amounts for any split type.
 * Equal / percentage compute shares; custom validates the user-entered map.
 */
export function resolveSplitAmounts(
  splitType: PaymentSplitType,
  totalAmount: number,
  participantIds: string[],
  customAmounts?: Record<string, number>,
  percentages?: Record<string, number>,
): { amounts: Record<string, number> } | { error: string } {
  if (participantIds.length === 0) {
    return { error: 'At least one participant must be selected' };
  }
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return { error: 'Amount must be greater than 0' };
  }

  if (splitType === 'equal') {
    return { amounts: seedEqualAmountMap(totalAmount, participantIds) };
  }

  if (splitType === 'percentage') {
    const pctValidation = validatePercentageMap(participantIds, percentages ?? {});
    if (pctValidation.ok === false) return { error: pctValidation.error };
    return {
      amounts: amountsFromPercentageMap(totalAmount, participantIds, percentages ?? {}),
    };
  }

  // custom
  const customValidation = validateCustomAmountMap(
    totalAmount,
    participantIds,
    customAmounts ?? {},
  );
  if (customValidation.ok === false) return { error: customValidation.error };
  return {
    amounts: Object.fromEntries(participantIds.map(id => [id, customAmounts?.[id] ?? 0])),
  };
}
