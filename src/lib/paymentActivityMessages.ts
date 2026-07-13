/**
 * Shared helpers for firing inline chat activity when payments are created
 * or fully settled. Keeps desktop (usePayments) and mobile (CreatePaymentModal)
 * on the same path so members always see expense activity in chat.
 */

import { systemMessageService } from '@/services/systemMessageService';

export const resolvePaymentActorName = (
  user: { displayName?: string | null; email?: string | null } | null | undefined,
): string => {
  if (!user) return 'Someone';
  return user.displayName || user.email?.split('@')[0] || 'Someone';
};

/** Fire-and-forget chat system message for a newly created expense. */
export const notifyPaymentRecordedInChat = (
  tripId: string,
  actorName: string,
  paymentId: string,
  amount: number,
  currency: string,
  description: string,
): void => {
  void systemMessageService.paymentRecorded(
    tripId,
    actorName,
    paymentId,
    amount,
    currency,
    description,
  );
};

/** Fire-and-forget chat system message when every split on a payment is settled. */
export const notifyPaymentSettledInChat = (
  tripId: string,
  actorName: string,
  paymentId: string,
  description: string,
): void => {
  void systemMessageService.paymentSettled(tripId, actorName, paymentId, description);
};
