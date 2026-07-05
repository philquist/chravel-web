import { resolveEffectiveEntitlement } from '../entitlementSelection.ts';

export type UsagePlan = 'free' | 'explorer' | 'frequent_chraveler';

const CONCIERGE_TRIP_QUERY_LIMITS: Record<UsagePlan, number | null> = {
  free: 3,
  explorer: 25,
  frequent_chraveler: null,
};

const getConciergeTripQueryLimit = (plan: UsagePlan): number | null =>
  CONCIERGE_TRIP_QUERY_LIMITS[plan] ?? null;

export interface UsagePlanResolution {
  usagePlan: UsagePlan;
  tripQueryLimit: number | null;
}

export interface TokenBudgetCheckResult {
  allowed: boolean;
  usedTokens: number;
  tokenBudget: number | null;
}

const EXPLORER_PRODUCT_IDS = new Set([
  'prod_U73VxEnvEHbBrx',
  'prod_U73VrTc4sE8AIv',
  'prod_U73WaALe9yjrAR',
]);

/**
 * Monthly token budgets per user plan.
 *
 * These defaults intentionally track usage cost more closely than request-count
 * limits while remaining conservative:
 * - free: roughly 20 medium-sized requests/month
 * - explorer: roughly 100 medium-sized requests/month
 * - frequent_chraveler: unlimited
 *
 * Environment overrides allow tuning without code changes.
 */
const MONTHLY_TOKEN_BUDGETS: Record<UsagePlan, number | null> = {
  free: Number(Deno.env.get('CONCIERGE_FREE_MONTHLY_TOKEN_BUDGET') || 100_000),
  explorer: Number(Deno.env.get('CONCIERGE_EXPLORER_MONTHLY_TOKEN_BUDGET') || 600_000),
  frequent_chraveler:
    Number(Deno.env.get('CONCIERGE_FREQUENT_MONTHLY_TOKEN_BUDGET') || 0) > 0
      ? Number(Deno.env.get('CONCIERGE_FREQUENT_MONTHLY_TOKEN_BUDGET'))
      : null,
};

export const getTripQueryLimitForUsagePlan = (plan: UsagePlan): number | null =>
  getConciergeTripQueryLimit(plan);

export const getMonthlyTokenBudgetForUsagePlan = (plan: UsagePlan): number | null =>
  MONTHLY_TOKEN_BUDGETS[plan] ?? null;

// Legacy profiles-fallback status check (profiles has no period column). The primary
// user_entitlements path uses the canonical hasEffectiveAccess predicate instead.
const isActiveEntitlementStatus = (status: string | null | undefined): boolean =>
  status === 'active' || status === 'trialing';

export const mapRawPlanToUsagePlan = (plan: string | null | undefined): UsagePlan => {
  if (!plan || plan === 'free' || plan === 'consumer') return 'free';
  if (plan === 'explorer' || plan === 'plus') return 'explorer';
  return 'frequent_chraveler';
};

export async function resolveUsagePlanForUser(
  supabase: any,
  userId: string,
): Promise<UsagePlanResolution> {
  const defaultResolution: UsagePlanResolution = {
    usagePlan: 'free',
    tripQueryLimit: getTripQueryLimitForUsagePlan('free'),
  };

  const { data: entitlementRows, error: entitlementError } = await supabase
    .from('user_entitlements')
    .select('user_id, plan, status, current_period_end, purchase_type, updated_at')
    .eq('user_id', userId)
    .in('purchase_type', ['subscription', 'pass'])
    .order('updated_at', { ascending: false });

  if (entitlementError) {
    console.error('[UsagePolicy] Failed to read user_entitlements:', entitlementError);
  }

  // Use the canonical hasEffectiveAccess predicate (via resolveEffectiveEntitlement) so
  // the edge concierge matches the entitlement selectors and the client: active, trialing,
  // past_due (dunning grace), and canceled-with-a-future-period all keep access until the
  // paid period actually ends. Previously the row was re-judged with a stricter local
  // check that dropped past_due / canceled-in-period, silently downgrading paying users to
  // the free 3-asks/trip cap while the rest of the app still showed them as subscribed.
  const effectiveEntitlement = resolveEffectiveEntitlement(entitlementRows || []);

  if (effectiveEntitlement && effectiveEntitlement.has_access) {
    const usagePlan = mapRawPlanToUsagePlan(effectiveEntitlement.plan);
    return {
      usagePlan,
      tripQueryLimit: getTripQueryLimitForUsagePlan(usagePlan),
    };
  }

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('app_role, subscription_status, subscription_product_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('[UsagePolicy] Failed to read profiles fallback fields:', profileError);
    return defaultResolution;
  }

  if (profileData && isActiveEntitlementStatus(profileData.subscription_status)) {
    const productId = String(profileData.subscription_product_id || '');
    if (productId && EXPLORER_PRODUCT_IDS.has(productId)) {
      return { usagePlan: 'explorer', tripQueryLimit: getTripQueryLimitForUsagePlan('explorer') };
    }
    if (productId) {
      return {
        usagePlan: 'frequent_chraveler',
        tripQueryLimit: getTripQueryLimitForUsagePlan('frequent_chraveler'),
      };
    }
  }

  const fallbackPlan = mapRawPlanToUsagePlan(profileData?.app_role);
  return {
    usagePlan: fallbackPlan,
    tripQueryLimit: getTripQueryLimitForUsagePlan(fallbackPlan),
  };
}

export async function checkMonthlyTokenBudget(
  supabase: any,
  userId: string,
  usagePlan: UsagePlan,
): Promise<TokenBudgetCheckResult> {
  const tokenBudget = getMonthlyTokenBudgetForUsagePlan(usagePlan);
  if (!tokenBudget || tokenBudget <= 0) {
    return { allowed: true, usedTokens: 0, tokenBudget: null };
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setUTCMonth(nextMonthStart.getUTCMonth() + 1);

  const { data, error } = await supabase
    .from('concierge_usage')
    .select('prompt_tokens, response_tokens')
    .eq('user_id', userId)
    .gte('created_at', monthStart.toISOString())
    .lt('created_at', nextMonthStart.toISOString());

  if (error) {
    console.error('[UsagePolicy] Failed to read monthly token usage:', error);
    return { allowed: true, usedTokens: 0, tokenBudget };
  }

  const usedTokens = (data || []).reduce((sum: number, row: Record<string, unknown>) => {
    const promptTokens = Number(row.prompt_tokens || 0);
    const responseTokens = Number(row.response_tokens || 0);
    return sum + promptTokens + responseTokens;
  }, 0);

  return {
    allowed: usedTokens < tokenBudget,
    usedTokens,
    tokenBudget,
  };
}
