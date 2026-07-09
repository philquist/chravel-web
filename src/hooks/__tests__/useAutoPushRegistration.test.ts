import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAutoPushRegistration } from '../useAutoPushRegistration';

const mocks = vi.hoisted(() => ({
  getNotificationPreferences: vi.fn(),
  hasActiveDeviceToken: vi.fn(),
  registerForPush: vi.fn(),
  subscribeWebPush: vi.fn(),
}));

vi.mock('../useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}));
vi.mock('../useNativePush', () => ({
  useNativePush: () => ({
    isNative: true,
    isRegistered: false,
    registerForPush: mocks.registerForPush,
  }),
}));
vi.mock('../useWebPush', () => ({
  useWebPush: () => ({
    isSupported: false,
    isSubscribed: false,
    subscribe: mocks.subscribeWebPush,
  }),
}));
vi.mock('@/services/userPreferencesService', () => ({
  userPreferencesService: {
    getNotificationPreferences: mocks.getNotificationPreferences,
  },
}));
vi.mock('@/services/pushTokenService', () => ({
  hasActiveDeviceToken: mocks.hasActiveDeviceToken,
}));

describe('useAutoPushRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNotificationPreferences.mockResolvedValue({ push_enabled: true });
    mocks.hasActiveDeviceToken.mockResolvedValue(false);
    mocks.registerForPush.mockResolvedValue('token-abc');
  });

  it('registers native push when push_enabled and no device token exists', async () => {
    renderHook(() => useAutoPushRegistration());

    await waitFor(() => {
      expect(mocks.registerForPush).toHaveBeenCalledTimes(1);
    });
  });

  it('skips registration when push_enabled is false', async () => {
    mocks.getNotificationPreferences.mockResolvedValue({ push_enabled: false });

    renderHook(() => useAutoPushRegistration());

    await waitFor(() => {
      expect(mocks.getNotificationPreferences).toHaveBeenCalled();
    });
    expect(mocks.registerForPush).not.toHaveBeenCalled();
  });
});
