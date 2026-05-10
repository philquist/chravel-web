import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { tripKeys } from '@/lib/queryKeys';

type RpcResult = { success: boolean; message: string; cleaned_up?: boolean } | null;

function invalidateTripJoinCaches(
  queryClient: QueryClient,
  tripId: string | undefined,
  mode: 'approve' | 'reject',
): void {
  queryClient.invalidateQueries({ queryKey: tripKeys.all });
  queryClient.invalidateQueries({ queryKey: ['proTrips'] });
  queryClient.invalidateQueries({ queryKey: ['events'] });
  // Match useJoinRequests: members list only refreshes on approve
  if (mode === 'approve' && tripId) {
    queryClient.invalidateQueries({ queryKey: tripKeys.members(tripId) });
  }
}

/**
 * Approve a pending trip join request (shared by trip UI and notification shortcuts).
 */
export async function approveJoinRequestById(
  queryClient: QueryClient,
  params: { requestId: string; tripId?: string },
): Promise<void> {
  const { requestId, tripId } = params;

  const { data, error } = await supabase.rpc('approve_join_request', {
    _request_id: requestId,
  });

  if (error) throw error;

  const result = data as RpcResult;

  if (result && !result.success) {
    if (result.cleaned_up) {
      toast.info(result.message || 'This request is no longer valid');
      invalidateTripJoinCaches(queryClient, tripId, 'approve');
      return;
    }
    throw new Error(result.message || 'Failed to approve request');
  }

  toast.success('✅ Request approved');
  invalidateTripJoinCaches(queryClient, tripId, 'approve');
}

/**
 * Reject a pending trip join request (shared by trip UI and notification shortcuts).
 */
export async function rejectJoinRequestById(
  queryClient: QueryClient,
  params: { requestId: string; tripId?: string },
): Promise<void> {
  const { requestId, tripId } = params;

  const { data, error } = await supabase.rpc('reject_join_request', {
    _request_id: requestId,
  });

  if (error) throw error;

  const result = data as RpcResult;

  if (result && !result.success) {
    throw new Error(result.message || 'Failed to reject request');
  }

  if (result?.cleaned_up) {
    toast.info(result.message || 'Invalid request removed');
  } else {
    toast.success('Request rejected');
  }

  invalidateTripJoinCaches(queryClient, tripId, 'reject');
}
