/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paymentService } from '../paymentService';
import { supabase } from '../../integrations/supabase/client';

vi.mock('../../integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

/**
 * Builds a chainable Supabase query mock. `single` resolves to `result`, and the
 * chain itself is awaitable (thenable) so `await from(...).update(...).select(...)`
 * also resolves to `result`. Every chain method is a spy for assertions.
 */
function makeChain(result: { data: any; error: any }) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    update: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(result),
    then: (resolve: any) => resolve(result),
  };
  return chain;
}

describe('paymentService.updatePaymentMessage', () => {
  beforeEach(() => {
    // mockReset drains the mockReturnValueOnce queue so a test that returns early
    // (e.g. the conflict case) doesn't leak an unconsumed chain into the next test.
    (supabase.from as any).mockReset();
  });

  it('uses optimistic locking and redistributes UNSETTLED splits with penny rounding', async () => {
    const readChain = makeChain({ data: { version: 3, split_count: 3 }, error: null });
    const updateChain = makeChain({ data: [{ id: 'pay-1' }], error: null });
    const splitsReadChain = makeChain({
      data: [{ id: 'split-1' }, { id: 'split-2' }, { id: 'split-3' }],
      error: null,
    });
    const splitUpdate1 = makeChain({ data: null, error: null });
    const splitUpdate2 = makeChain({ data: null, error: null });
    const splitUpdate3 = makeChain({ data: null, error: null });

    (supabase.from as any)
      .mockReturnValueOnce(readChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(splitsReadChain)
      .mockReturnValueOnce(splitUpdate1)
      .mockReturnValueOnce(splitUpdate2)
      .mockReturnValueOnce(splitUpdate3);

    const ok = await paymentService.updatePaymentMessage('pay-1', { amount: 10 });

    expect(ok).toBe(true);
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10, version: 4 }),
    );
    expect(updateChain.eq).toHaveBeenCalledWith('version', 3);
    expect(splitUpdate1.update).toHaveBeenCalledWith({ amount_owed: 3.34 });
    expect(splitUpdate2.update).toHaveBeenCalledWith({ amount_owed: 3.33 });
    expect(splitUpdate3.update).toHaveBeenCalledWith({ amount_owed: 3.33 });
  });

  it('returns false on a version conflict and does not touch splits', async () => {
    const readChain = makeChain({ data: { version: 3, split_count: 4 }, error: null });
    const updateChain = makeChain({ data: [], error: null });

    (supabase.from as any).mockReturnValueOnce(readChain).mockReturnValueOnce(updateChain);

    const ok = await paymentService.updatePaymentMessage('pay-1', { amount: 100 });

    expect(ok).toBe(false);
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it('does not recalculate splits when only the description changes', async () => {
    const readChain = makeChain({ data: { version: 1, split_count: 4 }, error: null });
    const updateChain = makeChain({ data: [{ id: 'pay-1' }], error: null });
    const splitChain = makeChain({ data: null, error: null });

    (supabase.from as any)
      .mockReturnValueOnce(readChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(splitChain);

    const ok = await paymentService.updatePaymentMessage('pay-1', { description: 'Updated label' });

    expect(ok).toBe(true);
    expect(supabase.from).toHaveBeenCalledTimes(2); // read + update only, no split write
  });
});
