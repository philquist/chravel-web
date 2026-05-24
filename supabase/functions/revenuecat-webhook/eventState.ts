/**
 * Pure state-derivation logic for RevenueCat webhook events.
 *
 * Kept free of Deno/Supabase imports so it can be unit-tested in vitest/node.
 * index.ts wires these helpers to the HTTP handler and database.
 */

export type EntitlementStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';

export interface RevenueCatEvent {
  id?: string;
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  expiration_at_ms?: number;
  purchased_at_ms?: number;
  event_timestamp_ms?: number;
  period_type?: string;
  entitlement_ids?: string[];
  product_id?: string;
  store?: string;
  environment?: string;
}

export interface DerivedEntitlement {
  plan: string;
  status: EntitlementStatus;
  currentPeriodEnd: string | null;
}

// RevenueCat event types that affect subscription state.
export const SUBSCRIPTION_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'CANCELLATION',
  'UNCANCELLATION',
  'BILLING_ISSUE',
  'SUBSCRIBER_ALIAS',
  'EXPIRATION',
  'TRANSFER',
  'SUBSCRIPTION_PAUSED',
  'SUBSCRIPTION_EXTENDED',
  'REFUND',
]);

// Entitlement ID → plan mapping (must match RevenueCat dashboard + constants/revenuecat.ts).
export const ENTITLEMENT_TO_PLAN: Record<string, string> = {
  chravel_explorer: 'explorer',
  chravel_frequent_chraveler: 'frequent-chraveler',
  chravel_pro_starter: 'pro-starter',
  chravel_pro_growth: 'pro-growth',
  chravel_pro_enterprise: 'pro-enterprise',
};

export const PLAN_PRIORITY = [
  'free',
  'explorer',
  'frequent-chraveler',
  'pro-starter',
  'pro-growth',
  'pro-enterprise',
];

/**
 * Pick the highest-priority plan from the event's active entitlement ids.
 */
export function derivePlanFromEntitlements(entitlementIds: string[]): string {
  let plan = 'free';
  for (const entitlementId of entitlementIds) {
    const mappedPlan = ENTITLEMENT_TO_PLAN[entitlementId];
    if (mappedPlan && PLAN_PRIORITY.indexOf(mappedPlan) > PLAN_PRIORITY.indexOf(plan)) {
      plan = mappedPlan;
    }
  }
  return plan;
}

/**
 * Map a RevenueCat event to the entitlement row state we persist.
 *
 * SUBSCRIPTION_PAUSED (Google Play) retains access until EXPIRATION fires.
 * BILLING_ISSUE keeps access during the grace period (past_due).
 * EXPIRATION/REFUND revoke access (free/expired).
 */
export function deriveEntitlementFromEvent(event: RevenueCatEvent): DerivedEntitlement {
  const entitlementIds: string[] = event.entitlement_ids || [];
  let plan = derivePlanFromEntitlements(entitlementIds);
  let status: EntitlementStatus;

  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'SUBSCRIPTION_EXTENDED':
    case 'PRODUCT_CHANGE':
    case 'SUBSCRIPTION_PAUSED': // access retained until EXPIRATION
      status = event.period_type === 'TRIAL' ? 'trialing' : 'active';
      break;
    case 'CANCELLATION':
      status = 'canceled';
      break;
    case 'BILLING_ISSUE':
      status = 'past_due';
      break;
    case 'EXPIRATION':
    case 'REFUND':
      status = 'expired';
      plan = 'free';
      break;
    default:
      status = 'active';
  }

  const currentPeriodEnd = event.expiration_at_ms
    ? new Date(event.expiration_at_ms).toISOString()
    : null;

  return { plan, status, currentPeriodEnd };
}

/**
 * Detect an out-of-order EXPIRATION that would wrongly revoke still-valid access.
 *
 * RevenueCat fires EXPIRATION when an entitlement actually lapses, so its
 * expiration timestamp is in the past. If the stored row's current_period_end is
 * still in the future, a newer RENEWAL/EXTENSION already extended access and this
 * EXPIRATION arrived late (reordered/replayed) — applying it would drop a paying
 * user. REFUND is intentionally excluded: a refund revokes access immediately.
 */
export function isStaleExpiration(
  event: Pick<RevenueCatEvent, 'type'>,
  existingCurrentPeriodEnd: string | null,
  nowIso: string,
): boolean {
  if (event.type !== 'EXPIRATION') return false;
  if (!existingCurrentPeriodEnd) return false;
  return new Date(existingCurrentPeriodEnd).getTime() > new Date(nowIso).getTime();
}

/**
 * Provider-scoped idempotency key for the shared webhook_events table.
 * Prefixed so RevenueCat ids can never collide with Stripe's `evt_*` ids.
 */
export function revenueCatIdempotencyKey(event: RevenueCatEvent): string {
  if (event.id) return `rc_${event.id}`;
  // Fallback for older payloads without an id: compose a stable key.
  const ts = event.event_timestamp_ms ?? event.purchased_at_ms ?? 0;
  return `rc_${event.original_app_user_id || event.app_user_id}_${event.type}_${ts}`;
}
