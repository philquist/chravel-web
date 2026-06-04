import { useCallback } from 'react';
import { useNativePush } from '@/hooks/useNativePush';
import { useWebPush } from '@/hooks/useWebPush';

export type PushToggleResult = 'ok' | 'permission_denied' | 'unsupported' | 'error';

/**
 * Single source of truth for turning push notifications on/off from settings.
 *
 * Encapsulates the native-vs-web branching so the consumer/enterprise/event
 * notification sections don't each re-implement it:
 *  - Native shell (Capacitor/Expo): register/unregister for push (device token).
 *  - Web/PWA: request permission + create/remove a web_push_subscriptions row
 *    via the Web Push (VAPID) flow.
 *
 * Returns a coarse result so callers can show the right toast and decide whether
 * to persist the preference:
 *  - 'ok'                → enabled/disabled successfully; persist the preference.
 *  - 'permission_denied' → user/OS blocked notifications; do NOT persist enabled.
 *  - 'unsupported'       → platform has no push transport; persist the preference
 *                          (it's recorded, just not deliverable on this device).
 *  - 'error'             → unexpected failure; do NOT persist.
 */
export function usePushPreferenceToggle() {
  const { isNative, registerForPush, unregisterFromPush } = useNativePush();
  const {
    isSupported: isWebPushSupported,
    subscribe: subscribeWebPush,
    unsubscribe: unsubscribeWebPush,
  } = useWebPush();

  const applyPushEnabled = useCallback(
    async (enabled: boolean): Promise<PushToggleResult> => {
      try {
        if (isNative) {
          if (enabled) {
            const token = await registerForPush();
            return token ? 'ok' : 'permission_denied';
          }
          await unregisterFromPush();
          return 'ok';
        }

        if (isWebPushSupported) {
          if (enabled) {
            const ok = await subscribeWebPush();
            return ok ? 'ok' : 'permission_denied';
          }
          await unsubscribeWebPush();
          return 'ok';
        }

        // No push transport on this platform (e.g. non-installed iOS Safari).
        return 'unsupported';
      } catch {
        return 'error';
      }
    },
    [
      isNative,
      registerForPush,
      unregisterFromPush,
      isWebPushSupported,
      subscribeWebPush,
      unsubscribeWebPush,
    ],
  );

  return { applyPushEnabled };
}
