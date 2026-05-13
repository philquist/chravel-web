import { describe, it, expect } from 'vitest';
import {
  gmailAcceptedCandidatesToSmartParseResult,
  reservationDataToCalendarEvent,
} from '../gmailReservationsToCalendarParseResult';
import type { SmartImportCandidate } from '@/features/smart-import/types';

describe('gmailReservationsToCalendarParseResult', () => {
  it('maps a flight reservation with local times to a calendar event', () => {
    const data = {
      type: 'flight' as const,
      airline_name: 'Delta',
      flight_number: 'DL123',
      departure_time_local: '2026-07-10T08:00:00',
      arrival_time_local: '2026-07-10T11:30:00',
      departure_airport_code: 'LAX',
      arrival_airport_code: 'SEA',
      confirmation_code: 'ABC123',
      _gmail_message_id: 'msg-1',
    };
    const mapped = reservationDataToCalendarEvent(data, 'cand-1');
    expect(mapped).not.toBeNull();
    expect(mapped!.event.title).toContain('Delta');
    expect(mapped!.event.isAllDay).toBe(false);
    expect(mapped!.meta.eventCategory).toBe('transportation');
  });

  it('builds a SmartParseResult from accepted Gmail candidates', () => {
    const candidates: SmartImportCandidate[] = [
      {
        id: 'a1',
        reservation_data: {
          type: 'restaurant_reservation',
          restaurant_name: 'Test Bistro',
          reservation_time_local: '2026-08-01T19:00:00',
          city: 'Austin',
          confirmation_code: 'R1',
          _gmail_message_id: 'm1',
        },
      },
    ];
    const result = gmailAcceptedCandidatesToSmartParseResult(candidates);
    expect(result.isValid).toBe(true);
    expect(result.sourceFormat).toBe('gmail');
    expect(result.events).toHaveLength(1);
    expect(result.eventMeta?.[0]?.eventCategory).toBe('dining');
  });

  it('returns invalid when no parseable times exist', () => {
    const candidates: SmartImportCandidate[] = [
      {
        id: 'a2',
        reservation_data: {
          type: 'flight' as const,
          airline_name: 'NoTimes',
          _gmail_message_id: 'm2',
        },
      },
    ];
    const result = gmailAcceptedCandidatesToSmartParseResult(candidates);
    expect(result.isValid).toBe(false);
    expect(result.events).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
