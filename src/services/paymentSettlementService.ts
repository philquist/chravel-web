import { supabase } from '@/integrations/supabase/client';

/**
 * Atomic payment settlement client layer.
 *
 * Crediting transitions (marking money as received/settled) MUST go through the
 * `settle_payment_splits_for_debtor` / `settle_payment_split` RPCs: they lock
 * the parent payment row, enforce party-to-the-split authorization, and guard
 * the unsettled -> settled state transition so concurrent duplicates and
 * network retries cannot double-credit (PLATFORM_AUDIT_CONSTITUTION L51-52).
 *
 * Idempotency mechanism: the status guard itself. Settlement is a one-way
 * per-row transition, so a duplicate request observes `is_settled = true`
 * under the row lock and becomes a reported no-op — no idempotency-key column
 * on the hot `payment_splits` table is needed.
 */

/** RPC error code when the split was already settled by a concurrent caller. */
export const ALREADY_SETTLED_ERROR_CODE = 'ALREADY_SETTLED';
/** RPC error code when the caller is neither the debtor nor the payment creator. */
export const SETTLEMENT_NOT_AUTHORIZED_CODE = 'NOT_AUTHORIZED';

export interface SettleSplitsResult {
  success: boolean;
  /** Splits credited by THIS call. */
  settledCount: number;
  /** Splits skipped because an earlier or concurrent call already settled them. */
  alreadySettledCount: number;
  error?: { code: string; message: string };
}

interface SettleSplitsRpcPayload {
  success?: boolean;
  error?: string;
  settled_count?: number;
  already_settled_count?: number;
}

const SETTLEMENT_ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'You must be signed in to settle payments.',
  NOT_AUTHORIZED: 'Only the payer or the payment creator can settle this payment.',
  INVALID_ARGUMENTS: 'No payments were selected to settle.',
};

/**
 * Atomically settle every unsettled split a debtor owes on the given payment
 * messages. Single RPC call — the database locks each parent payment row,
 * verifies the caller is the debtor or the payment creator, applies the
 * `is_settled = false` status guard, and rolls up the parent settled flag.
 *
 * An all-already-settled outcome returns `success: true` with
 * `settledCount: 0` so retries and double-clicks surface as idempotent
 * successes, never as duplicate credits or user-facing errors.
 */
export async function settleSplitsForDebtor(
  paymentMessageIds: string[],
  debtorUserId: string,
  method: string | null,
): Promise<SettleSplitsResult> {
  if (paymentMessageIds.length === 0) {
    return { success: true, settledCount: 0, alreadySettledCount: 0 };
  }

  const { data, error } = await (supabase.rpc as any)('settle_payment_splits_for_debtor', {
    p_payment_message_ids: paymentMessageIds,
    p_debtor_user_id: debtorUserId,
    p_method: method,
  });

  if (error) {
    if (import.meta.env.DEV) {
      console.error('[paymentSettlementService] settle_payment_splits_for_debtor failed:', error);
    }
    return {
      success: false,
      settledCount: 0,
      alreadySettledCount: 0,
      error: { code: 'SETTLEMENT_FAILED', message: error.message },
    };
  }

  const payload = (data ?? {}) as SettleSplitsRpcPayload;

  if (!payload.success) {
    const code = payload.error || 'SETTLEMENT_FAILED';
    return {
      success: false,
      settledCount: 0,
      alreadySettledCount: payload.already_settled_count ?? 0,
      error: {
        code,
        message: SETTLEMENT_ERROR_MESSAGES[code] || 'Failed to settle payment. Please try again.',
      },
    };
  }

  return {
    success: true,
    settledCount: payload.settled_count ?? 0,
    alreadySettledCount: payload.already_settled_count ?? 0,
  };
}

/**
 * Debtor-side "I paid this" transition: confirmation_status none -> pending.
 *
 * Deliberately NOT an RPC: this transition never credits money (it never
 * touches `is_settled`), it is value-idempotent (re-marking pending is a
 * no-op), and RLS already restricts the write to the caller's own splits.
 * The crediting confirmation that follows goes through the atomic RPC above.
 */
export async function markSplitsPending(
  paymentMessageIds: string[],
  method: string,
): Promise<{ success: boolean; error?: { code: string; message: string } }> {
  if (paymentMessageIds.length === 0) {
    return { success: true };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) {
    return {
      success: false,
      error: { code: 'NOT_AUTHENTICATED', message: SETTLEMENT_ERROR_MESSAGES.NOT_AUTHENTICATED },
    };
  }

  const { error } = await supabase
    .from('payment_splits')
    .update({
      confirmation_status: 'pending',
      settlement_method: method,
    })
    .in('payment_message_id', paymentMessageIds)
    .eq('debtor_user_id', authData.user.id)
    .eq('is_settled', false);

  if (error) {
    if (import.meta.env.DEV) {
      console.error('[paymentSettlementService] markSplitsPending failed:', error);
    }
    return {
      success: false,
      error: { code: 'MARK_PENDING_FAILED', message: error.message },
    };
  }

  return { success: true };
}
