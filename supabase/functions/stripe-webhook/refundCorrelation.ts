/**
 * Pure helpers for charge.refunded → Trip Pass revocation correlation.
 * Trip Pass metadata lives on Checkout Session, not the Charge object.
 */

export function extractRefundedPurchaseType(
  session: { metadata?: Record<string, string> | null } | undefined,
): string | null {
  return session?.metadata?.purchase_type ?? null;
}

/** Only revoke a Trip Pass when the refunded charge was the pass purchase itself. */
export function shouldRevokeTripPassOnRefund(
  refundedPurchaseType: string | null | undefined,
): boolean {
  return refundedPurchaseType === 'pass';
}

export function resolvePaymentIntentId(
  paymentIntent: string | { id: string } | null | undefined,
): string | null {
  if (typeof paymentIntent === 'string') return paymentIntent;
  return paymentIntent?.id ?? null;
}
