import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  useTripMembersQuery,
  type TripMember,
  type UseTripMembersQueryOptions,
} from './useTripMembersQuery';

export type { TripMember };

export const useTripMembers = (tripId?: string, options?: UseTripMembersQueryOptions) => {
  const {
    tripCreatorId,
    tripMembers,
    loading,
    removeMember,
    leaveTrip,
    refreshMembers,
    isPaginatedRoster,
    memberTotalCount,
    isSearchingMembers,
  } = useTripMembersQuery(tripId, options);

  // Check if current user can remove members (creator or admin)
  const canRemoveMembers = useCallback(async (): Promise<boolean> => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) {
      console.error('[useTripMembers] Failed to resolve auth user:', authError);
      return false;
    }
    if (!tripId || !user?.id) return false;

    // Check if user is creator
    if (tripCreatorId === user.id) return true;

    // Check if user is admin
    const { data: adminData, error: adminError } = await supabase
      .from('trip_admins')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (adminError) {
      console.error('[useTripMembers] Failed to check trip admin permission:', adminError);
      return false;
    }

    return !!adminData;
  }, [tripId, tripCreatorId]);

  const removeMemberAsBoolean = useCallback(
    async (userId: string): Promise<boolean> => {
      try {
        await removeMember(userId);
        return true;
      } catch {
        return false;
      }
    },
    [removeMember],
  );

  const leaveTripAsBoolean = useCallback(
    async (tripName: string): Promise<boolean> => {
      try {
        await leaveTrip(tripName);
        return true;
      } catch {
        return false;
      }
    },
    [leaveTrip],
  );

  return {
    tripMembers,
    loading,
    tripCreatorId,
    canRemoveMembers,
    removeMember: removeMemberAsBoolean,
    leaveTrip: leaveTripAsBoolean,
    refreshMembers,
    isPaginatedRoster,
    memberTotalCount,
    isSearchingMembers,
  };
};
