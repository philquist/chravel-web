/**
 * Shared notification realtime hook — ONE subscription for TripActionBar.
 * Deduplicates channels: both components share the same Supabase subscription and state.
 *
 * Features:
 * - Singleton realtime subscription per user (refCount pattern)
 * - INSERT + UPDATE event handling for multi-device read state propagation
 * - Reconnect correction: re-fetches from DB on channel reconnect
 * - Logout cleanup: clears Zustand store when user becomes null
 */

import { useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useDemoMode } from './useDemoMode';
import { useNotificationRealtimeStore } from '@/store/notificationRealtimeStore';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationCacheItem } from '@/lib/query/realtimeCache';
import {
  applyNotificationPatch,
  clearOptimisticMutation,
  markNotificationReadOptimistic,
} from '@/lib/query/realtimeCache';
import {
  parseNotificationIngestionRow,
  parseNotificationMetadata,
} from '@/lib/notifications/navigation';
import { formatInAppAlertCopy } from '@/lib/notifications/alertCopy';

const NOTIFICATION_COLUMNS =
  'id, type, title, message, is_read, is_visible, metadata, trip_id, created_at';

type NotificationEntity = Omit<NotificationCacheItem, 'timestampMs' | 'optimisticMutationId'>;

export function mapRowToNotification(row: Record<string, unknown>): NotificationEntity | null {
  const parsedRow = parseNotificationIngestionRow(row);
  if (!parsedRow) {
    return null;
  }

  const metadata = parseNotificationMetadata(parsedRow.metadata);
  // Prefer metadata for modern notifications, but fall back to column for legacy rows.
  const tripId = (metadata.trip_id as string) || parsedRow.trip_id || '';
  const tripName = (metadata.trip_name as string) || '';
  const alertCopy = formatInAppAlertCopy({
    type: parsedRow.type,
    title: parsedRow.title,
    message: parsedRow.message,
    tripName,
    metadata: metadata as Record<string, unknown>,
  });

  return {
    id: parsedRow.id,
    type: parsedRow.type,
    title: alertCopy.title,
    description: alertCopy.description,
    tripId,
    tripName,
    timestamp: formatDistanceToNow(new Date(parsedRow.created_at), {
      addSuffix: true,
    }),
    isRead: parsedRow.is_read,
    isHighPriority: parsedRow.type === 'broadcast',
    data: metadata,
  };
}

// Singleton: one subscription per user, refCount for cleanup
const subscriptionRefs = new Map<
  string,
  { refCount: number; channel: ReturnType<typeof supabase.channel> }
>();

interface SubscriptionCallbacks {
  onInsert: (row: Record<string, unknown>) => void;
  onUpdate: (row: Record<string, unknown>) => void;
  onReconnect: () => void;
}

function ensureSubscription(userId: string, callbacks: SubscriptionCallbacks) {
  const existing = subscriptionRefs.get(userId);
  if (existing) {
    existing.refCount++;
    return () => {
      existing.refCount--;
      if (existing.refCount <= 0) {
        supabase.removeChannel(existing.channel);
        subscriptionRefs.delete(userId);
      }
    };
  }

  // Scope by user_id, NOT trip_id. This is the global notification feed (the bell):
  // a user must receive their notifications across ALL trips, so user_id is the
  // correct partition key here. The channel name (`notifications:${userId}`) plus the
  // `user_id=eq` filter mean this subscription only ever receives this user's rows —
  // it is not an unfiltered global channel. (Memory #20's trip_id rule applies to
  // trip-scoped channels like chat/reactions, not to a per-user inbox.)
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      payload => {
        callbacks.onInsert(payload.new as Record<string, unknown>);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      payload => {
        callbacks.onUpdate(payload.new as Record<string, unknown>);
      },
    )
    .subscribe((status, err) => {
      if (err && import.meta.env.DEV) {
        console.error('[useNotificationRealtime] Subscription error:', err);
      }
      // Re-fetch from DB on reconnect to correct any drift from gaps
      if (status === 'SUBSCRIBED') {
        // Channel just (re)connected — re-fetch to fill any gap
        callbacks.onReconnect();
      }
    });

  subscriptionRefs.set(userId, { refCount: 1, channel });

  return () => {
    const entry = subscriptionRefs.get(userId);
    if (entry) {
      entry.refCount--;
      if (entry.refCount <= 0) {
        supabase.removeChannel(entry.channel);
        subscriptionRefs.delete(userId);
      }
    }
  };
}

export function useNotificationRealtime() {
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const {
    unreadCount,
    setUnreadCount,
    incrementUnread,
    decrementUnread,
    bumpBadgeDirty,
    clearAll: storeClearAll,
  } = useNotificationRealtimeStore();
  const queryClient = useQueryClient();

  // Track whether initial fetch has completed to avoid double-fetch on SUBSCRIBED
  const initialFetchDone = useRef(false);

  const fetchNotifications = useCallback(async (): Promise<NotificationCacheItem[]> => {
    if (!user) return [];

    const { data, error } = await supabase
      .from('notifications')
      .select(NOTIFICATION_COLUMNS)
      .eq('user_id', user.id)
      .eq('is_visible', true)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      if (import.meta.env.DEV) {
        console.error('[useNotificationRealtime] Error fetching notifications:', error);
      }
      return [];
    }

    if (data) {
      const mapped = data
        .map(row => mapRowToNotification(row as Record<string, unknown>))
        .filter(
          (item): item is NonNullable<ReturnType<typeof mapRowToNotification>> => item !== null,
        )
        .map(item => ({ ...item, timestampMs: Date.now() }));
      return mapped;
    }

    return [];
  }, [user]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
      .eq('is_visible', true);

    if (!error && count !== null) {
      setUnreadCount(count);
    }
  }, [user, setUnreadCount]);

  // Clear notification state on logout (user becomes null)
  useEffect(() => {
    if (!user) {
      storeClearAll();
      initialFetchDone.current = false;
    }
  }, [user, storeClearAll]);

  // Single realtime subscription — shared by all consumers
  useEffect(() => {
    if (isDemoMode || !user) return;

    initialFetchDone.current = false;
    void queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
    fetchUnreadCount();
    initialFetchDone.current = true;

    const cleanup = ensureSubscription(user.id, {
      onInsert: (newRow: Record<string, unknown>) => {
        const item = mapRowToNotification(newRow);
        if (!item) return;
        queryClient.setQueryData<NotificationCacheItem[]>(['notifications', user.id], old =>
          applyNotificationPatch(old ?? [], { ...item, timestampMs: Date.now() }),
        );
        if (!item.isRead) incrementUnread();
        // Recompute the app-icon badge; useAppBadge applies the category filter.
        bumpBadgeDirty();
      },
      onUpdate: (updatedRow: Record<string, unknown>) => {
        const id = updatedRow.id as string;
        if (!id) return;

        queryClient.setQueryData<NotificationCacheItem[]>(['notifications', user.id], old => {
          if (!old) return old;
          if (updatedRow.is_visible === false) return old.filter(n => n.id !== id);
          return applyNotificationPatch(old, {
            ...old.find(n => n.id === id)!,
            isRead: Boolean(updatedRow.is_read),
            timestampMs: Date.now(),
          });
        });
        // Read-state may have changed on another device — reconcile the badge.
        bumpBadgeDirty();
      },
      onReconnect: () => {
        // Only re-fetch on reconnect, not on initial subscription
        if (initialFetchDone.current) {
          fetchNotifications();
          fetchUnreadCount();
        }
      },
    });

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user object is unstable; user?.id already in deps
  }, [user?.id, isDemoMode, fetchNotifications, fetchUnreadCount, incrementUnread, bumpBadgeDirty]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!user) return;
      const mutationId = `${notificationId}:${Date.now()}`;
      queryClient.setQueryData<NotificationCacheItem[]>(['notifications', user.id], old =>
        markNotificationReadOptimistic(old ?? [], notificationId, mutationId),
      );
      decrementUnread();
      await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
      queryClient.setQueryData<NotificationCacheItem[]>(['notifications', user.id], old =>
        clearOptimisticMutation(old ?? [], notificationId, mutationId),
      );
      bumpBadgeDirty();
      fetchUnreadCount();
    },
    [user, queryClient, decrementUnread, bumpBadgeDirty, fetchUnreadCount],
  );

  const markAllAsRead = useCallback(
    async (currentNotifications: NotificationCacheItem[]) => {
      setUnreadCount(0);

      if (user) {
        const unreadIds = currentNotifications.filter(n => !n.isRead).map(n => n.id);
        if (unreadIds.length > 0) {
          await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
        }
      }
      bumpBadgeDirty();
    },
    [user, setUnreadCount, bumpBadgeDirty],
  );

  const clearAll = useCallback(
    async (currentNotifications: NotificationCacheItem[]) => {
      const ids = currentNotifications.map(n => n.id);
      storeClearAll();

      if (user && ids.length > 0) {
        await supabase
          .from('notifications')
          .update({ is_visible: false, cleared_at: new Date().toISOString() })
          .in('id', ids);
      }
    },
    [user, storeClearAll],
  );

  const deleteNotification = useCallback(
    async (notificationId: string) => {
      if (user) {
        queryClient.setQueryData<NotificationCacheItem[]>(['notifications', user.id], old =>
          (old ?? []).filter(n => n.id !== notificationId),
        );
      }

      if (user) {
        await supabase
          .from('notifications')
          .update({ is_visible: false, cleared_at: new Date().toISOString() })
          .eq('id', notificationId);
      }
      bumpBadgeDirty();
    },
    [user, queryClient, bumpBadgeDirty],
  );

  const notificationsQuery = useQuery({
    queryKey: ['notifications', user?.id],
    enabled: Boolean(user && !isDemoMode),
    queryFn: fetchNotifications,
    staleTime: 30_000,
  });

  const notifications = useMemo(() => notificationsQuery.data ?? [], [notificationsQuery.data]);

  return {
    notifications,
    unreadCount,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
    deleteNotification,
  };
}
