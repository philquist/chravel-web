/**
 * App-icon badge hook (PWA / Web Badging API).
 *
 * Mirrors the numeric app-icon badge to the count of the signed-in user's
 * unread, badge-countable notifications (broadcasts, basecamp updates, trip
 * acceptances, and chat messages when that preference is on). See
 * `@/lib/notifications/badgeCategories` for the category definition.
 *
 * Recomputes on mount, when the realtime store's `badgeDirty` tick bumps (a
 * notification was inserted/read/cleared), and whenever the app returns to the
 * foreground (visibilitychange / window focus) — which is also when an installed
 * PWA should reconcile after a background push set the badge.
 *
 * No-ops gracefully where the Badging API is unsupported (e.g. desktop Firefox,
 * non-installed Safari). On iOS, the badge is driven natively via APNs instead.
 */

import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useNotificationRealtimeStore } from '@/store/notificationRealtimeStore';
import { userPreferencesService } from '@/services/userPreferencesService';
import { buildBadgeOrFilter } from '@/lib/notifications/badgeCategories';

const supportsBadge = typeof navigator !== 'undefined' && 'setAppBadge' in navigator;

// `setAppBadge` / `clearAppBadge` are not yet in the shared TS lib DOM typings.
interface BadgeNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

async function applyBadge(count: number): Promise<void> {
  if (!supportsBadge) return;
  const nav = navigator as Navigator & BadgeNavigator;
  try {
    if (count > 0) {
      await nav.setAppBadge?.(count);
    } else {
      await nav.clearAppBadge?.();
    }
  } catch {
    // Badge updates are best-effort; never surface an error to the user.
  }
}

export function useAppBadge(): void {
  const { user } = useAuth();
  const badgeDirty = useNotificationRealtimeStore(state => state.badgeDirty);

  // Monotonic guard: rapid badgeDirty bursts can fire overlapping async refreshes;
  // only the most recently started one is allowed to write the badge, so a slow
  // earlier response can't clobber the icon with a stale count.
  const requestSeqRef = useRef(0);

  const refreshBadge = useCallback(async () => {
    if (!supportsBadge) return;
    const seq = ++requestSeqRef.current;

    if (!user?.id) {
      if (seq === requestSeqRef.current) await applyBadge(0);
      return;
    }

    // Chat messages only badge when the user opted into chat notifications.
    const prefs = await userPreferencesService.getNotificationPreferences(user.id);

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
      .eq('is_visible', true)
      .or(buildBadgeOrFilter(Boolean(prefs.chat_messages)));

    if (error) return;
    // Drop the result if a newer refresh started while we awaited.
    if (seq !== requestSeqRef.current) return;
    await applyBadge(count ?? 0);
  }, [user?.id]);

  // Recompute on mount, user change, and whenever read/insert/clear state moves.
  useEffect(() => {
    void refreshBadge();
  }, [refreshBadge, badgeDirty]);

  // Reconcile when the app returns to the foreground (covers background pushes).
  useEffect(() => {
    if (!supportsBadge) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshBadge();
    };
    const onFocus = () => void refreshBadge();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshBadge]);
}

export default useAppBadge;
