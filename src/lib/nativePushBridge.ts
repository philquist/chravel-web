/**
 * Native push bridge — no @capacitor/* npm dependency.
 *
 * Installed shells (Capacitor or chravel-mobile) inject `window.Capacitor.Plugins`
 * at runtime. This module mirrors the old `src/native/push.ts` wrapper using that
 * injected bridge only.
 */

import { isCapacitorNativeShell, isChravelNativeShell } from '@/utils/platformDetection';

export type NativePushPermission = 'granted' | 'denied' | 'prompt';

export interface NativePushRegistrationResult {
  token: string | null;
  error?: string;
}

type PushReceiveStatus = { receive?: string };

type PushTokenEvent = { value: string };

type PushRegistrationError = { error: string };

export type PushNotificationsPlugin = {
  checkPermissions: () => Promise<PushReceiveStatus>;
  requestPermissions: () => Promise<PushReceiveStatus>;
  register: () => Promise<void>;
  addListener: (
    eventName: string,
    listener: (payload: PushTokenEvent | PushRegistrationError | unknown) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
  removeAllListeners: () => Promise<void>;
};

function getCapacitorPlugins(): Record<string, unknown> | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
    ?.Plugins;
}

export function getPushNotificationsPlugin(): PushNotificationsPlugin | null {
  const raw = getCapacitorPlugins()?.PushNotifications;
  if (!raw || typeof raw !== 'object') return null;
  const plugin = raw as PushNotificationsPlugin;
  if (
    typeof plugin.checkPermissions !== 'function' ||
    typeof plugin.requestPermissions !== 'function' ||
    typeof plugin.register !== 'function' ||
    typeof plugin.addListener !== 'function'
  ) {
    return null;
  }
  return plugin;
}

/** True when this device can use native FCM/APNs (not Web Push / VAPID). */
export function isNativePushAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  if (getPushNotificationsPlugin()) return true;
  // chravel-mobile shell registers tokens via injected Capacitor plugins or will
  // soon; treat the installed native shell as native-push context for UX routing.
  return isCapacitorNativeShell() || isChravelNativeShell();
}

function normalizePermission(permission: string | undefined): NativePushPermission {
  if (permission === 'granted') return 'granted';
  if (permission === 'denied') return 'denied';
  return 'prompt';
}

export async function checkNativePushPermissions(): Promise<NativePushPermission> {
  const push = getPushNotificationsPlugin();
  if (!push) {
    return isNativePushAvailable() ? 'prompt' : 'denied';
  }

  try {
    const { receive } = await push.checkPermissions();
    return normalizePermission(receive);
  } catch {
    return 'denied';
  }
}

export async function requestNativePushPermissions(): Promise<NativePushPermission> {
  const push = getPushNotificationsPlugin();
  if (!push) {
    return 'denied';
  }

  try {
    const { receive } = await push.requestPermissions();
    return normalizePermission(receive);
  } catch {
    return 'denied';
  }
}

export async function registerNativePushToken(): Promise<NativePushRegistrationResult> {
  const push = getPushNotificationsPlugin();
  if (!push) {
    return {
      token: null,
      error: isNativePushAvailable()
        ? 'Native push plugin not available in this app build'
        : 'Not a native shell',
    };
  }

  return new Promise(resolve => {
    void (async () => {
      let registrationListener: { remove: () => Promise<void> } | null = null;
      let errorListener: { remove: () => Promise<void> } | null = null;

      const cleanup = async () => {
        await registrationListener?.remove().catch(() => {});
        await errorListener?.remove().catch(() => {});
      };

      try {
        registrationListener = await push.addListener('registration', (token: PushTokenEvent) => {
          void cleanup();
          resolve({ token: token.value });
        });

        errorListener = await push.addListener(
          'registrationError',
          (error: PushRegistrationError) => {
            void cleanup();
            resolve({ token: null, error: error.error || 'Registration failed' });
          },
        );

        await push.register();
      } catch (err) {
        await cleanup();
        resolve({
          token: null,
          error: err instanceof Error ? err.message : 'Registration failed',
        });
      }
    })();
  });
}

/**
 * Structured routing data carried on a push payload (mirrors the edge PushPayload:
 * see supabase/functions/send-push/index.ts). Sent as the notification `data` bag so
 * a tap can deep-link straight to the relevant trip resource.
 */
export interface NativePushActionData {
  tripId?: string;
  threadId?: string;
  messageId?: string;
  eventId?: string;
  pollId?: string;
  taskId?: string;
  type?: string;
}

type PushActionPerformedEvent = {
  notification?: { data?: Record<string, unknown> | null };
};

function coerceString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Register a handler invoked when the user TAPS an OS push notification. Returns a
 * disposer that removes the listener. No-op (returns a disposer that does nothing)
 * outside a native shell. The caller receives the normalized routing data bag.
 */
export async function onNativePushActionPerformed(
  handler: (data: NativePushActionData) => void,
): Promise<() => void> {
  const push = getPushNotificationsPlugin();
  if (!push) return () => {};

  let listener: { remove: () => Promise<void> } | null = null;
  try {
    listener = await push.addListener(
      'pushNotificationActionPerformed',
      (payload: PushActionPerformedEvent | unknown) => {
        const raw = (payload as PushActionPerformedEvent)?.notification?.data;
        if (!raw || typeof raw !== 'object') return;
        const data = raw as Record<string, unknown>;
        handler({
          tripId: coerceString(data.tripId) ?? coerceString(data.trip_id),
          threadId: coerceString(data.threadId) ?? coerceString(data.thread_id),
          messageId: coerceString(data.messageId) ?? coerceString(data.message_id),
          eventId: coerceString(data.eventId) ?? coerceString(data.event_id),
          pollId: coerceString(data.pollId) ?? coerceString(data.poll_id),
          taskId: coerceString(data.taskId) ?? coerceString(data.task_id),
          type: coerceString(data.type),
        });
      },
    );
  } catch {
    return () => {};
  }

  return () => {
    void listener?.remove().catch(() => {});
  };
}

export async function unregisterNativePush(): Promise<void> {
  const push = getPushNotificationsPlugin();
  if (!push || typeof push.removeAllListeners !== 'function') return;

  try {
    await push.removeAllListeners();
  } catch {
    // best-effort
  }
}

export function detectNativePushPlatform(): 'ios' | 'android' {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Android/i.test(ua)) return 'android';
  return 'ios';
}
