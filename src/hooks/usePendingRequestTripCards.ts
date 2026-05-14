import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getDemoDashboardJoinRequests } from '@/mockData/dashboardJoinRequestsMock';
import { invalidatePendingRequestState } from '@/hooks/pendingRequestsCache';

export interface PendingRequestTripCard {
  requestId: string;
  tripId: string;
  tripType: 'consumer' | 'pro' | 'event';
  requestedAt: string | null;
  title: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  dateLabel: string;
  coverImageUrl: string | null;
  peopleCount: number;
  placesCount: number;
}

type PendingRequestTripCardRow = {
  request_id: string;
  trip_id: string;
  trip_type: string | null;
  requested_at: string | null;
  title: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  cover_image_url: string | null;
  member_count: number | null;
  places_count: number | null;
};

const parseDateOnly = (value: string): Date => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }
  return new Date(value);
};

const formatDateLabel = (value: string): string | null => {
  const date = parseDateOnly(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'MMM d, yyyy');
};

const formatDateRangeLabel = (startDate: string | null, endDate: string | null): string => {
  if (!startDate) return 'Date TBD';
  const startLabel = formatDateLabel(startDate);
  if (!startLabel) return 'Date TBD';
  if (!endDate) return startLabel;
  const endLabel = formatDateLabel(endDate);
  if (!endLabel || endLabel === startLabel) return startLabel;
  return `${startLabel} - ${endLabel}`;
};

const normalizeTripType = (tripType: string | null): 'consumer' | 'pro' | 'event' => {
  if (tripType === 'pro' || tripType === 'event') return tripType;
  return 'consumer';
};

const mapRowToCard = (row: PendingRequestTripCardRow): PendingRequestTripCard | null => {
  const normalizedTitle = row.title?.trim();
  if (!normalizedTitle) {
    if (import.meta.env.DEV) {
      console.warn('[usePendingRequestTripCards] Dropping request card with missing trip title', {
        requestId: row.request_id,
        tripId: row.trip_id,
      });
    }
    return null;
  }

  return {
    requestId: row.request_id,
    tripId: row.trip_id,
    tripType: normalizeTripType(row.trip_type),
    requestedAt: row.requested_at,
    title: normalizedTitle,
    destination: row.destination?.trim() || null,
    startDate: row.start_date,
    endDate: row.end_date,
    dateLabel: formatDateRangeLabel(row.start_date, row.end_date),
    coverImageUrl: row.cover_image_url,
    peopleCount: Math.max(1, row.member_count ?? 1),
    placesCount: Math.max(0, row.places_count ?? 0),
  };
};

export function usePendingRequestTripCards(isDemoMode = false) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['pending-request-trip-cards', user?.id, isDemoMode],
    enabled: isDemoMode || !!user?.id,
    queryFn: async (): Promise<PendingRequestTripCard[]> => {
      if (isDemoMode) {
        return getDemoDashboardJoinRequests()
          .filter(req => req.direction === 'outbound')
          .map(req => ({
            requestId: req.id,
            tripId: req.trip_id,
            tripType: normalizeTripType(req.trip?.trip_type ?? null),
            requestedAt: req.requested_at,
            title: req.trip?.name ?? 'Trip',
            destination: req.trip?.destination ?? null,
            startDate: req.trip?.start_date ?? null,
            endDate: req.trip?.end_date ?? null,
            dateLabel: formatDateRangeLabel(
              req.trip?.start_date ?? null,
              req.trip?.end_date ?? null,
            ),
            coverImageUrl: req.trip?.cover_image_url ?? null,
            peopleCount: Math.max(1, req.trip?.member_count ?? 1),
            placesCount: 0,
          }));
      }

      if (!user?.id) return [];

      const rpc = supabase.rpc.bind(supabase) as unknown as <T>(
        fn: string,
      ) => Promise<{ data: T[] | null; error: { message?: string } | null }>;

      const { data, error } = await rpc<PendingRequestTripCardRow>(
        'get_my_pending_trip_request_cards',
      );

      if (error) throw new Error(error.message || 'Failed to load pending request cards');
      const mappedRpcCards = (data ?? [])
        .map(mapRowToCard)
        .filter((card): card is PendingRequestTripCard => card !== null);

      if (mappedRpcCards.length > 0) {
        return mappedRpcCards;
      }

      const { data: pendingRequests, error: pendingRequestsError } = await supabase
        .from('trip_join_requests')
        .select('id, trip_id, requested_at')
        .eq('user_id', user.id)
        .eq('status', 'pending');

      if (pendingRequestsError || !pendingRequests?.length) {
        return mappedRpcCards;
      }

      const tripIds = [...new Set(pendingRequests.map(request => request.trip_id))];
      const { data: trips, error: tripsError } = await supabase
        .from('trips')
        .select('id, trip_type, name, destination, start_date, end_date, cover_image_url')
        .in('id', tripIds);

      if (tripsError || !trips?.length) {
        return mappedRpcCards;
      }

      const tripsById = new Map(trips.map(trip => [trip.id, trip] as const));
      const fallbackCards = pendingRequests
        .map(request => {
          const trip = tripsById.get(request.trip_id);
          if (!trip) return null;

          return mapRowToCard({
            request_id: request.id,
            trip_id: request.trip_id,
            trip_type: trip.trip_type,
            requested_at: request.created_at,
            title: trip.name,
            destination: trip.destination,
            start_date: trip.start_date,
            end_date: trip.end_date,
            cover_image_url: trip.cover_image_url,
            member_count: 1,
            places_count: 0,
          });
        })
        .filter((card): card is PendingRequestTripCard => card !== null);

      if (import.meta.env.DEV) {
        console.warn('[usePendingRequestTripCards] Activated temporary fallback query path', {
          rpcRowCount: data?.length ?? 0,
          pendingRequestRowCount: pendingRequests.length,
          tripRowCount: trips.length,
          fallbackCardCount: fallbackCards.length,
        });
      }

      return fallbackCards;
    },
    staleTime: 60_000,
  });

  const cancelPendingRequest = useCallback(
    async (requestId: string): Promise<{ success: boolean; message?: string }> => {
      if (!user?.id) {
        return { success: false, message: 'You must be logged in to cancel requests.' };
      }

      const rpc = supabase.rpc.bind(supabase) as unknown as <T>(
        fn: string,
        params?: Record<string, string>,
      ) => Promise<{ data: T | null; error: { message?: string } | null }>;

      const { data, error } = await rpc<{ success?: boolean; message?: string }>(
        'cancel_own_join_request',
        {
          _request_id: requestId,
        },
      );

      if (error) {
        return { success: false, message: error.message || 'Failed to cancel request.' };
      }

      if (!data?.success) {
        return { success: false, message: data?.message || 'Unable to cancel request.' };
      }

      await invalidatePendingRequestState(queryClient);
      return { success: true };
    },
    [queryClient, user?.id],
  );

  return useMemo(
    () => ({
      cards: query.data ?? [],
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      error: query.error,
      refetch: query.refetch,
      cancelPendingRequest,
    }),
    [
      cancelPendingRequest,
      query.data,
      query.error,
      query.isFetching,
      query.isLoading,
      query.refetch,
    ],
  );
}
