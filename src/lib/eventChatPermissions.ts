/**
 * Event chat permissions — who can post in event main chat.
 *
 * Product rule (June 2026): event main chat is open for all attendees at any size.
 * Organizers may switch to admin_only explicitly in Event Admin; headcount no longer
 * auto-restricts chat (legacy DB 50-attendee cap removed in migration 20260626120000).
 */

/** @deprecated Legacy marketing threshold; chat is no longer auto-restricted by size. */
export const EVENT_OPEN_CHAT_MAX_ATTENDEES = 50;

/** Product copy for event chat at scale (organizer settings / help surfaces). */
export const EVENT_CHAT_PRODUCT_COPY = {
  default:
    'Event chat is open to all attendees. For very large events, switch to admin-only chat in Event Admin if you prefer announcements-only.',
  adminOnly: 'Only organizers and admins can post in main chat. Attendees can still read messages.',
} as const;

export type ChatMode = 'broadcasts' | 'admin_only' | 'everyone' | null;
export type TripType = 'event' | 'pro' | 'consumer' | string | null;

const ADMIN_ROLES = new Set(['admin', 'organizer', 'owner']);

/** @deprecated Use attendee-based checks only for analytics; not for gating chat mode. */
export function isLargeEvent(tripType: TripType, attendeeCount: number): boolean {
  return tripType === 'event' && attendeeCount > EVENT_OPEN_CHAT_MAX_ATTENDEES;
}

/** Whether organizers can enable "everyone" chat mode — always true (size no longer blocks). */
export function canEnableEveryoneChat(_tripType: TripType, _attendeeCount: number): boolean {
  return true;
}

export function resolveEffectiveMainChatMode(
  chatMode: ChatMode,
  tripType: TripType,
  attendeeCount: number,
  surfaceIsEvent?: boolean,
): Exclude<ChatMode, null> {
  // Product decision: Event main chat is fully open for all attendees.
  if (tripType === 'event' || surfaceIsEvent === true) {
    return 'everyone';
  }

  // Keep null mode permissive to match existing server policy (`chat_mode IS NULL` allows posting).
  const normalizedMode = chatMode ?? 'everyone';

  if (normalizedMode === 'broadcasts') {
    // Consumer/pro shells never show announcements-only lock (product rule).
    if (surfaceIsEvent === false) {
      return 'everyone';
    }
    // Event shell: honor trips.chat_mode even if trip_type is misclassified (wrong row data).
    if (surfaceIsEvent === true) {
      return 'broadcasts';
    }
    // Legacy callers (no surface): non-event DB rows should not stay in broadcasts.
    if (tripType !== 'event') {
      return 'everyone';
    }
    return 'broadcasts';
  }

  if (normalizedMode === 'everyone' && isLargeEvent(tripType, attendeeCount)) {
    return 'admin_only';
  }
  return normalizedMode;
}

export function canPostInMainChat(params: {
  chatMode: ChatMode;
  tripType: TripType;
  attendeeCount: number;
  userRole: string | null;
  isLoading: boolean;
  /** When false, main chat is never announcements-locked (consumer/pro shell). */
  surfaceIsEvent?: boolean;
}): boolean {
  const { chatMode, tripType, attendeeCount, userRole, isLoading, surfaceIsEvent } = params;
  const effectiveMode = resolveEffectiveMainChatMode(
    chatMode,
    tripType,
    attendeeCount,
    surfaceIsEvent,
  );

  if (tripType === 'event' || surfaceIsEvent === true) return true;

  // While chat mode + membership are still fetching, show the composer for trips that
  // resolve to open chat. RLS remains authoritative; this fixes a multi-second blank
  // composer on cold navigation (previously we returned false for all isLoading).
  if (isLoading) {
    return effectiveMode === 'everyone';
  }

  if (effectiveMode === 'everyone') return true;

  return ADMIN_ROLES.has(userRole ?? '');
}
