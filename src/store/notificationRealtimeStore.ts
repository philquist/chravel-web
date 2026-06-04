import { create } from 'zustand';

interface NotificationRealtimeState {
  unreadCount: number;
  /**
   * Monotonic tick bumped whenever notification read/insert/clear state changes.
   * `useAppBadge` watches this to recompute the app-icon badge without prop drilling.
   */
  badgeDirty: number;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  decrementUnread: () => void;
  bumpBadgeDirty: () => void;
  clearAll: () => void;
}

export const useNotificationRealtimeStore = create<NotificationRealtimeState>(set => ({
  unreadCount: 0,
  badgeDirty: 0,
  setUnreadCount: unreadCount => set({ unreadCount }),
  incrementUnread: () => set(state => ({ unreadCount: state.unreadCount + 1 })),
  decrementUnread: () => set(state => ({ unreadCount: Math.max(0, state.unreadCount - 1) })),
  bumpBadgeDirty: () => set(state => ({ badgeDirty: state.badgeDirty + 1 })),
  clearAll: () => set(state => ({ unreadCount: 0, badgeDirty: state.badgeDirty + 1 })),
}));
