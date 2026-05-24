export type EntitlementStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';

export type BillingStatusTransitionInput = {
  stripeStatus: string;
  mappedTier: string;
  subscriptionPeriodEndIso: string | null;
  nowIso: string;
};

export type EntitlementTransition = {
  plan: string;
  status: EntitlementStatus;
  currentPeriodEnd: string | null;
};

export function mapStripeStatusToEntitlementStatus(status: string): EntitlementStatus {
  if (status === 'active') return 'active';
  if (status === 'trialing') return 'trialing';
  if (status === 'past_due') return 'past_due';
  if (status === 'canceled') return 'canceled';
  return 'expired';
}

export function resolveEntitlementTransition(
  input: BillingStatusTransitionInput,
): EntitlementTransition {
  const status = mapStripeStatusToEntitlementStatus(input.stripeStatus);
  const keepPaid = status === 'active' || status === 'trialing' || status === 'past_due';

  return {
    plan: keepPaid ? input.mappedTier : 'free',
    status,
    currentPeriodEnd: keepPaid ? input.subscriptionPeriodEndIso : null,
  };
}

export function resolveCanceledTransition(params: {
  mappedTier: string;
  subscriptionPeriodEndIso: string;
  nowIso: string;
}): EntitlementTransition {
  const keepsAccess = new Date(params.subscriptionPeriodEndIso) > new Date(params.nowIso);
  return {
    plan: keepsAccess ? params.mappedTier : 'free',
    status: 'canceled',
    currentPeriodEnd: keepsAccess ? params.subscriptionPeriodEndIso : null,
  };
}

export function normalizeSeatCount(quantity: number | null | undefined): number {
  if (!Number.isFinite(quantity) || quantity == null || quantity < 1) return 1;
  return Math.floor(quantity);
}
