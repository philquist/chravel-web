import { describe, expect, it } from 'vitest';
import { resolveUsagePlanForUser } from '../usagePolicy.ts';

type Row = {
  user_id: string;
  plan: string;
  status: string;
  current_period_end: string | null;
  purchase_type: 'subscription' | 'pass';
  updated_at: string;
};

// Minimal supabase stub: the entitlement query terminates at .order(); the profiles
// fallback terminates at .maybeSingle() and returns no legacy subscription.
function makeSupabase(entitlementRows: Row[]) {
  return {
    from(table: string) {
      if (table === 'user_entitlements') {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => Promise.resolve({ data: entitlementRows, error: null }),
        };
        return chain;
      }
      const pchain: Record<string, unknown> = {
        select: () => pchain,
        eq: () => pchain,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return pchain;
    },
  };
}

const row = (status: string, opts: Partial<Row> = {}): Row => ({
  user_id: 'u1',
  plan: 'frequent-chraveler',
  status,
  current_period_end: null,
  purchase_type: 'subscription',
  updated_at: '2026-01-01T00:00:00Z',
  ...opts,
});

const future = new Date(Date.now() + 30 * 864e5).toISOString();
const past = new Date(Date.now() - 30 * 864e5).toISOString();

describe('resolveUsagePlanForUser — access policy (keep access until the paid period ends)', () => {
  it('active subscription → paid (frequent_chraveler, unlimited)', async () => {
    const res = await resolveUsagePlanForUser(makeSupabase([row('active')]) as never, 'u1');
    expect(res.usagePlan).toBe('frequent_chraveler');
    expect(res.tripQueryLimit).toBeNull();
  });

  it('trialing → paid', async () => {
    const res = await resolveUsagePlanForUser(makeSupabase([row('trialing')]) as never, 'u1');
    expect(res.usagePlan).toBe('frequent_chraveler');
  });

  it('past_due (dunning grace) → still paid — regression: previously downgraded to free', async () => {
    const res = await resolveUsagePlanForUser(makeSupabase([row('past_due')]) as never, 'u1');
    expect(res.usagePlan).toBe('frequent_chraveler');
  });

  it('canceled but still within the paid period → paid', async () => {
    const res = await resolveUsagePlanForUser(
      makeSupabase([row('canceled', { current_period_end: future })]) as never,
      'u1',
    );
    expect(res.usagePlan).toBe('frequent_chraveler');
  });

  it('canceled after the paid period ended → free', async () => {
    const res = await resolveUsagePlanForUser(
      makeSupabase([row('canceled', { current_period_end: past })]) as never,
      'u1',
    );
    expect(res.usagePlan).toBe('free');
    expect(res.tripQueryLimit).toBe(3);
  });

  it('expired → free', async () => {
    const res = await resolveUsagePlanForUser(makeSupabase([row('expired')]) as never, 'u1');
    expect(res.usagePlan).toBe('free');
  });

  it('no entitlement rows → free', async () => {
    const res = await resolveUsagePlanForUser(makeSupabase([]) as never, 'u1');
    expect(res.usagePlan).toBe('free');
  });

  it('active explorer plan → explorer (25 asks/trip)', async () => {
    const res = await resolveUsagePlanForUser(
      makeSupabase([row('active', { plan: 'explorer' })]) as never,
      'u1',
    );
    expect(res.usagePlan).toBe('explorer');
    expect(res.tripQueryLimit).toBe(25);
  });
});
