import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { DEMO_CONCIERGE_HISTORY } from '@/mockData/demoConciergeMessages';
import {
  fetchConciergeHistoryMessages,
  normalizeConciergeHistoryCache,
} from '@/features/concierge/utils/mapConciergeHistory';
import type { ChatMessage } from '@/features/concierge/types';

/**
 * @deprecated Use ChatMessage from '@/features/concierge/types' instead.
 * Kept as alias for backward compatibility.
 */
export type ConciergeChatMessage = ChatMessage;

const VALID_TRIP_ID = /^[a-zA-Z0-9_-]{1,50}$/;

function isValidTripId(tripId: string): boolean {
  return !!tripId && tripId !== 'unknown' && tripId !== '' && VALID_TRIP_ID.test(tripId);
}

export const conciergeHistoryQueryKey = (
  tripId: string,
  userId: string | undefined,
  isDemoMode: boolean,
) => ['conciergeHistory', tripId, userId ?? 'anon', isDemoMode ? 'demo' : 'live'] as const;

/**
 * Fetches the authenticated user's persisted AI concierge history for a trip.
 *
 * In demo mode, returns pre-seeded mock conversation data instead of
 * querying the database (no auth session exists in demo mode).
 *
 * Queries the `ai_queries` table directly (the previous RPC
 * `get_concierge_trip_history` does not exist in the database).
 *
 * Each row in `ai_queries` contains both the user's query and the assistant's
 * response, so we map each row into two ConciergeChatMessage entries.
 */
export function useConciergeHistory(tripId: string): {
  data: ConciergeChatMessage[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const enabled = isValidTripId(tripId) && (!!user || isDemoMode);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: conciergeHistoryQueryKey(tripId, user?.id, isDemoMode),
    queryFn: async (): Promise<ConciergeChatMessage[]> => {
      if (isDemoMode && DEMO_CONCIERGE_HISTORY[tripId]) {
        return DEMO_CONCIERGE_HISTORY[tripId];
      }

      if (!user?.id) return [];

      return fetchConciergeHistoryMessages(tripId, user.id);
    },
    select: normalizeConciergeHistoryCache,
    enabled,
    staleTime: 30 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  return {
    data: data ?? [],
    isLoading: enabled ? isLoading : false,
    error: error as Error | null,
    refetch,
  };
}
