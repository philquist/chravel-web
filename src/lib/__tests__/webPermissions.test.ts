import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPermissionStatus,
  openAppSettings,
  openNotificationSettingsIfAvailable,
  requestPermission,
} from '@/lib/webPermissions';

describe('webPermissions', () => {
  const originalNotification = globalThis.Notification;

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as unknown as { Notification?: typeof Notification }).Notification;
    if (originalNotification) {
      (globalThis as unknown as { Notification: typeof Notification }).Notification =
        originalNotification;
    }
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    delete (window as unknown as { ChravelNative?: unknown }).ChravelNative;
  });

  describe('Capacitor PushNotifications bridge', () => {
    beforeEach(() => {
      (globalThis as unknown as { Notification: typeof Notification }).Notification =
        class MockNotification {
          static permission: NotificationPermission = 'prompt';
          static requestPermission = vi.fn(async (): Promise<NotificationPermission> => 'denied');
        } as unknown as typeof Notification;
    });

    it('getPermissionStatus uses PushNotifications.checkPermissions when registered', async () => {
      (window as unknown as { Capacitor: { Plugins: Record<string, unknown> } }).Capacitor = {
        Plugins: {
          PushNotifications: {
            checkPermissions: vi.fn(async () => ({ receive: 'granted' })),
            requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
            register: vi.fn(async () => undefined),
          },
        },
      };

      const status = await getPermissionStatus('notifications');
      expect(status.state).toBe('granted');
      expect(typeof status.canOpenSettings).toBe('boolean');
    });

    it('requestPermission uses PushNotifications.requestPermissions and register', async () => {
      const register = vi.fn(async () => undefined);
      (window as unknown as { Capacitor: { Plugins: Record<string, unknown> } }).Capacitor = {
        Plugins: {
          PushNotifications: {
            checkPermissions: vi.fn(async () => ({ receive: 'prompt' })),
            requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
            register,
          },
        },
      };

      const state = await requestPermission('notifications');
      expect(state).toBe('granted');
      expect(register).toHaveBeenCalled();
    });
  });

  describe('openAppSettings', () => {
    it('returns true when ChravelNative.openAppSettings exists', async () => {
      const openAppSettingsNative = vi.fn();
      (window as unknown as { ChravelNative: { openAppSettings: () => void } }).ChravelNative = {
        openAppSettings: openAppSettingsNative,
      };
      await expect(openAppSettings()).resolves.toBe(true);
      expect(openAppSettingsNative).toHaveBeenCalled();
    });

    it('returns true when Capacitor App.openUrl succeeds', async () => {
      const openUrl = vi.fn(async () => undefined);
      (window as unknown as { Capacitor: { Plugins: Record<string, unknown> } }).Capacitor = {
        Plugins: {
          App: { openUrl },
        },
      };
      await expect(openAppSettings()).resolves.toBe(true);
      expect(openUrl).toHaveBeenCalledWith({ url: 'app-settings:' });
    });

    it('openNotificationSettingsIfAvailable prefers ChravelNative.openNotificationSettings', async () => {
      const openNotificationSettings = vi.fn();
      (
        window as unknown as { ChravelNative: { openNotificationSettings: () => void } }
      ).ChravelNative = {
        openNotificationSettings,
      };
      await expect(openNotificationSettingsIfAvailable()).resolves.toBe(true);
      expect(openNotificationSettings).toHaveBeenCalled();
    });
  });
});
