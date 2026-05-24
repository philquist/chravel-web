import type { NotificationType, NotificationPayloadMetadata } from '@/types/notifications';

export interface NotificationCacheItem {
  id: string;
  isRead: boolean;
  timestampMs: number;
  optimisticMutationId?: string;
  // Extended display fields (populated by mapRowToNotification)
  type?: NotificationType;
  title?: string;
  description?: string;
  tripId?: string;
  tripName?: string;
  timestamp?: string;
  isHighPriority?: boolean;
  data?: NotificationPayloadMetadata;
}

export function applyNotificationPatch(
  current: NotificationCacheItem[],
  incoming: NotificationCacheItem,
): NotificationCacheItem[] {
  const existing = current.find(item => item.id === incoming.id);
  if (!existing) return [incoming, ...current];

  const hasPendingOptimistic = Boolean(existing.optimisticMutationId);
  const incomingIsOlder = incoming.timestampMs < existing.timestampMs;

  if (hasPendingOptimistic && incomingIsOlder) {
    return current;
  }

  return current.map(item => (item.id === incoming.id ? { ...existing, ...incoming } : item));
}

export function markNotificationReadOptimistic(
  current: NotificationCacheItem[],
  id: string,
  mutationId: string,
): NotificationCacheItem[] {
  return current.map(item =>
    item.id === id ? { ...item, isRead: true, optimisticMutationId: mutationId } : item,
  );
}

export function clearOptimisticMutation(
  current: NotificationCacheItem[],
  id: string,
  mutationId: string,
): NotificationCacheItem[] {
  return current.map(item => {
    if (item.id !== id || item.optimisticMutationId !== mutationId) return item;
    const { optimisticMutationId: _removed, ...rest } = item;
    return rest;
  });
}
