import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTripMembersQuery, type TripMember } from './useTripMembersQuery';

export type { TripMember };

export const useTripMembers = (tripId?: string) => {
  const { tripCreatorId, tripMembers, loading, removeMember, leaveTrip, refreshMembers } =
    useTripMembersQuery(tripId);

  // Check if current user can remove members (creator or admin)
  const canRemoveMembers = useCallback(async (): Promise<boolean> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!tripId || !user?.id) return false;

    // Check if user is creator
    if (tripCreatorId === user.id) return true;

    // Check if user is admin
    const { data: adminData } = await supabase
      .from('trip_admins')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', user.id)
      .maybeSingle();

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
  };
};
