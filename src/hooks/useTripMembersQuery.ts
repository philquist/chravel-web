/**
 * Optimized TripMembers hook with TanStack Query
 *
 * Uses parallel data fetching and proper caching for instant UI rendering.
 * Falls back to demo mode data when appropriate.
 * Rosters above 50 members load via paginated list_trip_members RPC.
 */

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { tripService } from '@/services/tripService';
import { supabase } from '@/integrations/supabase/client';
import { getTripById } from '@/data/tripsData';
import { useDemoMode } from './useDemoMode';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { useDemoTripMembersStore } from '@/store/demoTripMembersStore';
import { tripKeys, QUERY_CACHE_CONFIG } from '@/lib/queryKeys';
import { isDemoTrip } from '@/utils/demoUtils';
import {
  reportStreamMembershipSyncFailure,
  syncRemoveMemberFromTripChannels,
} from '@/services/stream/streamMembershipCoordinator';
import { PAGINATED_ROSTER_THRESHOLD, ROSTER_PAGE_SIZE } from '@/lib/tripMemberLimits';

export interface TripMember {
  id: string;
  name: string;
  avatar?: string;
  isCreator?: boolean;
  role?: string;
}

interface TripMembersData {
  members: TripMember[];
  creatorId: string | null;
  hadError?: boolean;
}

const getMockFallbackMembers = (tripId: string): TripMember[] => {
  if (!isDemoTrip(tripId)) return [];

  const numericTripId = parseInt(tripId, 10);
  const trip = getTripById(numericTripId);

  const baseMembers: TripMember[] = trip?.participants
    ? trip.participants.map((participant, index) => ({
        id: participant.id.toString(),
        name: participant.name,
        avatar: participant.avatar,
        isCreator: index === 0,
      }))
    : [
        { id: 'user1', name: 'You', isCreator: true },
        { id: 'user2', name: 'Trip Organizer' },
      ];

  const addedMembers = useDemoTripMembersStore.getState().getAddedMembers(tripId);
  const addedAsTripMembers: TripMember[] = addedMembers.map(m => ({
    id: m.id.toString(),
    name: m.name,
    avatar: m.avatar,
    isCreator: false,
  }));

  const allMembers = [...baseMembers];
  for (const added of addedAsTripMembers) {
    if (!allMembers.some(m => m.id === added.id)) {
      allMembers.push(added);
    }
  }

  return allMembers;
};

/**
 * Fetch trip data and members in PARALLEL for faster loading
 */
async function fetchTripMembersData(tripId: string, isDemoMode: boolean): Promise<TripMembersData> {
  if (isDemoMode && isDemoTrip(tripId)) {
    const mockMembers = getMockFallbackMembers(tripId);
    return {
      members: mockMembers,
      creatorId: mockMembers[0]?.id || null,
      hadError: false,
    };
  }

  try {
    const { members, creatorId } = await tripService.getTripMembersWithCreator(tripId);

    const formattedMembers: TripMember[] = members.map(m => ({
      id: m.id,
      name: m.name,
      avatar: m.avatar,
      isCreator: m.isCreator,
      role: m.role,
    }));

    return {
      members: formattedMembers,
      creatorId,
      hadError: false,
    };
  } catch (error) {
    console.error('[useTripMembersQuery] Failed to fetch members:', error);
    return { members: [], creatorId: null, hadError: true };
  }
}

export interface UseTripMembersQueryOptions {
  /** When roster is paginated, filters via list_trip_members RPC (server-side). */
  rosterSearch?: string;
}

export const useTripMembersQuery = (tripId?: string, options?: UseTripMembersQueryOptions) => {
  const queryClient = useQueryClient();
  const { isDemoMode } = useDemoMode();
  const { user } = useAuth();

  const demoAddedMembersCount = useDemoTripMembersStore(state =>
    tripId ? state.addedMembers[tripId]?.length || 0 : 0,
  );
  const membersQueryKey = tripKeys.membersWithRevision(tripId || '', demoAddedMembersCount);
  const rosterSearch = options?.rosterSearch?.trim() ?? '';

  const { data: tripMeta, isLoading: metaLoading } = useQuery({
    queryKey: tripKeys.memberMeta(tripId || ''),
    queryFn: () => tripService.getTripMemberMeta(tripId!),
    enabled: !!tripId && !isDemoMode,
    staleTime: QUERY_CACHE_CONFIG.members.staleTime,
    gcTime: QUERY_CACHE_CONFIG.members.gcTime,
  });

  const usePaginatedRoster = (tripMeta?.memberCount ?? 0) > PAGINATED_ROSTER_THRESHOLD;
  const useServerSearch = usePaginatedRoster && rosterSearch.length > 0;
  const metaReady = tripMeta !== undefined || !tripId || isDemoMode;

  const serverSearchQuery = useQuery({
    queryKey: tripKeys.membersSearch(tripId || '', rosterSearch),
    queryFn: () =>
      tripService.listTripMembersPage(tripId!, {
        search: rosterSearch,
        offset: 0,
        limit: 100,
      }),
    enabled: !!tripId && metaReady && useServerSearch && !isDemoMode,
    staleTime: QUERY_CACHE_CONFIG.members.staleTime,
    gcTime: QUERY_CACHE_CONFIG.members.gcTime,
  });

  const standardQuery = useQuery({
    queryKey: membersQueryKey,
    queryFn: () => fetchTripMembersData(tripId!, isDemoMode),
    enabled: !!tripId && metaReady && (!usePaginatedRoster || isDemoMode),
    staleTime: QUERY_CACHE_CONFIG.members.staleTime,
    gcTime: QUERY_CACHE_CONFIG.members.gcTime,
    refetchOnWindowFocus: QUERY_CACHE_CONFIG.members.refetchOnWindowFocus,
  });

  const paginatedQuery = useInfiniteQuery({
    queryKey: tripKeys.membersPaginated(tripId || ''),
    queryFn: ({ pageParam = 0 }) =>
      tripService.listTripMembersPage(tripId!, {
        offset: pageParam,
        limit: ROSTER_PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: lastPage => {
      const nextOffset = lastPage.offset + lastPage.members.length;
      return nextOffset < lastPage.total_count ? nextOffset : undefined;
    },
    enabled: !!tripId && metaReady && usePaginatedRoster && !isDemoMode && !useServerSearch,
    staleTime: QUERY_CACHE_CONFIG.members.staleTime,
    gcTime: QUERY_CACHE_CONFIG.members.gcTime,
    refetchOnWindowFocus: QUERY_CACHE_CONFIG.members.refetchOnWindowFocus,
  });

  useEffect(() => {
    if (!usePaginatedRoster || isDemoMode || useServerSearch) return;
    if (paginatedQuery.hasNextPage && !paginatedQuery.isFetchingNextPage) {
      void paginatedQuery.fetchNextPage();
    }
  }, [
    usePaginatedRoster,
    isDemoMode,
    useServerSearch,
    paginatedQuery.hasNextPage,
    paginatedQuery.isFetchingNextPage,
    paginatedQuery.fetchNextPage,
    paginatedQuery.dataUpdatedAt,
  ]);

  const paginatedMembers = paginatedQuery.data?.pages.flatMap(page => page.members) ?? [];
  const serverSearchMembers = serverSearchQuery.data?.members ?? [];
  const tripCreatorId = useServerSearch
    ? (serverSearchQuery.data?.creatorId ?? tripMeta?.creatorId ?? null)
    : usePaginatedRoster
      ? (paginatedQuery.data?.pages[0]?.creatorId ?? tripMeta?.creatorId ?? null)
      : (standardQuery.data?.creatorId ?? null);
  const tripMembers = useServerSearch
    ? serverSearchMembers
    : usePaginatedRoster
      ? paginatedMembers
      : (standardQuery.data?.members ?? []);
  const memberTotalCount = useServerSearch
    ? (serverSearchQuery.data?.total_count ?? 0)
    : (tripMeta?.memberCount ?? tripMembers.length);
  const hadMembersError = useServerSearch
    ? serverSearchQuery.isError
    : usePaginatedRoster
      ? paginatedQuery.isError
      : (standardQuery.data?.hadError ?? false);
  const isLoading = useServerSearch
    ? metaLoading || serverSearchQuery.isLoading
    : usePaginatedRoster
      ? metaLoading || paginatedQuery.isLoading
      : standardQuery.isLoading;
  const isSearchingMembers = useServerSearch && serverSearchQuery.isFetching;

  const refetch = useCallback(async () => {
    if (useServerSearch) {
      await serverSearchQuery.refetch();
      return;
    }
    if (usePaginatedRoster) {
      await paginatedQuery.refetch();
      return;
    }
    await standardQuery.refetch();
  }, [usePaginatedRoster, useServerSearch, serverSearchQuery, paginatedQuery, standardQuery]);

  useEffect(() => {
    if (!tripId || isDemoMode) return;

    const channel = supabase
      .channel(`trip-members:${tripId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_members', filter: `trip_id=eq.${tripId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: tripKeys.members(tripId) });
          queryClient.invalidateQueries({ queryKey: tripKeys.memberMeta(tripId) });
          queryClient.invalidateQueries({ queryKey: tripKeys.membersPaginated(tripId) });
          queryClient.invalidateQueries({ queryKey: tripKeys.membersSearchAll(tripId) });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [tripId, isDemoMode, queryClient]);

  const canRemoveMembers = useCallback(async (): Promise<boolean> => {
    if (!tripId || !user?.id) return false;
    if (tripCreatorId === user.id) return true;

    const { data: adminData } = await supabase
      .from('trip_admins')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', user.id)
      .maybeSingle();

    return !!adminData;
  }, [tripId, user?.id, tripCreatorId]);

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!tripId) throw new Error('No trip selected');
      if (userId === tripCreatorId) throw new Error('Cannot remove trip creator');

      const { data, error } = await (supabase.rpc as any)('remove_trip_member_safe', {
        p_trip_id: tripId,
        p_user_id_to_remove: userId,
      });

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;
      if (result && !result.success) {
        throw new Error(result.message || 'Failed to remove member');
      }

      return userId;
    },
    onMutate: async userId => {
      await queryClient.cancelQueries({ queryKey: tripKeys.members(tripId!) });
      const previous = queryClient.getQueryData<TripMembersData>(membersQueryKey);

      queryClient.setQueryData<TripMembersData>(membersQueryKey, old => ({
        ...old!,
        members: old?.members.filter(m => m.id !== userId) || [],
      }));

      return { previous };
    },
    onSuccess: (_, userId) => {
      toast.success('Member removed from trip');
      if (tripId) {
        syncRemoveMemberFromTripChannels(tripId, userId).catch(error => {
          reportStreamMembershipSyncFailure('remove-trip-member', { tripId, userId }, error);
        });
      }
    },
    onError: (error, _, context) => {
      if (context?.previous) {
        queryClient.setQueryData(membersQueryKey, context.previous);
      }
      toast.error(error instanceof Error ? error.message : 'Failed to remove member');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.members(tripId!) });
      queryClient.invalidateQueries({ queryKey: tripKeys.memberMeta(tripId!) });
      queryClient.invalidateQueries({ queryKey: tripKeys.membersPaginated(tripId!) });
      queryClient.invalidateQueries({ queryKey: tripKeys.membersSearchAll(tripId!) });
    },
  });

  const leaveTripMutation = useMutation({
    mutationFn: async (_tripName: string) => {
      if (!tripId || !user?.id) throw new Error('Must be logged in');
      if (isDemoMode) return true;

      const { data, error } = await (supabase.rpc as any)('leave_trip', {
        _trip_id: tripId,
      });
      if (error) throw error;

      const result = data as {
        success?: boolean;
        message?: string;
        notify_user_id?: string;
      } | null;
      if (!result?.success) throw new Error(result?.message || 'Failed to leave trip');

      const notifyUserId = result.notify_user_id ?? tripCreatorId;
      if (notifyUserId && notifyUserId !== user.id) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('display_name, first_name, last_name')
          .eq('user_id', user.id)
          .single();
        const userName =
          profileData?.display_name ||
          `${profileData?.first_name || ''} ${profileData?.last_name || ''}`.trim() ||
          'A member';
        await supabase.from('notifications').insert({
          user_id: notifyUserId,
          title: `${userName} left ${_tripName}`,
          message: `${userName} has left the trip "${_tripName}"`,
          type: 'member_left',
          metadata: {
            trip_id: tripId,
            trip_name: _tripName,
            left_user_id: user.id,
            left_user_name: userName,
          },
        });
      }
      return true;
    },
    onSuccess: () => {
      if (tripId && user?.id && !isDemoMode) {
        syncRemoveMemberFromTripChannels(tripId, user.id).catch(error => {
          reportStreamMembershipSyncFailure(
            'remove-trip-member',
            { tripId, userId: user.id },
            error,
          );
        });
      }
      queryClient.invalidateQueries({ queryKey: tripKeys.members(tripId!) });
      queryClient.invalidateQueries({ queryKey: tripKeys.memberMeta(tripId!) });
      queryClient.invalidateQueries({ queryKey: tripKeys.membersPaginated(tripId!) });
      queryClient.invalidateQueries({ queryKey: tripKeys.membersSearchAll(tripId!) });
    },
    onError: () => {
      toast.error('Failed to leave trip');
    },
  });

  return {
    tripMembers,
    loading: isLoading,
    tripCreatorId,
    hadMembersError,
    canRemoveMembers,
    removeMember: (userId: string) => removeMemberMutation.mutateAsync(userId),
    leaveTrip: (tripName: string) => leaveTripMutation.mutateAsync(tripName),
    refreshMembers: refetch,
    isPaginatedRoster: usePaginatedRoster,
    memberTotalCount,
    isSearchingMembers,
    hasMoreMembers: paginatedQuery.hasNextPage ?? false,
    isFetchingMoreMembers: paginatedQuery.isFetchingNextPage,
    fetchMoreMembers: paginatedQuery.fetchNextPage,
  };
};
