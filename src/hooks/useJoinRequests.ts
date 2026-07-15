import { useState, useEffect, useCallback } from 'react';
import type { TripMembershipState } from '@/types/tripMembership';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getMockPendingRequests } from '@/mockData/joinRequests';
import { useDemoTripMembersStore } from '@/store/demoTripMembersStore';
import { tripKeys } from '@/lib/queryKeys';
import { approveJoinRequestById, rejectJoinRequestById } from '@/lib/joinRequestMutations';

export interface JoinRequest {
  id: string;
  trip_id: string;
  user_id: string;
  invite_code: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  resolved_by?: string;
  resolved_at?: string;
  // Name captured at request creation time (fail-safe, stored in DB)
  requester_name?: string | null;
  requester_email?: string | null;
  requester_avatar_url?: string | null;
  profile?: {
    display_name: string;
    avatar_url?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };
}

interface UseJoinRequestsProps {
  tripId: string;
  enabled?: boolean;
  isDemoMode?: boolean;
}

/** Cap join-request list fetches so Requests never spins forever. */
export const FETCH_JOIN_REQUESTS_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    Promise.resolve(promise).then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

type ProfilePublicRow = {
  user_id: string | null;
  display_name: string | null;
  resolved_display_name: string | null;
  avatar_url: string | null;
  first_name: string | null;
  last_name: string | null;
};

function resolveDisplayName(
  profile: ProfilePublicRow | undefined,
  request: Pick<JoinRequest, 'requester_name' | 'requester_email'>,
): string {
  if (profile) {
    const fromProfile =
      profile.resolved_display_name ||
      profile.display_name ||
      (profile.first_name && profile.last_name
        ? `${profile.first_name} ${profile.last_name}`
        : profile.first_name || profile.last_name);
    if (fromProfile) return fromProfile;
  }
  return request.requester_name || request.requester_email?.split('@')[0] || 'New member';
}

export const useJoinRequests = ({
  tripId,
  enabled = true,
  isDemoMode = false,
}: UseJoinRequestsProps) => {
  const queryClient = useQueryClient();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchRequests = useCallback(async () => {
    if (!enabled || !tripId) {
      setIsLoading(false);
      setIsError(false);
      return;
    }

    // Demo mode - return mock data
    if (isDemoMode) {
      setRequests(getMockPendingRequests(tripId));
      setIsLoading(false);
      setIsError(false);
      return;
    }

    try {
      setIsLoading(true);
      setIsError(false);

      // Primary list only — never N+1 profiles in the critical path (that hung
      // Requests on "Loading requests..." forever when a profile read stalled).
      const { data, error } = await withTimeout(
        (async () =>
          supabase
            .from('trip_join_requests')
            .select(
              'id, trip_id, user_id, invite_code, status, requested_at, resolved_at, resolved_by, requester_name, requester_email, requester_avatar_url',
            )
            .eq('trip_id', tripId)
            .eq('status', 'pending')
            .order('requested_at', { ascending: false }))(),
        FETCH_JOIN_REQUESTS_TIMEOUT_MS,
        'fetchJoinRequests',
      );

      if (error) throw error;

      const rows = data || [];
      const userIds = [
        ...new Set(rows.map(r => r.user_id).filter((id): id is string => Boolean(id))),
      ];

      // Soft-fail single batched profile lookup — stored requester_* fields are enough to render.
      const profilesByUserId = new Map<string, ProfilePublicRow>();
      if (userIds.length > 0) {
        try {
          const { data: profiles, error: profileError } = await withTimeout(
            (async () =>
              supabase
                .from('profiles_public')
                .select(
                  'user_id, display_name, resolved_display_name, avatar_url, first_name, last_name',
                )
                .in('user_id', userIds))(),
            5_000,
            'fetchJoinRequestProfiles',
          );
          if (profileError) {
            if (import.meta.env.DEV) {
              console.warn('[useJoinRequests] Failed to batch-load profiles:', profileError);
            }
          } else {
            for (const profile of (profiles || []) as ProfilePublicRow[]) {
              if (profile.user_id) {
                profilesByUserId.set(profile.user_id, profile);
              }
            }
          }
        } catch (profileErr) {
          if (import.meta.env.DEV) {
            console.warn('[useJoinRequests] Profile enrichment skipped:', profileErr);
          }
        }
      }

      const requestsWithProfiles = rows.map(request => {
        const profile = profilesByUserId.get(request.user_id);
        return {
          ...request,
          profile: {
            display_name: resolveDisplayName(profile, request),
            avatar_url: profile?.avatar_url || request.requester_avatar_url || null,
            first_name: profile?.first_name || null,
            last_name: profile?.last_name || null,
          },
        };
      });

      setRequests(requestsWithProfiles as JoinRequest[]);
      setIsError(false);
    } catch (error) {
      console.error('Error fetching join requests:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load join requests');
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [tripId, enabled, isDemoMode]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Subscribe to realtime updates (only in authenticated mode)
  useEffect(() => {
    if (!enabled || !tripId || isDemoMode) return;

    const channel = supabase
      .channel(`trip_join_requests:${tripId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trip_join_requests',
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          fetchRequests();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, enabled, isDemoMode, fetchRequests]);

  const runOptimisticTransition = (requestId: string, toState: TripMembershipState) => {
    const snapshot = requests;
    if (toState !== 'invited') {
      setRequests(prev => prev.filter(r => r.id !== requestId));
    }
    return snapshot;
  };

  const rollbackOptimisticTransition = (snapshot: JoinRequest[]) => {
    setRequests(snapshot);
  };

  const approveRequest = useCallback(
    async (requestId: string) => {
      setIsProcessing(true);

      // Demo mode - add member to store and update local state
      if (isDemoMode) {
        const request = requests.find(r => r.id === requestId);

        if (request) {
          // Add the approved user to the demo trip members store
          const { addMember } = useDemoTripMembersStore.getState();
          addMember(tripId, {
            id: request.user_id,
            name: request.profile?.display_name || 'New Member',
            avatar: request.profile?.avatar_url,
          });
        }

        setRequests(prev => prev.filter(r => r.id !== requestId));
        toast.success('✅ Request approved - member added to trip!');
        setIsProcessing(false);
        return;
      }

      const snapshot = runOptimisticTransition(requestId, 'accepted');
      try {
        await approveJoinRequestById(queryClient, { requestId, tripId });
        await fetchRequests();
      } catch (error) {
        rollbackOptimisticTransition(snapshot);
        console.error('Error approving request:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to approve request');
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [fetchRequests, isDemoMode, requests, tripId],
  );

  const rejectRequest = useCallback(
    async (requestId: string) => {
      setIsProcessing(true);

      // Demo mode - just update local state
      if (isDemoMode) {
        setRequests(prev => prev.filter(r => r.id !== requestId));
        toast.success('Request rejected');
        setIsProcessing(false);
        return;
      }

      const snapshot = runOptimisticTransition(requestId, 'declined');
      try {
        await rejectJoinRequestById(queryClient, { requestId, tripId });
        await fetchRequests();
      } catch (error) {
        rollbackOptimisticTransition(snapshot);
        console.error('Error rejecting request:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to reject request');
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [fetchRequests, isDemoMode],
  );

  /**
   * Dismiss a join request - permanently removes it without approval/rejection.
   * Used for swipe-to-delete functionality.
   * Useful for:
   * - Orphaned requests from deleted users
   * - Spam or unwanted requests
   * - "Request purgatory" - neither approving nor denying
   */
  const dismissRequest = useCallback(
    async (requestId: string) => {
      setIsProcessing(true);

      // Demo mode - just update local state
      if (isDemoMode) {
        setRequests(prev => prev.filter(r => r.id !== requestId));
        toast.success('Request dismissed');
        setIsProcessing(false);
        return;
      }

      try {
        // Typed RPC shim until types.ts is regenerated
        const rpc = supabase.rpc.bind(supabase) as unknown as <T>(
          fn: string,
          params?: Record<string, string>,
        ) => Promise<{ data: T | null; error: { message?: string } | null }>;

        const { data, error } = await rpc<{
          success: boolean;
          message: string;
          cleaned_up?: boolean;
        }>('dismiss_join_request', { _request_id: requestId });

        if (error) throw error;

        // Check the response for success/failure
        if (data && !data.success) {
          throw new Error(data.message || 'Failed to dismiss request');
        }

        // Show appropriate message
        if (data?.cleaned_up) {
          toast.info(data.message || 'Orphaned request removed');
        } else {
          toast.success('Request dismissed');
        }

        queryClient.invalidateQueries({ queryKey: tripKeys.all });
        await fetchRequests();
      } catch (error) {
        console.error('Error dismissing request:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to dismiss request');
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [fetchRequests, isDemoMode],
  );

  return {
    requests,
    // Errored fetches are not-loading so Requests can show retry UI.
    isLoading: isLoading && !isError,
    isError,
    isProcessing,
    approveRequest,
    rejectRequest,
    dismissRequest,
    refetch: fetchRequests,
  };
};
