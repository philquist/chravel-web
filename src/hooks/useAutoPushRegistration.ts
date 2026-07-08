import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useNativePush } from '@/hooks/useNativePush';
import { useWebPush } from '@/hooks/useWebPush';
import { userPreferencesService } from '@/services/userPreferencesService';
import { hasActiveDeviceToken } from '@/services/pushTokenService';

/**
 * When a user has push_enabled in DB but no device token / web subscription on
 * THIS device, attempt registration once per session after auth hydration.
 *
 * Category toggles alone do not register APNs/FCM — without this, iOS users see
 * all preference switches ON but receive zero push notifications.
 */
export function useAutoPushRegistration(): void {
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const { isNative, isRegistered, registerForPush } = useNativePush();
  const {
    isSupported: isWebPushSupported,
    isSubscribed,
    subscribe: subscribeWebPush,
  } = useWebPush();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!user?.id || isDemoMode) {
      attemptedRef.current = false;
      return;
    }
    if (attemptedRef.current) return;

    let cancelled = false;

    const run = async (): Promise<void> => {
      try {
        const prefs = await userPreferencesService.getNotificationPreferences(user.id);
        if (!prefs.push_enabled || cancelled) return;

        if (isNative) {
          if (isRegistered) return;
          const hasToken = await hasActiveDeviceToken(user.id);
          if (hasToken || cancelled) return;
          attemptedRef.current = true;
          await registerForPush();
          return;
        }

        if (isWebPushSupported && !isSubscribed) {
          attemptedRef.current = true;
          await subscribeWebPush();
        }
      } catch {
        // Best-effort; user can still enable push manually in Settings.
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    isDemoMode,
    isNative,
    isRegistered,
    registerForPush,
    isWebPushSupported,
    isSubscribed,
    subscribeWebPush,
  ]);
}
