export const USER_ENTITLEMENT_CONFLICT_TARGET = 'user_id,purchase_type';

export type EntitlementKeyRow = {
  user_id: string;
  purchase_type: 'subscription' | 'pass';
  plan: string;
};

/** Regex for App Store Trip Pass SKUs — keep in sync with src/constants/revenuecat.ts */
export const TRIP_PASS_PRODUCT_ID_RE = /trippass|\.pass\d+/i;

export type RevenueCatPurchaseType = 'subscription' | 'pass';

export function isTripPassProductId(productId: string | null | undefined): boolean {
  if (!productId) return false;
  return TRIP_PASS_PRODUCT_ID_RE.test(productId);
}

export function resolvePurchaseTypeForProductId(
  productId: string | null | undefined,
): RevenueCatPurchaseType {
  return isTripPassProductId(productId) ? 'pass' : 'subscription';
}

/**
 * Test helper that models Postgres upsert semantics on (user_id, purchase_type).
 */
export const applyEntitlementUpserts = (rows: EntitlementKeyRow[]): EntitlementKeyRow[] => {
  const byKey = new Map<string, EntitlementKeyRow>();
  for (const row of rows) {
    byKey.set(`${row.user_id}:${row.purchase_type}`, row);
  }
  return [...byKey.values()];
};
