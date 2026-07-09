/**
 * App-icon badge category source of truth (frontend twin).
 *
 * The numeric app-icon badge (Web Badging API on PWA, aps.badge on iOS) counts
 * ONLY these notification kinds — NOT polls/tasks/calendar/payments:
 *   - new broadcasts
 *   - new basecamp updates
 *   - new chat messages (ONLY when the user's `chat_messages` pref is on)
 *   - @mentions (dedicated pushable `mention` category)
 *   - new member joins (`member_joined`)
 *   - trip acceptance ("you were accepted on a trip you requested")
 *
 * Trip acceptance is the subtle one: the `approve_join_request` RPC writes the
 * notification row with the generic `type = 'success'` and `metadata.action =
 * 'join_approved'`, so it MUST be matched on metadata — a `type IN (...)` filter
 * alone would silently miss acceptances.
 *
 * Keep this file in sync with its edge twin:
 *   supabase/functions/_shared/badgeCategories.ts
 */

import { parseNotificationMetadata } from '@/lib/notifications/navigation';

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

// Types that always badge (chat is handled separately because it is pref-gated).
const ALWAYS_BADGE_TYPES: Set<string> = new Set(
  BADGE_NOTIFICATION_TYPES.filter(t => t !== 'chat_message'),
);

/**
 * Build the PostgREST `.or(...)` filter string for the badge count query.
 * `chat_message` is only included when the user enabled chat notifications.
 */
export function buildBadgeOrFilter(chatEnabled: boolean): string {
  const types = chatEnabled
    ? BADGE_NOTIFICATION_TYPES
    : BADGE_NOTIFICATION_TYPES.filter(t => t !== 'chat_message');
  return `type.in.(${types.join(',')}),metadata->>action.eq.${ACCEPTANCE_ACTION}`;
}

/**
 * Whether a single notification row should increment the app-icon badge.
 * Used to decide when realtime inserts should trigger a badge recompute.
 */
export function isBadgeCountable(
  row: { type?: string | null; metadata?: unknown },
  prefs: { chat_messages: boolean },
): boolean {
  const metadata = parseNotificationMetadata(row.metadata);
  if (metadata.action === ACCEPTANCE_ACTION) return true;

  const type = row.type ?? '';
  if (type === 'chat_message') return prefs.chat_messages;
  return ALWAYS_BADGE_TYPES.has(type);
}
