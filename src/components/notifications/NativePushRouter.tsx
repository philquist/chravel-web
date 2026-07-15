/**
 * NativePushRouter — deep-links OS push-notification taps to the right trip resource.
 *
 * The native shell (Capacitor / chravel-mobile) emits `pushNotificationActionPerformed`
 * when a user taps a delivered push. Without a handler the app just opens to its default
 * screen, losing the routing data the edge functions already put on the payload
 * (see supabase/functions/send-push/index.ts PushPayload: tripId/threadId/eventId/…).
 *
 * This renders nothing; it lives inside <Router> so it can navigate. Trip-type resolution
 * mirrors the in-app notification click handler (consumer /trip, pro /tour/pro, event
 * /event) so a tap lands on the same destination a click would.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  onNativePushActionPerformed,
  isNativePushAvailable,
  type NativePushActionData,
} from '@/lib/nativePushBridge';

/**
 * Map native push payload fields/types to the same trip tabs the in-app Alerts
 * panel uses (see categoryMap + NotificationsDialog). Prefer explicit entity
 * ids, then fall back to notification type aliases.
 */
export function tabForPush(data: NativePushActionData): string | null {
  if (data.eventId || data.type === 'calendar_event' || data.type === 'calendar') return 'calendar';
  if (data.pollId || data.type === 'poll_update' || data.type === 'poll') return 'polls';
  if (data.taskId || data.type === 'task_update' || data.type === 'task') return 'tasks';
  if (data.threadId || data.messageId || data.type === 'chat' || data.type === 'mention') {
    return 'chat';
  }

  const type = String(data.type || '').toLowerCase();
  if (type === 'broadcast' || type === 'broadcast_posted') return 'broadcasts';
  if (type === 'pin' || type === 'pin_announcement') return 'chat';
  if (type === 'payment' || type === 'payment_request') return 'payments';
  if (type === 'basecamp' || type === 'basecamp_updates' || type === 'trip_update') return 'places';
  if (
    type === 'join_request' ||
    type === 'member_joined' ||
    type === 'join_approved' ||
    type === 'join_rejected'
  ) {
    return 'collaborators';
  }

  return null;
}

async function resolveBaseRoute(tripId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('trips')
      .select('trip_type')
      .eq('id', tripId)
      .maybeSingle();
    const tripType = String((data?.trip_type as string) || '').toLowerCase();
    if (tripType === 'pro') return `/tour/pro/${tripId}`;
    if (tripType === 'event') return `/event/${tripId}`;
  } catch {
    // Fall through to the consumer route — a wrong-tab landing is far better than
    // swallowing the tap. TripDetail resolves membership/access on its own.
  }
  return `/trip/${tripId}`;
}

export function NativePushRouter(): null {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativePushAvailable()) return;

    let disposed = false;
    let dispose: (() => void) | null = null;

    void (async () => {
      const remove = await onNativePushActionPerformed(data => {
        if (!data.tripId) return;
        void (async () => {
          const baseRoute = await resolveBaseRoute(data.tripId as string);
          const tab = tabForPush(data);
          const path = tab ? `${baseRoute}?tab=${tab}` : baseRoute;
          const state =
            data.threadId || data.messageId
              ? {
                  chatNavigationContext: {
                    source: 'push',
                    ...(data.messageId && { messageId: data.messageId }),
                    ...(data.threadId && { openThreadId: data.threadId }),
                  },
                }
              : undefined;
          navigate(path, state ? { state } : undefined);
        })();
      });
      if (disposed) {
        remove();
      } else {
        dispose = remove;
      }
    })();

    return () => {
      disposed = true;
      dispose?.();
    };
  }, [navigate]);

  return null;
}
