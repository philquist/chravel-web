/**
 * usePaymentAttachments
 *
 * Batched fetch of attachments for the payments currently visible on a trip's Payments tab.
 * Returns a Map<paymentMessageId, PaymentAttachment[]> plus a count lookup so payment cards can
 * render a compact "{n} attachments" affordance without each card issuing its own query.
 *
 * Realtime: a trip_id-filtered subscription on `payment_attachments` invalidates the query so
 * counts stay live (mirrors the media/payments realtime pattern). Demo trips skip the DB.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { tripKeys } from '@/lib/queryKeys';
import { useDemoMode } from './useDemoMode';
import { isDemoTrip as checkDemoTrip } from '@/utils/demoUtils';
import {
  fetchPaymentAttachments,
  type PaymentAttachment,
} from '@/services/paymentAttachmentService';

export const usePaymentAttachments = (tripId?: string, paymentIds: string[] = []) => {
  const queryClient = useQueryClient();
  const { isDemoMode } = useDemoMode();
  const demoActive = isDemoMode && checkDemoTrip(tripId);

  // Stable, sorted id list so the query key only changes when the set of payments changes.
  const sortedIds = useMemo(() => [...new Set(paymentIds.filter(Boolean))].sort(), [paymentIds]);

  const { data, isLoading } = useQuery({
    queryKey: [...tripKeys.paymentAttachments(tripId || ''), sortedIds],
    queryFn: async (): Promise<Map<string, PaymentAttachment[]>> => {
      if (!tripId || demoActive || sortedIds.length === 0) {
        return new Map<string, PaymentAttachment[]>();
      }
      return fetchPaymentAttachments(sortedIds);
    },
    enabled: !!tripId && !demoActive && sortedIds.length > 0,
    staleTime: 30 * 1000,
  });

  const byPayment = data ?? new Map<string, PaymentAttachment[]>();

  // Unique per hook instance: the same tripId can mount this hook from multiple surfaces
  // (e.g. OutstandingPayments + PaymentHistory on the same tab); a shared channel topic would
  // collide and one unmount would tear down the other's subscription.
  const channelIdRef = useRef<string>();
  if (!channelIdRef.current) {
    try {
      channelIdRef.current = crypto.randomUUID();
    } catch {
      channelIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  // Live counts via trip-scoped realtime (filtered by trip_id per realtime rules).
  useEffect(() => {
    if (!tripId || demoActive) return;
    const channel = supabase
      .channel(`payment_attachments:${tripId}:${channelIdRef.current}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_attachments',
          filter: `trip_id=eq.${tripId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: tripKeys.paymentAttachments(tripId) }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, demoActive, queryClient]);

  return {
    attachmentsByPayment: byPayment,
    getAttachments: (paymentId: string): PaymentAttachment[] => byPayment.get(paymentId) ?? [],
    getCount: (paymentId: string): number => byPayment.get(paymentId)?.length ?? 0,
    loading: isLoading,
  };
};
