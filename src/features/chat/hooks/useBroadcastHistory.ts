/**
 * Off-window history hooks for the chat tabs.
 *
 * The Broadcasts and Pinned tabs filter the in-memory timeline, which is a
 * bounded window (30 initially loaded, 250 retained). Broadcasts or pins older
 * than that window were silently invisible in their tabs even though they exist
 * in the channel. While a tab is active, these hooks fetch the relevant history
 * directly from Stream (server-side message_type filter for broadcasts, the
 * native pinned-messages endpoint for pins) so the tabs can always show
 * everything. Failure is non-fatal: consumers merge [] and the tab falls back
 * to the window-filtered view (previous behavior).
 */

import { useEffect, useState } from 'react';
import type { MessageResponse } from 'stream-chat';
import {
  fetchTripBroadcastHistory,
  fetchTripPinnedHistory,
} from '@/services/stream/streamMessageSearch';

function useOffWindowHistory(
  tripId: string | undefined,
  enabled: boolean,
  fetcher: (params: { tripId: string }) => Promise<MessageResponse[]>,
) {
  const [history, setHistory] = useState<MessageResponse[]>([]);

  useEffect(() => {
    if (!enabled || !tripId) return;

    let cancelled = false;
    fetcher({ tripId }).then(messages => {
      if (!cancelled) setHistory(messages);
    });

    return () => {
      cancelled = true;
    };
  }, [tripId, enabled, fetcher]);

  return history;
}

export function useBroadcastHistory(tripId: string | undefined, enabled: boolean) {
  return useOffWindowHistory(tripId, enabled, fetchTripBroadcastHistory);
}

export function usePinnedHistory(tripId: string | undefined, enabled: boolean) {
  return useOffWindowHistory(tripId, enabled, fetchTripPinnedHistory);
}
