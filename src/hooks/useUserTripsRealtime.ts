/**
 * Single subscription for user-level trip updates (join requests + trip_members).
 * Replaces dual channels in useTrips: trip_join_requests:${userId} + trip-members-changes.
 */

import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

const TRIPS_QUERY_KEY = 'trips';

type MemberChangePayload = {
  new?: { user_id?: string | null } | null;
  old?: { user_id?: string | null } | null;
};

type JoinRequestChangePayload = {
  eventType?: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: { user_id?: string | null } | null;
  old?: { user_id?: string | null } | null;
};

import {
  shouldBackfillOnSubscribe,
  shouldRefreshOnForeground,
} from './utils/realtimeBackfillPolicy';

export const shouldRefreshTripsOnForeground = shouldRefreshOnForeground;
export const shouldBackfillTripsOnSubscribe = shouldBackfillOnSubscribe;

export function shouldInvalidateTripsForMemberChange(
  payload: MemberChangePayload,
  userId: string,
): boolean {
  return payload.new?.user_id === userId || payload.old?.user_id === userId;
}

export function shouldInvalidateTripsForJoinRequestChange(
  payload: JoinRequestChangePayload,
  userId: string,
): boolean {
  return payload.new?.user_id === userId || payload.old?.user_id === userId;
}

export function useUserTripsRealtime(userId: string | undefined, isDemoMode: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isDemoMode || !userId) return;

    const invalidateTrips = () => {
      queryClient.invalidateQueries({ queryKey: [TRIPS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['proTrips'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      // Pending outbound requests (`get_my_pending_trip_request_cards`) must refresh when
      // membership or join-request rows change — otherwise approval/cancel can lag behind trips.
      queryClient.invalidateQueries({ queryKey: ['pending-request-trip-cards'] });
    };

    const handleForegroundRefresh = () => {
      if (shouldRefreshTripsOnForeground(document.visibilityState)) {
        invalidateTrips();
      }
    };

    let hasCompletedInitialSubscribe = false;

    const channel = supabase
      .channel(`user_trips:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trip_join_requests',
          filter: `user_id=eq.${userId}`,
        },
        payload => {
          if (
            shouldInvalidateTripsForJoinRequestChange(payload as JoinRequestChangePayload, userId)
          ) {
            invalidateTrips();
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trip_members',
          filter: `user_id=eq.${userId}`,
        },
        payload => {
          if (shouldInvalidateTripsForMemberChange(payload as MemberChangePayload, userId)) {
            invalidateTrips();
          }
        },
      )
      .subscribe(status => {
        if (shouldBackfillTripsOnSubscribe(status, hasCompletedInitialSubscribe)) {
          invalidateTrips();
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
  }, [userId, isDemoMode, queryClient]);
}
