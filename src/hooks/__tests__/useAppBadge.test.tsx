import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppBadge } from '../useAppBadge';
import { useNotificationRealtimeStore } from '@/store/notificationRealtimeStore';

describe('useAppBadge', () => {
  const setAppBadge = vi.fn().mockResolvedValue(undefined);
  const clearAppBadge = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    setAppBadge.mockClear();
    clearAppBadge.mockClear();
    (navigator as unknown as { setAppBadge: unknown }).setAppBadge = setAppBadge;
    (navigator as unknown as { clearAppBadge: unknown }).clearAppBadge = clearAppBadge;
    useNotificationRealtimeStore.getState().setUnreadCount(0);
  });

  afterEach(() => {
    delete (navigator as unknown as { setAppBadge?: unknown }).setAppBadge;
    delete (navigator as unknown as { clearAppBadge?: unknown }).clearAppBadge;
  });

  it('sets the app badge to the unread count when there are unread notifications', () => {
    useNotificationRealtimeStore.getState().setUnreadCount(3);
    renderHook(() => useAppBadge());
    expect(setAppBadge).toHaveBeenCalledWith(3);
    expect(clearAppBadge).not.toHaveBeenCalled();
  });

  it('clears the app badge when the unread count is zero', () => {
    renderHook(() => useAppBadge());
    expect(clearAppBadge).toHaveBeenCalled();
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  it('no-ops when the Badging API is unavailable', () => {
    delete (navigator as unknown as { setAppBadge?: unknown }).setAppBadge;
    useNotificationRealtimeStore.getState().setUnreadCount(5);
    expect(() => renderHook(() => useAppBadge())).not.toThrow();
    expect(clearAppBadge).not.toHaveBeenCalled();
  });
});
