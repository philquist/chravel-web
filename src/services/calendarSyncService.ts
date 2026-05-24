export type SyncDirection = 'inbound' | 'outbound';
export type CalendarProvider = 'google' | 'apple' | 'outlook' | 'ics' | 'internal';

export interface EventMappingRecord {
  tripId: string;
  internalEventId: string;
  provider: CalendarProvider;
  externalCalendarId: string;
  externalEventId: string;
  direction: SyncDirection;
  correlationId: string;
}

export interface SyncEventPayload {
  tripId: string;
  idempotencyKey: string;
  provider: CalendarProvider;
  direction: SyncDirection;
  operation: 'create' | 'update' | 'delete' | 'rsvp';
  correlationId: string;
  externalUpdatedAt?: string;
  attendeeEmail?: string;
  attendeeRsvpStatus?: 'accepted' | 'declined' | 'tentative' | 'needs_action';
}

const TRIP_ID_RE = /^[a-zA-Z0-9_-]+$/;

export function buildImmutableCorrelationId(params: {
  tripId: string;
  provider: CalendarProvider;
  externalCalendarId: string;
  externalEventId: string;
}): string {
  const { tripId, provider, externalCalendarId, externalEventId } = params;
  return `${tripId}:${provider}:${externalCalendarId}:${externalEventId}`;
}

export function normalizeEventTimestampToUtc(input: string): string {
  return new Date(input).toISOString();
}

export function formatEventForDisplayInTimezone(utcIso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(utcIso));
}

export function shouldApplySyncEvent(
  incoming: SyncEventPayload,
  existing: Pick<SyncEventPayload, 'idempotencyKey' | 'externalUpdatedAt'> | null,
): boolean {
  if (!TRIP_ID_RE.test(incoming.tripId)) return false;
  if (!incoming.idempotencyKey.trim()) return false;
  if (!existing) return true;
  if (incoming.idempotencyKey === existing.idempotencyKey) return false;
  if (!incoming.externalUpdatedAt || !existing.externalUpdatedAt) return true;
  return Date.parse(incoming.externalUpdatedAt) >= Date.parse(existing.externalUpdatedAt);
}

export function buildRsvpUpsertKey(params: {
  tripId: string;
  internalEventId: string;
  attendeeEmail: string;
  correlationId: string;
}): string {
  const { tripId, internalEventId, attendeeEmail, correlationId } = params;
  return `${tripId}:${internalEventId}:${attendeeEmail.toLowerCase()}:${correlationId}`;
}

export function buildRecurringEditSeriesKey(params: {
  tripId: string;
  rootExternalEventId: string;
  recurrenceId: string;
}): string {
  const { tripId, rootExternalEventId, recurrenceId } = params;
  return `${tripId}:${rootExternalEventId}:${recurrenceId}`;
}
