import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type HubEvent = '*' | 'INSERT' | 'UPDATE' | 'DELETE';
type SubscriptionCallback = (
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
) => void;

export interface TripRealtimeHub {
  subscribe: (table: string, event: HubEvent, callback: SubscriptionCallback) => () => void;
  onReconnect: (callback: () => void) => () => void;
}

interface HubRegistry {
  subscribe: TripRealtimeHub['subscribe'];
  onReconnect: TripRealtimeHub['onReconnect'];
}

declare global {
  interface Window {
    __tripRealtimeHubs?: Map<string, HubRegistry>;
  }
}

const TRIP_HUB_TABLES = [
  { table: 'trip_tasks', column: 'trip_id' },
  { table: 'trip_polls', column: 'trip_id' },
  { table: 'trip_events', column: 'trip_id' },
  { table: 'trip_payment_messages', column: 'trip_id' },
  { table: 'trip_links', column: 'trip_id' },
  { table: 'trip_media_index', column: 'trip_id' },
  { table: 'trip_join_requests', column: 'trip_id' },
  { table: 'trips', column: 'id' },
] as const;

function getHubRegistryMap(): Map<string, HubRegistry> {
  if (typeof window === 'undefined') {
    return new Map();
  }
  if (!window.__tripRealtimeHubs) {
    window.__tripRealtimeHubs = new Map();
  }
  return window.__tripRealtimeHubs;
}

function subscriptionKey(table: string, event: HubEvent): string {
  return `${table}:${event}`;
}

/**
 * Trip-scoped realtime multiplexer with reconnect refetch contract.
 * One Supabase channel per trip; feature hooks subscribe instead of opening their own.
 */
export function useTripRealtimeHub(tripId: string | undefined): void {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribersRef = useRef<Map<string, Set<SubscriptionCallback>>>(new Map());
  const reconnectHandlersRef = useRef<Set<() => void>>(new Set());

  useEffect(() => {
    if (!tripId || typeof window === 'undefined') return;

    const subscribers = subscribersRef.current;
    const reconnectHandlers = reconnectHandlersRef.current;

    const hub: HubRegistry = {
      subscribe: (table, event, callback) => {
        const key = subscriptionKey(table, event);
        const bucket = subscribers.get(key) ?? new Set<SubscriptionCallback>();
        bucket.add(callback);
        subscribers.set(key, bucket);
        return () => {
          bucket.delete(callback);
          if (bucket.size === 0) {
            subscribers.delete(key);
          }
        };
      },
      onReconnect: callback => {
        reconnectHandlers.add(callback);
        return () => {
          reconnectHandlers.delete(callback);
        };
      },
    };

    getHubRegistryMap().set(tripId, hub);

    const dispatch = (
      table: string,
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) => {
      const event = (payload.eventType ?? '*') as HubEvent;
      const wildcard = subscribers.get(subscriptionKey(table, '*'));
      const specific = subscribers.get(subscriptionKey(table, event));
      wildcard?.forEach(cb => cb(payload));
      if (event !== '*') {
        specific?.forEach(cb => cb(payload));
      }
    };

    const channel = supabase.channel(`trip_hub:${tripId}`);
    for (const { table, column } of TRIP_HUB_TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `${column}=eq.${tripId}` },
        payload =>
          dispatch(table, payload as RealtimePostgresChangesPayload<Record<string, unknown>>),
      );
    }

    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        reconnectHandlers.forEach(handler => {
          try {
            handler();
          } catch {
            // Reconnect handlers are best-effort invalidation hooks.
          }
        });
      }
    });

    channelRef.current = channel;

    return () => {
      getHubRegistryMap().delete(tripId);
      subscribers.clear();
      reconnectHandlers.clear();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [tripId]);
}
