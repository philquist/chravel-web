import { useState, useEffect, useCallback } from 'react';
import {
  shouldBackfillOnSubscribe,
  shouldRefreshOnForeground,
} from './utils/realtimeBackfillPolicy';

export const shouldRefreshJoinRequestsOnForeground = shouldRefreshOnForeground;
export const shouldBackfillJoinRequestsOnSubscribe = shouldBackfillOnSubscribe;
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getDemoDashboardJoinRequests } from '@/mockData/dashboardJoinRequestsMock';

/** Trip summary embedded on a pending join request row */
export interface DashboardJoinRequestTrip {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date?: string | null;
  member_count?: number | null;
  cover_image_url?: string;
  trip_type?: string | null;
}

/**
 * Pending join request visible on the home dashboard (RLS: own requests + inbound for trips you admin/member on).
 */
export interface DashboardJoinRequest {
  id: string;
  trip_id: string;
  user_id: string;
  requested_at?: string;
  created_at?: string;
  direction: 'outbound' | 'inbound';
  /** For inbound rows: best-effort display name for the requester */
  requesterLabel?: string;
  trip?: DashboardJoinRequestTrip;
}

type TripJoinRow = {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date?: string | null;
  member_count?: number | null;
  cover_image_url?: string | null;
  trip_type?: string | null;
};

type JoinRequestRow = {
  id: string;
  trip_id: string;
  user_id: string;
  requested_at?: string | null;
  created_at?: string | null;
  requester_name?: string | null;
  requester_email?: string | null;
  trips?: TripJoinRow | TripJoinRow[] | null;
};

type CancelOwnJoinRequestResult = {
  success?: boolean;
  message?: string;
};

export function mapCancelOwnJoinRequestResult(data: CancelOwnJoinRequestResult | null): {
  success: boolean;
  message?: string;
} {
  if (!data) return { success: false, message: 'Unable to cancel request.' };
  if (data.success) return { success: true };
  return { success: false, message: data.message || 'Unable to cancel request.' };
}

export function splitJoinRequestsByDirection(rows: DashboardJoinRequest[]): {
  outbound: DashboardJoinRequest[];
  inbound: DashboardJoinRequest[];
} {
  const outbound: DashboardJoinRequest[] = [];
  const inbound: DashboardJoinRequest[] = [];
  for (const row of rows) {
    if (row.direction === 'inbound') inbound.push(row);
    else outbound.push(row);
  }
  return { outbound, inbound };
}

/**
 * Contract helper for admin/reviewer surfaces.
 *
 * Only inbound rows (requests from other users) are moderation actions.
 * Outbound rows are context-only and MUST NOT power Home Requests cards/counters.
 */
export function getInboundAdminReviewRequests(
  rows: DashboardJoinRequest[],
): DashboardJoinRequest[] {
  return rows.filter(row => row.direction === 'inbound');
}
export function getJoinRequestRequestedAt(row: {
  requested_at?: string | null;
  created_at?: string | null;
}): string | undefined {
  return row.requested_at ?? row.created_at ?? undefined;
}

function parseJoinRequestTime(value?: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function sortJoinRequestsByRecency(rows: DashboardJoinRequest[]): DashboardJoinRequest[] {
  return [...rows].sort((a, b) => {
    const aTime = parseJoinRequestTime(a.requested_at ?? a.created_at);
    const bTime = parseJoinRequestTime(b.requested_at ?? b.created_at);

    if (aTime !== null && bTime !== null && aTime !== bTime) return bTime - aTime;
    if (aTime !== null && bTime === null) return -1;
    if (aTime === null && bTime !== null) return 1;
    return a.id.localeCompare(b.id);
  });
}

export function getJoinRequestDisplayLabel(row: {
  requested_at?: string | null;
  created_at?: string | null;
}): string {
  const timestamp = row.requested_at ?? row.created_at;
  if (!timestamp) return 'Requested date unavailable';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'Requested date unavailable';
  return `Requested ${parsed.toLocaleDateString()}`;
}

function mapRowToDashboardRequest(
  row: JoinRequestRow,
  currentUserId: string,
): DashboardJoinRequest {
  const tripRelation = row.trips;
  const tripData = Array.isArray(tripRelation) ? tripRelation[0] : tripRelation;
  const direction: 'outbound' | 'inbound' = row.user_id === currentUserId ? 'outbound' : 'inbound';

  const requesterLabel =
    direction === 'inbound'
      ? row.requester_name || row.requester_email?.split('@')[0] || 'Someone'
      : undefined;

  return {
    id: row.id,
    trip_id: row.trip_id,
    user_id: row.user_id,
    requested_at: getJoinRequestRequestedAt(row) ?? row.id,
    created_at: row.created_at ?? undefined,
    direction,
    requesterLabel,
    trip: tripData
      ? {
          id: tripData.id,
          name: tripData.name,
          destination: tripData.destination,
          start_date: tripData.start_date,
          end_date: tripData.end_date,
          member_count: tripData.member_count,
          cover_image_url: tripData.cover_image_url ?? undefined,
          trip_type: tripData.trip_type,
        }
      : undefined,
  };
}

/**
 * useDashboardJoinRequests contract
 *
 * Primary use-case: inbound/admin review surfaces only (approve/reject moderation flows).
 *
 * Outbound rows remain available as contextual metadata for admin views, but are not
 * authoritative for dashboard outbound cards/counters.
 *
 * Home Requests card + counter contract:
 * - source of truth: `usePendingRequestTripCards` (pending-card RPC pipeline)
 * - forbidden source: `useDashboardJoinRequests`
 */
export function useDashboardJoinRequests(isDemoMode = false) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<DashboardJoinRequest[]>([]);
  const [isLoading, setIsLoading] = useState(!isDemoMode && !!user?.id);

  const fetchRequests = useCallback(async () => {
    if (isDemoMode) {
      setRequests(getDemoDashboardJoinRequests());
      setIsLoading(false);
      return;
    }

    if (!user?.id) {
      setRequests([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      const { data: joinedData, error: joinedError } = await supabase
        .from('trip_join_requests')
        .select(
          `
          id,
          trip_id,
          user_id,
          requested_at,
          requester_name,
          requester_email,
          trips (
            id,
            name,
            destination,
            start_date,
            end_date,
            member_count,
            cover_image_url,
            trip_type
          )
        `,
        )
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      if (!joinedError) {
        const mapped = (joinedData as unknown as JoinRequestRow[] | null)?.map(r =>
          mapRowToDashboardRequest(r, user.id),
        );
        setRequests(sortJoinRequestsByRecency(mapped ?? []));
        return;
      }

      if (joinedError) {
        console.error('[useDashboardJoinRequests] fetch error:', joinedError);
        setRequests([]);
        return;
      }
    } catch (e) {
      console.error('[useDashboardJoinRequests]', e);
      setRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, isDemoMode]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (isDemoMode || !user?.id) return;

    const handleForegroundRefresh = () => {
      if (shouldRefreshJoinRequestsOnForeground(document.visibilityState)) {
        void fetchRequests();
      }
    };

    let hasCompletedInitialSubscribe = false;

    const channel = supabase
      .channel(`dashboard_join_requests:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trip_join_requests',
        },
        () => {
          fetchRequests();
        },
      )
      .subscribe(status => {
        if (shouldBackfillJoinRequestsOnSubscribe(status, hasCompletedInitialSubscribe)) {
          void fetchRequests();
          return;
        }

        if (status !== 'SUBSCRIBED') return;
        hasCompletedInitialSubscribe = true;
      });

    document.addEventListener('visibilitychange', handleForegroundRefresh);
    window.addEventListener('focus', handleForegroundRefresh);

    return () => {
      document.removeEventListener('visibilitychange', handleForegroundRefresh);
      window.removeEventListener('focus', handleForegroundRefresh);
      supabase.removeChannel(channel);
    };
  }, [user?.id, isDemoMode, fetchRequests]);

  const cancelOutboundRequest = useCallback(
    async (requestId: string): Promise<{ success: boolean; message?: string }> => {
      if (!user?.id) {
        return { success: false, message: 'You must be logged in to cancel requests.' };
      }

      if (isDemoMode) {
        setRequests(prev =>
          prev.filter(request => !(request.id === requestId && request.direction === 'outbound')),
        );
        return { success: true };
      }

      // typed RPC shim until supabase types are regenerated
      const rpc = supabase.rpc.bind(supabase) as unknown as <T>(
        fn: string,
        params?: Record<string, string>,
      ) => Promise<{ data: T | null; error: { message?: string } | null }>;

      const { data, error } = await rpc<CancelOwnJoinRequestResult>('cancel_own_join_request', {
        _request_id: requestId,
      });

      if (error) {
        return { success: false, message: error.message || 'Failed to cancel request.' };
      }

      const result = mapCancelOwnJoinRequestResult(data);
      if (!result.success) return result;

      setRequests(prev => prev.filter(request => request.id !== requestId));
      return { success: true };
    },
    [isDemoMode, user?.id],
  );

  const inboundAdminRequests = getInboundAdminReviewRequests(requests);

  return {
    requests,
    inboundAdminRequests,
    isLoading,
    refetch: fetchRequests,
    cancelOutboundRequest,
  };
}
