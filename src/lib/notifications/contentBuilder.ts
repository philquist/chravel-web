/**
 * Centralized Notification Content Builder
 *
 * Single source of truth for notification copy generation across all channels.
 * Ensures consistent messaging whether delivered via push or email.
 *
 * Guiding principles:
 * - Clear, short, contextual, non-sensitive
 * - Action-driving ("open the app")
 * - No overly detailed payloads (exact addresses, full poll text, etc.)
 * - Include trip/event context (name, location, date range)
 */

import { buildTripContext, formatTripDisplayName } from './formatters';

export type NotificationContentType =
  | 'broadcast_posted'
  | 'calendar_event_added'
  | 'calendar_event_updated'
  | 'calendar_bulk_import'
  | 'payment_request'
  | 'payment_settled'
  | 'task_assigned'
  | 'task_completed'
  | 'poll_created'
  | 'join_request'
  | 'join_request_approved'
  | 'basecamp_updated'
  | 'trip_invite'
  | 'trip_reminder'
  | 'rsvp_update';

export type DeliveryChannel = 'push' | 'email';

export interface TripContext {
  tripName?: string;
  location?: string | string[];
  startDate?: string | Date;
  endDate?: string | Date;
}

export interface NotificationContentInput {
  type: NotificationContentType;
  channel: DeliveryChannel;
  tripContext: TripContext;
  actorName?: string;
  count?: number;
  extra?: Record<string, string | number | undefined>;
}

export interface PushContent {
  title: string;
  body: string;
}

export interface EmailContent {
  subject: string;
  previewText: string;
  heading: string;
  bodyText: string;
  ctaLabel: string;
  ctaUrl: string;
  footerText: string;
}

export type NotificationContent = PushContent | EmailContent;

const FROM_EMAIL = 'support@chravelapp.com';
const FROM_NAME = 'ChravelApp';
const APP_URL = 'https://app.chravelapp.com';
const SETTINGS_URL = 'https://www.chravel.app';
const SETTINGS_CTA_TEXT =
  'Want fewer notifications like this? Log in and update your notification settings.';

export { FROM_EMAIL, FROM_NAME };

function tripLabel(ctx: TripContext): string {
  return formatTripDisplayName(ctx.tripName);
}

/** "your trip" | "your Japan Trip trip" — avoids "your your trip trip". */
function inYourTripPhrase(trip: string): string {
  return trip === 'your trip' ? 'your trip' : `your ${trip} trip`;
}

function contextSuffix(ctx: TripContext): string {
  return buildTripContext(ctx);
}

function ctaUrl(tripId?: string): string {
  if (tripId) return `${APP_URL}/trip/${tripId}`;
  return APP_URL;
}

function footerLine(): string {
  return `You received this because you have notifications enabled on ChravelApp. ${SETTINGS_CTA_TEXT} ${SETTINGS_URL}`;
}

// ---------------------------------------------------------------------------
// Push notification content
// ---------------------------------------------------------------------------
function buildPushContent(input: NotificationContentInput): PushContent {
  const trip = tripLabel(input.tripContext);
  const scoped = inYourTripPhrase(trip);
  const ctx = contextSuffix(input.tripContext);

  // Generic, trip-scoped copy — no actor names, addresses, amounts, or entity text.
  switch (input.type) {
    case 'broadcast_posted':
      return {
        title: `New Broadcast in ${trip}`,
        body: `A new broadcast was posted in ${scoped}${ctx}. Open ChravelApp to review.`,
      };

    case 'calendar_event_added':
      return {
        title: `Calendar Updated in ${trip}`,
        body: `A calendar event was added to ${scoped}${ctx}. Open ChravelApp for details.`,
      };

    case 'calendar_event_updated':
      return {
        title: `Calendar Updated in ${trip}`,
        body: `A calendar event was updated in ${scoped}${ctx}. Open ChravelApp for details.`,
      };

    case 'calendar_bulk_import': {
      const count = input.count ?? 0;
      return {
        title: `${count} New Calendar Events Added`,
        body: `${count} calendar events were added to ${scoped}${ctx}. Added via Smart Import.`,
      };
    }

    case 'payment_request':
      return {
        title: `Payment Request in ${trip}`,
        body: `A new payment request was added to ${scoped}${ctx}. Open ChravelApp to review.`,
      };

    case 'payment_settled':
      return {
        title: `Payment Settled in ${trip}`,
        body: `A payment has been settled in ${scoped}${ctx}. Open ChravelApp for details.`,
      };

    case 'task_assigned':
      return {
        title: `New Task in ${trip}`,
        body: `A new task was added in ${scoped}${ctx}. Open ChravelApp to review.`,
      };

    case 'task_completed':
      return {
        title: `Task Completed in ${trip}`,
        body: `A task has been completed in ${scoped}${ctx}. Open ChravelApp for details.`,
      };

    case 'poll_created':
      return {
        title: `New Poll in ${trip}`,
        body: `A new poll was created in ${scoped}${ctx}. Open ChravelApp to vote.`,
      };

    case 'join_request':
      return {
        title: `Join Request in ${trip}`,
        body: `Someone requested to join ${scoped}${ctx}. Open ChravelApp to review.`,
      };

    case 'join_request_approved':
      return {
        title: `You've Been Approved!`,
        body: `You've been approved to join ${trip}${ctx}. Open ChravelApp to get started.`,
      };

    case 'basecamp_updated':
      return {
        title: `Basecamp Updated in ${trip}`,
        body: `The basecamp was updated in ${scoped}${ctx}. Open ChravelApp for details.`,
      };

    case 'trip_invite':
      return {
        title: `Trip Invitation`,
        body: `You've been invited to ${trip}${ctx}. Open ChravelApp to respond.`,
      };

    case 'trip_reminder':
      return {
        title: `${trip} Starts Soon!`,
        body: `${scoped}${ctx} begins soon. Open ChravelApp to prepare.`,
      };

    case 'rsvp_update':
      return {
        title: `RSVP Update in ${trip}`,
        body: `An RSVP was updated in ${scoped}${ctx}. Open ChravelApp for details.`,
      };

    default:
      return {
        title: `Update in ${trip}`,
        body: `You have an update in ${scoped}${ctx}. Open ChravelApp for details.`,
      };
  }
}

// ---------------------------------------------------------------------------
// Email notification content
// ---------------------------------------------------------------------------
function buildEmailContent(input: NotificationContentInput): EmailContent {
  const push = buildPushContent(input);
  const tripId = input.extra?.tripId as string | undefined;

  return {
    subject: push.title,
    previewText: push.body,
    heading: push.title,
    bodyText: push.body,
    ctaLabel: 'Open in ChravelApp',
    ctaUrl: ctaUrl(tripId),
    footerText: footerLine(),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build notification content for any type/channel combination.
 *
 * Usage:
 *   const content = buildNotificationContent({
 *     type: 'poll_created',
 *     channel: 'push',
 *     tripContext: { tripName: 'Japan Trip', location: ['Tokyo', 'Kyoto'], startDate: '2026-06-10', endDate: '2026-06-25' },
 *     actorName: 'Alex',
 *   });
 */
export function buildNotificationContent(input: NotificationContentInput): NotificationContent {
  switch (input.channel) {
    case 'push':
      return buildPushContent(input);
    case 'email':
      return buildEmailContent(input);
    default:
      return buildPushContent(input);
  }
}

/**
 * Type guard helpers for narrowing content types.
 */
export function isPushContent(content: NotificationContent): content is PushContent {
  return 'title' in content && 'body' in content && !('subject' in content);
}

export function isEmailContent(content: NotificationContent): content is EmailContent {
  return 'subject' in content && 'ctaLabel' in content;
}

/**
 * Convenience: build content for all channels at once.
 */
export function buildAllChannelContent(
  type: NotificationContentType,
  tripContext: TripContext,
  actorName?: string,
  count?: number,
  extra?: Record<string, string | number | undefined>,
): { push: PushContent; email: EmailContent } {
  const base = { type, tripContext, actorName, count, extra };
  return {
    push: buildPushContent({ ...base, channel: 'push' }),
    email: buildEmailContent({ ...base, channel: 'email' }),
  };
}
