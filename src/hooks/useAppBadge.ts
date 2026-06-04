import { useEffect } from 'react';
import { useNotificationRealtimeStore } from '@/store/notificationRealtimeStore';

/**
 * Web Badging API surface (PWA / installed home-screen app, iOS 16.4+ Safari,
 * Chromium desktop + Android). Not in the DOM lib typings everywhere, so we
 * narrow it locally rather than casting at every call site.
 */
interface BadgingNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

function getBadgingNavigator(): BadgingNavigator | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & BadgingNavigator;
  return typeof nav.setAppBadge === 'function' ? nav : null;
}

/**
 * Syncs the OS app-icon badge with the global unread notification count.
 *
 * This is the AUTHORITATIVE source: whenever the app is foregrounded (or alive
 * in the background) the badge is reconciled to the true unread count, which
 * self-corrects any drift from the service worker's best-effort increment on
 * background push. No-op on platforms without the Badging API.
 *
 * Mount once near the app root.
 */
export function useAppBadge(): void {
  const unreadCount = useNotificationRealtimeStore(state => state.unreadCount);

  useEffect(() => {
    const nav = getBadgingNavigator();
    if (!nav) return;

    if (unreadCount > 0) {
      void nav.setAppBadge?.(unreadCount).catch(() => {
        // Badging can reject (e.g. permission/feature flag off) — non-fatal.
      });
    } else {
      void nav.clearAppBadge?.().catch(() => {});
    }
  }, [unreadCount]);
}
