import { useCallback, useRef, useState } from 'react';
import {
  restoreAndSyncEntitlements,
  handlePurchaseResult,
} from '@/integrations/revenuecat/revenuecatClient';
import type {
  DerivedPlan,
  RevenueCatCustomerInfo,
  RevenueCatResult,
} from '@/integrations/revenuecat/types';

export type RestoreState =
  | { status: 'idle' }
  | { status: 'restoring'; attempt: number }
  | {
      status: 'success';
      plan: DerivedPlan;
      subscriptionProductIds: string[];
      tripPassProductIds: string[];
      hasAnyPurchase: boolean;
    }
  | { status: 'error'; message: string; errorCode?: string; attempts: number };

interface UseRestorePurchasesOptions {
  userId: string | null | undefined;
  isDemoMode?: boolean;
  /** Called after each successful restore so callers can re-read server state. */
  onRestored?: (payload: {
    customerInfo: RevenueCatCustomerInfo;
    plan: DerivedPlan;
  }) => void | Promise<void>;
  /** Max automatic retries for transient failures (NETWORK_ERROR / UNKNOWN). Default 2. */
  maxRetries?: number;
}

// Retryable codes cover transient conditions; user-driven CANCELLED and
// hard NOT_SUPPORTED / NOT_CONFIGURED failures must NOT be retried silently.
const RETRYABLE = new Set(['NETWORK_ERROR', 'UNKNOWN']);

const TRIP_PASS_ID_RE = /trippass|\.pass\d+/i;

function partitionProductIds(customerInfo: RevenueCatCustomerInfo) {
  const subs = new Set<string>();
  const passes = new Set<string>();
  const active = customerInfo.entitlements?.active ?? {};
  for (const entitlement of Object.values(active)) {
    if (!entitlement?.productIdentifier) continue;
    (TRIP_PASS_ID_RE.test(entitlement.productIdentifier) ? passes : subs).add(
      entitlement.productIdentifier,
    );
  }
  // `allPurchasedProductIdentifiers` also surfaces one-time (non-consumable)
  // trip passes even after they've expired — useful for the "no active but
  // history exists" case that we still want to acknowledge in the UI.
  for (const pid of customerInfo.allPurchasedProductIdentifiers ?? []) {
    if (TRIP_PASS_ID_RE.test(pid)) passes.add(pid);
  }
  return { subs: [...subs], passes: [...passes] };
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Encapsulates the "Restore Purchases" flow (Apple compliance requirement)
 * with an explicit state machine, exponential backoff for transient errors,
 * and separate reporting for subscriptions vs trip passes.
 *
 * Toasts are still fired via `handlePurchaseResult` so behavior matches the
 * rest of the billing surface; the returned `state` powers inline UI.
 */
export function useRestorePurchases(options: UseRestorePurchasesOptions) {
  const { userId, isDemoMode = false, onRestored, maxRetries = 2 } = options;
  const [state, setState] = useState<RestoreState>({ status: 'idle' });
  const inFlight = useRef(false);

  const restore = useCallback(async () => {
    if (inFlight.current) return;
    if (!userId) {
      setState({
        status: 'error',
        message: 'Please sign in before restoring purchases.',
        attempts: 0,
      });
      return;
    }

    inFlight.current = true;
    let lastResult: RevenueCatResult<{
      customerInfo: RevenueCatCustomerInfo;
      plan: DerivedPlan;
    }> | null = null;

    try {
      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        setState({ status: 'restoring', attempt });
        lastResult = await restoreAndSyncEntitlements(userId, isDemoMode);

        if (lastResult.success && lastResult.data) {
          const { customerInfo, plan } = lastResult.data;
          const { subs, passes } = partitionProductIds(customerInfo);
          setState({
            status: 'success',
            plan,
            subscriptionProductIds: subs,
            tripPassProductIds: passes,
            hasAnyPurchase: subs.length + passes.length > 0,
          });
          await onRestored?.(lastResult.data);
          handlePurchaseResult(
            { success: true, supported: true },
            {
              successMessage: 'Purchases restored',
              successDescription:
                subs.length + passes.length === 0
                  ? 'No active purchases were found on this Apple ID.'
                  : `Restored ${subs.length} subscription${subs.length === 1 ? '' : 's'}${
                      passes.length
                        ? ` and ${passes.length} trip pass${passes.length === 1 ? '' : 'es'}`
                        : ''
                    }.`,
            },
          );
          return;
        }

        // Failure — decide whether to retry.
        const code = lastResult.errorCode;
        const shouldRetry = code && RETRYABLE.has(code) && attempt <= maxRetries;
        if (!shouldRetry) break;
        // Exponential backoff: 400ms, 1200ms, 2800ms…
        await sleep(400 * 2 ** (attempt - 1));
      }

      // All attempts exhausted or non-retryable.
      const result = lastResult ?? {
        success: false,
        supported: true,
        errorCode: 'UNKNOWN' as const,
        error: 'Restore failed',
      };
      setState({
        status: 'error',
        message:
          result.error ||
          (result.errorCode === 'NOT_SUPPORTED'
            ? 'In-app purchases are not available on this device.'
            : 'Restore failed. Please try again.'),
        errorCode: result.errorCode,
        attempts: maxRetries + 1,
      });
      handlePurchaseResult({ ...result, success: false }, { onRetry: restore, context: 'restore' });
    } finally {
      inFlight.current = false;
    }
  }, [userId, isDemoMode, maxRetries, onRestored]);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, restore, reset };
}
