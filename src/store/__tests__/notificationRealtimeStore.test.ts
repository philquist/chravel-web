import { beforeEach, describe, expect, it } from 'vitest';
import { useNotificationRealtimeStore } from '../notificationRealtimeStore';

const base = {
  type: 'broadcast',
  title: 'New alert',
  description: 'desc',
  tripId: 'trip-1',
  tripName: 'Trip',
  timestamp: 'now',
  isHighPriority: false,
  data: {},
} as const;

describe('notificationRealtimeStore unread counter', () => {
  beforeEach(() => {
    useNotificationRealtimeStore.getState().clearAll();
  });

  it('increments/decrements unread count as read state mutates', () => {
    const store = useNotificationRealtimeStore.getState();

    store.addNotification({ ...base, id: 'n1', isRead: false });
    store.addNotification({ ...base, id: 'n2', isRead: true });

    expect(useNotificationRealtimeStore.getState().unreadCount).toBe(1);

    store.updateNotification('n2', { isRead: false });
    expect(useNotificationRealtimeStore.getState().unreadCount).toBe(2);

    store.updateNotification('n1', { isRead: true });
    expect(useNotificationRealtimeStore.getState().unreadCount).toBe(1);

    store.removeNotification('n2');
    expect(useNotificationRealtimeStore.getState().unreadCount).toBe(0);
  });

  it('markAllRead zeroes badge count', () => {
    const store = useNotificationRealtimeStore.getState();
    store.addNotification({ ...base, id: 'n1', isRead: false });
    store.addNotification({ ...base, id: 'n2', isRead: false });

    store.markAllRead();

    const state = useNotificationRealtimeStore.getState();
    expect(state.unreadCount).toBe(0);
    expect(state.notifications.every(n => n.isRead)).toBe(true);
  });
});
