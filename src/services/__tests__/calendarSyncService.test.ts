import { describe, expect, it } from 'vitest';
import {
  buildImmutableCorrelationId,
  buildRecurringEditSeriesKey,
  buildRsvpUpsertKey,
  formatEventForDisplayInTimezone,
  normalizeEventTimestampToUtc,
  shouldApplySyncEvent,
} from '../calendarSyncService';

describe('calendarSyncService', () => {
  it('creates immutable correlation IDs from external/internal identity tuple', () => {
    expect(
      buildImmutableCorrelationId({
        tripId: 'trip_1',
        provider: 'google',
        externalCalendarId: 'cal_123',
        externalEventId: 'evt_456',
      }),
    ).toBe('trip_1:google:cal_123:evt_456');
  });

  it('is idempotent for duplicate inbound/outbound sync events', () => {
    const shouldApply = shouldApplySyncEvent(
      {
        tripId: 'trip_1',
        idempotencyKey: 'idem_1',
        provider: 'google',
        direction: 'inbound',
        operation: 'update',
        correlationId: 'trip_1:google:cal:event',
        externalUpdatedAt: '2026-03-10T15:00:00Z',
      },
      { idempotencyKey: 'idem_1', externalUpdatedAt: '2026-03-10T15:00:00Z' },
    );

    expect(shouldApply).toBe(false);
  });

  it('normalizes timestamps to UTC and preserves local DST display intent', () => {
    const utc = normalizeEventTimestampToUtc('2026-03-08T01:30:00-05:00');
    expect(utc).toBe('2026-03-08T06:30:00.000Z');

    const ny = formatEventForDisplayInTimezone(utc, 'America/New_York');
    expect(ny).toContain('03/08/2026');
  });

  it('builds stable keys for recurring edit instances and attendee RSVP upserts', () => {
    expect(
      buildRecurringEditSeriesKey({
        tripId: 'trip_1',
        rootExternalEventId: 'series-root',
        recurrenceId: '20260308T130000Z',
      }),
    ).toBe('trip_1:series-root:20260308T130000Z');

    expect(
      buildRsvpUpsertKey({
        tripId: 'trip_1',
        internalEventId: 'internal_1',
        attendeeEmail: 'TeSt@Example.com',
        correlationId: 'trip_1:google:cal:event',
      }),
    ).toBe('trip_1:internal_1:test@example.com:trip_1:google:cal:event');
  });
});
