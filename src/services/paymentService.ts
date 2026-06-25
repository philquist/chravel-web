import { supabase } from '@/integrations/supabase/client';
import { PaymentMethod, PaymentMessage } from '../types/payments';
import { mockPayments } from '@/mockData/payments';
import { recordPaymentSplitPattern } from './chatAnalysisService';
import { isDemoTrip } from '@/utils/demoUtils';
import { toAppPayment } from '@/lib/adapters/paymentAdapter';
import { FEATURE_LIMITS } from '@/billing/entitlements';
import { resolveEffectiveTier } from './entitlementService';
import { distributeEqualSplitCents } from '@/lib/splitAmountUtils';

/** Typed error code returned when the per-trip payment split cap is hit. */
export const SPLIT_LIMIT_ERROR_CODE = 'SPLIT_LIMIT_REACHED';

export interface SplitLimitCheckResult {
  allowed: boolean;
  /** The user's per-trip split limit (only set when blocked). */
  limit?: number;
  /** The resolved tier (only set when blocked). */
  tier?: string;
}

/**
 * Enforce the advertised per-trip payment split cap (Free = 3, Explorer = 10,
 * Frequent Chraveler and Pro = unlimited). Counts split requests authored by
 * THIS user in THIS trip against FEATURE_LIMITS.payment_splitting.
 *
 * - Unlimited tiers (-1) never run the count query — zero behavior change for paid users.
 * - Fails OPEN on tier/count lookup errors: a failed lookup must never block a
 *   (potentially paying) user's payment.
 */
export async function checkPaymentSplitLimit(
  tripId: string,
  userId: string,
): Promise<SplitLimitCheckResult> {
  let limit: number;
  let tier: string;
  try {
    tier = await resolveEffectiveTier(userId);
    limit =
      FEATURE_LIMITS.payment_splitting[tier as keyof typeof FEATURE_LIMITS.payment_splitting] ??
      FEATURE_LIMITS.payment_splitting.free ??
      -1;
  } catch (error) {
    if (import.meta.env.DEV)
      console.error('[paymentService] Tier lookup failed — skipping split cap check:', error);
    return { allowed: true };
  }

  if (limit === -1) {
    return { allowed: true };
  }

  const { count, error } = await supabase
    .from('trip_payment_messages')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', tripId)
    .eq('created_by', userId);

  if (error) {
    // Fail OPEN: do not block payment creation because a count query failed.
    if (import.meta.env.DEV)
      console.error('[paymentService] Split count lookup failed — failing open:', error);
    return { allowed: true };
  }

  if ((count ?? 0) >= limit) {
    return { allowed: false, limit, tier };
  }

  return { allowed: true };
}

interface MockPayment {
  id: string;
  trip_id: string;
  amount: number;
  currency: string;
  description: string;
  split_count: number;
  split_participants: string[];
  payment_methods: string[];
  created_by: string;
  is_settled: boolean;
  created_at: string;
  updated_at: string;
  version: number;
}

export const paymentService = {
  // User Payment Methods
  async getUserPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    try {
      // Per-user payment methods (cards, etc.) — no user has 50+ saved methods
      const { data, error } = await supabase
        .from('user_payment_methods')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return data.map(method => ({
        id: method.id,
        type: method.method_type as PaymentMethod['type'],
        identifier: method.identifier,
        displayName: method.display_name,
        isPreferred: method.is_preferred,
        isVisible: method.is_visible,
      }));
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching payment methods:', error);
      return [];
    }
  },

  async savePaymentMethod(userId: string, method: Omit<PaymentMethod, 'id'>): Promise<boolean> {
    try {
      const { error } = await supabase.from('user_payment_methods').insert({
        user_id: userId,
        method_type: method.type,
        identifier: method.identifier,
        display_name: method.displayName,
        is_preferred: method.isPreferred,
        is_visible: method.isVisible,
      });

      return !error;
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving payment method:', error);
      return false;
    }
  },

  async updatePaymentMethod(methodId: string, updates: Partial<PaymentMethod>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_payment_methods')
        .update({
          method_type: updates.type,
          identifier: updates.identifier,
          display_name: updates.displayName,
          is_preferred: updates.isPreferred,
          is_visible: updates.isVisible,
        })
        .eq('id', methodId);

      return !error;
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error updating payment method:', error);
      return false;
    }
  },

  async deletePaymentMethod(methodId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('user_payment_methods').delete().eq('id', methodId);

      return !error;
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error deleting payment method:', error);
      return false;
    }
  },

  // Trip Payment Messages - Error result type for better error handling
  async createPaymentMessage(
    tripId: string,
    userId: string,
    paymentData: {
      amount: number;
      currency: string;
      description: string;
      splitCount: number;
      splitParticipants: string[];
      paymentMethods: string[];
    },
  ): Promise<{ success: boolean; paymentId?: string; error?: { code: string; message: string } }> {
    try {
      // Validate session before attempting RPC
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.session) {
        return {
          success: false,
          error: {
            code: 'SESSION_EXPIRED',
            message: 'Your session has expired. Please sign in again.',
          },
        };
      }

      // Validate required fields
      if (!paymentData.amount || paymentData.amount <= 0) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Amount must be greater than zero.',
          },
        };
      }

      if (!paymentData.description?.trim()) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Description is required.',
          },
        };
      }

      if (!paymentData.splitParticipants || paymentData.splitParticipants.length === 0) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Please select at least one participant.',
          },
        };
      }

      // Enforce the advertised per-trip split cap (Free = 3 / Explorer = 10).
      // Unlimited tiers skip the check entirely; lookup failures fail open.
      const splitLimit = await checkPaymentSplitLimit(tripId, userId);
      if (!splitLimit.allowed) {
        const limitLabel = splitLimit.limit ?? 3;
        return {
          success: false,
          error: {
            code: SPLIT_LIMIT_ERROR_CODE,
            message:
              splitLimit.tier === 'free'
                ? `Free plan includes ${limitLabel} payment splits per trip — upgrade or get a Trip Pass to add more.`
                : `Your plan includes ${limitLabel} payment splits per trip — upgrade for unlimited splits.`,
          },
        };
      }

      // Use enhanced v2 function with audit trail and transaction safety
      const { data: paymentId, error } = await supabase.rpc('create_payment_with_splits_v2', {
        p_trip_id: tripId,
        p_amount: paymentData.amount,
        p_currency: paymentData.currency,
        p_description: paymentData.description,
        p_split_count: paymentData.splitCount,
        p_split_participants: paymentData.splitParticipants,
        p_payment_methods: paymentData.paymentMethods,
        p_created_by: userId,
      });

      if (error) {
        if (import.meta.env.DEV) console.error('[paymentService] RPC error:', error);

        // Detect RLS violation
        if (error.message?.includes('row-level security') || error.code === '42501') {
          return {
            success: false,
            error: {
              code: 'RLS_VIOLATION',
              message: 'You do not have permission to create payments for this trip.',
            },
          };
        }

        // Detect network/connection issues
        if (error.message?.includes('network') || error.message?.includes('fetch')) {
          return {
            success: false,
            error: {
              code: 'NETWORK_ERROR',
              message: 'Network error. Please check your connection and try again.',
            },
          };
        }

        return {
          success: false,
          error: {
            code: 'UNKNOWN',
            message: error.message || 'Failed to create payment. Please try again.',
          },
        };
      }

      if (!paymentId) {
        return {
          success: false,
          error: {
            code: 'UNKNOWN',
            message: 'Payment creation failed. No payment ID returned.',
          },
        };
      }

      // Record payment split patterns for ML-based suggestions (non-blocking)
      if (paymentData.splitParticipants.length > 0) {
        recordPaymentSplitPattern(tripId, userId, paymentData.splitParticipants).catch(err => {
          console.debug('[paymentService] Failed to record split pattern:', err);
        });
      }

      return { success: true, paymentId };
    } catch (error) {
      if (import.meta.env.DEV)
        console.error('[paymentService] Unexpected error creating payment:', error);
      return {
        success: false,
        error: {
          code: 'UNKNOWN',
          message: error instanceof Error ? error.message : 'An unexpected error occurred.',
        },
      };
    }
  },

  async getTripPaymentMessages(tripId: string): Promise<PaymentMessage[]> {
    try {
      // Quick synchronous demo check — avoids the async secureStorageService round-trip.
      // All callers (usePayments, MobileTripPayments, prefetchTab) already gate on demo mode,
      // so this is a defense-in-depth fallback only.
      let isDemoMode = false;
      try {
        isDemoMode = localStorage.getItem('TRIPS_DEMO_VIEW') === 'app-preview';
      } catch {
        // localStorage unavailable (SSR/test) — fall through to DB path
      }

      if (isDemoMode && isDemoTrip(tripId)) {
        return mockPayments
          .filter(p => p.trip_id === tripId)
          .map((payment: MockPayment) => ({
            id: payment.id,
            tripId: payment.trip_id,
            messageId: null,
            amount: payment.amount,
            currency: payment.currency,
            description: payment.description,
            splitCount: payment.split_count,
            splitParticipants: payment.split_participants,
            paymentMethods: payment.payment_methods,
            createdBy: payment.created_by,
            createdAt: payment.created_at,
            isSettled: payment.is_settled,
          }));
      }

      const { data, error } = await supabase
        .from('trip_payment_messages')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      return data.map(toAppPayment);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching payment messages:', error);
      return [];
    }
  },

  // Payment Settlement — uses pessimistic locking RPC to prevent double-credit race conditions
  async settlePayment(splitId: string, settlementMethod: string): Promise<boolean> {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return false;

      const { data, error } = await (supabase.rpc as any)('settle_payment_split', {
        p_split_id: splitId,
        p_user_id: userId,
        p_method: settlementMethod,
      });

      if (error) {
        if (import.meta.env.DEV)
          console.error('[paymentService] settle_payment_split RPC error:', error);
        return false;
      }

      // RPC returns { success, error?, all_settled? }
      const payload = (data ?? {}) as { success?: boolean; error?: string };
      if (!payload.success) {
        // A concurrent caller already settled it — the desired end state holds,
        // so report idempotent success instead of a user-facing failure.
        return payload.error === 'ALREADY_SETTLED';
      }

      return true;
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error settling payment:', error);
      return false;
    }
  },

  // Unsettle a payment split (toggle back to unpaid).
  // Atomic RPC: row lock + status guard replace the race-prone read-then-write
  // path; already-unsettled is an idempotent success and the parent payment's
  // settled flag is rolled back inside the same transaction.
  async unsettlePayment(splitId: string): Promise<boolean> {
    try {
      const { data, error } = await (supabase.rpc as any)('unsettle_payment_split', {
        p_split_id: splitId,
      });

      if (error) {
        if (import.meta.env.DEV)
          console.error('[paymentService] unsettle_payment_split RPC error:', error);
        return false;
      }

      const payload = (data ?? {}) as { success?: boolean; already_unsettled?: boolean };
      return payload.success === true;
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error unsettling payment:', error);
      return false;
    }
  },

  // Helper: Update parent payment's is_settled based on all splits
  async updateParentPaymentSettledStatus(paymentMessageId: string): Promise<void> {
    try {
      // Get all splits for this payment
      const { data: allSplits, error: splitsError } = await supabase
        .from('payment_splits')
        .select('is_settled')
        .eq('payment_message_id', paymentMessageId)
        .limit(500);

      if (splitsError || !allSplits) return;

      // Check if ALL splits are settled
      const allSettled = allSplits.length > 0 && allSplits.every(s => s.is_settled);

      // Update parent payment's is_settled flag
      await supabase
        .from('trip_payment_messages')
        .update({ is_settled: allSettled })
        .eq('id', paymentMessageId);
    } catch (error) {
      if (import.meta.env.DEV)
        console.error('Error updating parent payment settled status:', error);
    }
  },

  // Update payment message (creator only)
  async updatePaymentMessage(
    paymentId: string,
    updates: { amount?: number; description?: string },
  ): Promise<boolean> {
    try {
      // Read the current row first: its version drives optimistic locking and its
      // split_count drives the proportional split recalculation.
      const { data: current, error: readError } = await supabase
        .from('trip_payment_messages')
        .select('version, split_count')
        .eq('id', paymentId)
        .single();

      if (readError || !current) throw readError ?? new Error('Payment not found');

      const expectedVersion = current.version ?? 1;

      const updateData: Record<string, unknown> = {};
      if (updates.amount !== undefined) updateData.amount = updates.amount;
      if (updates.description !== undefined) updateData.description = updates.description;
      updateData.updated_at = new Date().toISOString();
      updateData.version = expectedVersion + 1;

      // Optimistic lock: the update only matches if no concurrent edit bumped the
      // version since our read. A 0-row result means another writer won the race.
      const { data: updated, error } = await supabase
        .from('trip_payment_messages')
        .update(updateData)
        .eq('id', paymentId)
        .eq('version', expectedVersion)
        .select('id');

      if (error) throw error;
      if (!updated || updated.length === 0) {
        if (import.meta.env.DEV)
          console.warn('updatePaymentMessage: version conflict — edit rejected');
        return false;
      }

      // If the total changed, redistribute across UNSETTLED splits only. Settled
      // participants already paid their agreed share; their amount_owed must not be
      // overwritten (doing so corrupts the settled ledger).
      if (updates.amount !== undefined) {
        const { data: unsettledSplits, error: splitsReadError } = await supabase
          .from('payment_splits')
          .select('id')
          .eq('payment_message_id', paymentId)
          .eq('is_settled', false)
          .order('created_at', { ascending: true });

        if (splitsReadError) throw splitsReadError;

        const splitCount = unsettledSplits?.length ?? 0;
        if (splitCount > 0) {
          const shares = distributeEqualSplitCents(updates.amount, splitCount);
          await Promise.all(
            (unsettledSplits ?? []).map((split, index) =>
              supabase
                .from('payment_splits')
                .update({ amount_owed: shares[index] })
                .eq('id', split.id),
            ),
          );
        }
      }

      return true;
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error updating payment message:', error);
      return false;
    }
  },

  // Delete payment message (creator only)
  async deletePaymentMessage(paymentId: string): Promise<boolean> {
    try {
      // First delete related splits
      await supabase.from('payment_splits').delete().eq('payment_message_id', paymentId);

      // Delete audit log entries
      await supabase.from('payment_audit_log').delete().eq('payment_message_id', paymentId);

      // Delete the payment message
      const { error } = await supabase.from('trip_payment_messages').delete().eq('id', paymentId);

      return !error;
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error deleting payment message:', error);
      return false;
    }
  },

  async getTripPaymentSummary(tripId: string): Promise<{
    totalExpenses: number;
    userBalances: { [userId: string]: number };
    settlementSuggestions: Array<{
      from: string;
      to: string;
      amount: number;
    }>;
  }> {
    try {
      const paymentMessages = await this.getTripPaymentMessages(tripId);

      const { data: splits, error } = await supabase
        .from('payment_splits')
        .select(
          `
          *,
          payment_message:trip_payment_messages!inner(trip_id, created_by, amount)
        `,
        )
        .eq('payment_message.trip_id', tripId)
        .limit(500);

      if (error) throw error;

      const userBalances: { [userId: string]: number } = {};
      let totalExpenses = 0;

      paymentMessages.forEach(payment => {
        totalExpenses += payment.amount;

        if (!userBalances[payment.createdBy]) {
          userBalances[payment.createdBy] = 0;
        }
        userBalances[payment.createdBy] += payment.amount;
      });

      // Type the split rows from the joined query
      interface PaymentSplitRow {
        debtor_user_id: string;
        amount_owed: number | string;
        [key: string]: unknown;
      }

      (splits as PaymentSplitRow[]).forEach(split => {
        if (!userBalances[split.debtor_user_id]) {
          userBalances[split.debtor_user_id] = 0;
        }
        userBalances[split.debtor_user_id] -= parseFloat(split.amount_owed.toString());
      });

      // Greedy min-transaction settlement: pair largest debtor with largest creditor
      // until all balances are zeroed. Mutates local copies only.
      const settlementSuggestions: Array<{ from: string; to: string; amount: number }> = [];
      const debtors = Object.entries(userBalances)
        .filter(([_, balance]) => balance < 0)
        .map(([id, balance]) => ({ id, remaining: Math.abs(balance) }));
      const creditors = Object.entries(userBalances)
        .filter(([_, balance]) => balance > 0)
        .map(([id, balance]) => ({ id, remaining: balance }));

      // Sort descending so we pair the biggest amounts first
      debtors.sort((a, b) => b.remaining - a.remaining);
      creditors.sort((a, b) => b.remaining - a.remaining);

      let di = 0;
      let ci = 0;
      while (di < debtors.length && ci < creditors.length) {
        const amount = Math.min(debtors[di].remaining, creditors[ci].remaining);
        if (amount > 0.01) {
          settlementSuggestions.push({
            from: debtors[di].id,
            to: creditors[ci].id,
            amount: Math.round(amount * 100) / 100,
          });
        }
        debtors[di].remaining -= amount;
        creditors[ci].remaining -= amount;
        if (debtors[di].remaining < 0.01) di++;
        if (creditors[ci].remaining < 0.01) ci++;
      }

      return {
        totalExpenses,
        userBalances,
        settlementSuggestions,
      };
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error getting payment summary:', error);
      return {
        totalExpenses: 0,
        userBalances: {},
        settlementSuggestions: [],
      };
    }
  },
};
