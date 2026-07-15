/**
 * In-app Alerts copy — generic, trip-scoped, non-sensitive.
 *
 * Settings toggles fan out into `notifications` rows that the Alerts panel
 * renders. Prefer trip-name context over actor names, street addresses,
 * payment amounts, or poll/task question text.
 */

export interface AlertCopyInput {
  type: string;
  title: string;
  message: string;
  tripName?: string | null;
  /** Optional metadata fields that refine copy (e.g. action, approved). */
  metadata?: Record<string, unknown>;
}

export interface AlertCopy {
  title: string;
  description: string;
}

function tripLabel(tripName?: string | null): string {
  const trimmed = typeof tripName === 'string' ? tripName.trim() : '';
  return trimmed || 'your trip';
}

function inYourTrip(tripName?: string | null): string {
  const label = tripLabel(tripName);
  return label === 'your trip' ? 'your trip' : `your ${label} trip`;
}

function metaString(metadata: Record<string, unknown> | undefined, key: string): string {
  const value = metadata?.[key];
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function isJoinApproved(input: AlertCopyInput): boolean {
  const type = input.type.toLowerCase();
  const action = metaString(input.metadata, 'action');
  const title = input.title.toLowerCase();
  return (
    action === 'join_approved' ||
    type === 'join_approved' ||
    type === 'join_request_approved' ||
    title.includes('join request approved') ||
    title.includes("you've been approved")
  );
}

function isJoinRejected(input: AlertCopyInput): boolean {
  const type = input.type.toLowerCase();
  const action = metaString(input.metadata, 'action');
  const title = input.title.toLowerCase();
  return (
    action === 'join_rejected' ||
    type === 'join_rejected' ||
    type === 'join_request_rejected' ||
    title.includes('join request update') ||
    title.includes('was not approved')
  );
}

function isBasecampAdded(input: AlertCopyInput): boolean {
  return input.title.toLowerCase().includes('added');
}

/**
 * Normalize notification title/body for the Alerts panel.
 * Unrecognized types (e.g. chat snippets, mentions) pass through unchanged.
 */
export function formatInAppAlertCopy(input: AlertCopyInput): AlertCopy {
  const type = input.type.toLowerCase();
  const trip = tripLabel(input.tripName);
  const scoped = inYourTrip(input.tripName);

  if (isJoinApproved(input)) {
    return {
      title: `You've been approved`,
      description: `You've been approved to join ${scoped}.`,
    };
  }

  if (isJoinRejected(input)) {
    return {
      title: `Join request update`,
      description: `Your request to join ${scoped} was not approved at this time.`,
    };
  }

  switch (type) {
    case 'broadcast':
    case 'broadcasts':
    case 'broadcast_posted':
      return {
        title: `New broadcast in ${trip}`,
        description: `A new broadcast was posted in ${scoped}.`,
      };

    case 'pin':
    case 'pin_announcement':
      return {
        title: `Message pinned in ${trip}`,
        description: `A message was pinned in ${scoped}.`,
      };

    case 'poll':
    case 'polls':
    case 'poll_created':
    case 'poll_vote':
      return {
        title: `New poll in ${trip}`,
        description: `A new poll was created in ${scoped}.`,
      };

    case 'task':
    case 'tasks':
    case 'task_assigned': {
      const isAssigned = type === 'task_assigned' || input.title.toLowerCase().includes('assigned');
      if (isAssigned) {
        return {
          title: `Task assigned in ${trip}`,
          description: `A task was assigned in ${scoped}.`,
        };
      }
      return {
        title: `New task in ${trip}`,
        description: `A new task was added in ${scoped}.`,
      };
    }

    case 'calendar':
    case 'calendar_events':
    case 'calendar_reminder':
    case 'event':
    case 'itinerary_update':
      return {
        title: `New calendar event in ${trip}`,
        description: `A calendar event was added to ${scoped}.`,
      };

    case 'payment':
    case 'payments':
    case 'payment_request':
    case 'payment_split':
    case 'payment_alert':
      return {
        title: `New payment request in ${trip}`,
        description: `A new payment request was added to ${scoped}.`,
      };

    case 'basecamp':
    case 'basecamp_updates':
    case 'trip_update':
      if (isBasecampAdded(input)) {
        return {
          title: `Basecamp added in ${trip}`,
          description: `A basecamp was added to ${scoped}.`,
        };
      }
      return {
        title: `Basecamp updated in ${trip}`,
        description: `The basecamp was updated in ${scoped}.`,
      };

    case 'join_request':
    case 'join_requests':
      return {
        title: `Join request in ${trip}`,
        description: `Someone requested to join ${scoped}.`,
      };

    case 'member_joined':
      return {
        title: `New member in ${trip}`,
        description: `Someone joined ${scoped}.`,
      };

    case 'invite':
    case 'trip_invite':
    case 'trip_invites':
      return {
        title: `Trip invitation`,
        description: `You've been invited to ${scoped}.`,
      };

    default:
      return {
        title: input.title,
        description: input.message,
      };
  }
}
