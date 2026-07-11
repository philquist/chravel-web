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

function tabForPush(data: NativePushActionData): string | null {
  if (data.eventId || data.type === 'calendar_event') return 'calendar';
  if (data.pollId || data.type === 'poll_update') return 'polls';
  if (data.taskId || data.type === 'task_update') return 'tasks';
  if (data.threadId || data.messageId) return 'chat';
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
