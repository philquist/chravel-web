import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from './useAuth';

interface SetMuteRpcPayload {
  success?: boolean;
  error?: string;
  muted?: boolean;
}

export interface TripNotificationMute {
  muted: boolean;
  isLoading: boolean;
  isToggling: boolean;
  toggleMute: () => void;
}

/**
 * Per-trip notification mute for the current user's own membership row.
 *
 * Reads trip_members.notifications_muted; writes go through the
 * set_trip_notifications_muted RPC (server enforces "own row only").
 * Muting suppresses fanout at create_notification_for_trip_members, which
 * also suppresses downstream push deliveries for this trip.
 */
export function useTripNotificationMute(tripId: string | undefined): TripNotificationMute {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['trip-notification-mute', tripId, user?.id];

  // Gate on hydrated auth + tripId so we never query during auth hydration
  const enabled = Boolean(tripId && user?.id);

  const { data: muted = false, isLoading } = useQuery({
    queryKey,
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('trip_members')
        .select('notifications_muted')
        .eq('trip_id', tripId as string)
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) {
        if (import.meta.env.DEV) {
          console.error('[useTripNotificationMute] read failed:', error);
        }
        // Fail open to "not muted" — never block the options sheet on this read
        return false;
      }
      return (data as any)?.notifications_muted === true;
    },
  });

  const mutation = useMutation({
    mutationFn: async (nextMuted: boolean): Promise<boolean> => {
      const { data, error } = await (supabase.rpc as any)('set_trip_notifications_muted', {
        p_trip_id: tripId as string,
        p_muted: nextMuted,
      });
      if (error) throw error;
      const payload = (data ?? {}) as SetMuteRpcPayload;
      if (!payload.success) {
        throw new Error(payload.error || 'Failed to update notification settings');
      }
      return payload.muted === true;
    },
    onMutate: async (nextMuted: boolean) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<boolean>(queryKey);
      queryClient.setQueryData(queryKey, nextMuted);
      return { previous };
    },
    onError: (_error, _next, context) => {
      // Roll back the optimistic flip
      queryClient.setQueryData(queryKey, context?.previous ?? false);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    muted,
    isLoading,
    isToggling: mutation.isPending,
    toggleMute: () => {
      if (!enabled || mutation.isPending) return;
      mutation.mutate(!muted);
    },
  };
}
