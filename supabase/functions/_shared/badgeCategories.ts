/**
 * App-icon badge category source of truth (edge twin).
 *
 * Computes the per-recipient app-icon badge count that is injected into push
 * payloads (iOS `aps.badge` via FCM `apns`, web-push `data.badgeCount`).
 *
 * The badge counts ONLY: broadcasts, basecamp updates, chat messages (when the
 * recipient enabled `chat_messages`), @mentions, new member joins, and trip
 * acceptance. Trip acceptance is
 * written with `type = 'success'` + `metadata.action = 'join_approved'`, so it
 * MUST be matched on metadata, not type.
 *
 * Keep this file in sync with its frontend twin:
 *   src/lib/notifications/badgeCategories.ts
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import type { NotificationPreferences } from './notificationUtils.ts';

/** Notification `type` values that count toward the app-icon badge. */
export const BADGE_NOTIFICATION_TYPES = [
  'broadcast',
  'chat_message',
  'basecamp',
  'basecamp_update',
  'trip_update',
  // @mentions and new-member joins have dedicated pushable categories and badge too.
  'mention',
  'member_joined',
  // Trip acceptance from the alternate edge writer, which sets type='join_approved'
  // (the canonical RPC sets type='success' + metadata.action — matched separately below).
  'join_approved',
] as const;

/** `metadata.action` marker for an approved join request (trip acceptance). */
export const ACCEPTANCE_ACTION = 'join_approved';

function buildBadgeOrFilter(chatEnabled: boolean): string {
  const types = chatEnabled
    ? BADGE_NOTIFICATION_TYPES
    : BADGE_NOTIFICATION_TYPES.filter(t => t !== 'chat_message');
  return `type.in.(${types.join(',')}),metadata->>action.eq.${ACCEPTANCE_ACTION}`;
}

/**
 * Count the recipient's unread, visible, badge-countable notifications.
 *
 * Returns `null` (NOT 0) on any error so callers can tell "unknown count" apart
 * from "genuinely zero unread". Sending an erroneous 0 would clear the OS icon
 * while unread badge-eligible notifications still exist; callers must omit the
 * badge field on `null` to leave the existing badge untouched.
 */
export async function computeBadgeCount(
  supabase: SupabaseClient,
  userId: string,
  prefs: NotificationPreferences,
): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
      .eq('is_visible', true)
      .or(buildBadgeOrFilter(Boolean(prefs.chat_messages)));

    if (error) {
      console.warn('[badgeCategories] computeBadgeCount failed:', error.message);
      return null;
    }
    return count ?? null;
  } catch (err) {
    console.warn('[badgeCategories] computeBadgeCount threw:', err);
    return null;
  }
}
