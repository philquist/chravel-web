import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { tripKeys } from '@/lib/queryKeys';
import {
  assertValidMembershipTransition,
  type TripMembershipAuditEvent,
  type TripMembershipState,
} from '@/types/tripMembership';

export async function recordTripMembershipAuditEvent(
  event: TripMembershipAuditEvent,
): Promise<void> {
  await supabase.from('trip_membership_audit_events').insert({
    trip_id: event.tripId,
    user_id: event.userId,
    actor_user_id: event.actorUserId,
    action: event.action,
    from_state: event.fromState,
    to_state: event.toState,
    metadata: event.metadata ?? {},
  });
}

export async function applyMembershipTransition(params: {
  tripId: string;
  userId: string;
  actorUserId: string;
  fromState: TripMembershipState | null;
  toState: TripMembershipState;
  rpcName: 'approve_join_request' | 'reject_join_request' | 'remove_trip_member_safe';
  rpcParams: Record<string, unknown>;
  queryClient: QueryClient;
}): Promise<void> {
  const { tripId, fromState, toState, rpcName, rpcParams, queryClient } = params;
  assertValidMembershipTransition(fromState, toState);

  const { error } = await (supabase.rpc as any)(rpcName, rpcParams);
  if (error) throw error;

  queryClient.invalidateQueries({ queryKey: tripKeys.members(tripId) });
  queryClient.invalidateQueries({ queryKey: tripKeys.all });
}
