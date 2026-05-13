import type { CalendarCategory } from '@/constants/calendarCategories';
import type { ReservationData, SmartImportCandidate } from '@/features/smart-import/types';
import type { ICSParsedEvent } from '@/utils/calendarImport';
import type { SmartParseResult } from '@/utils/calendarImportParsers';

/** Per-event calendar metadata aligned with `SmartParseResult.events` indices */
export type GmailCalendarEventMeta = {
  eventCategory: CalendarCategory;
};

function parseLocalDateTime(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 3600000);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function reservationCategory(data: ReservationData): CalendarCategory {
  switch (data.type) {
    case 'flight':
    case 'ground_transport':
    case 'rail_bus_ferry':
      return 'transportation';
    case 'lodging':
      return 'lodging';
    case 'restaurant_reservation':
      return 'dining';
    case 'event_ticket':
    case 'sports_ticket':
      return 'entertainment';
    case 'conference_registration':
      return 'activity';
    default:
      return 'other';
  }
}

/**
 * Maps a single Gmail extraction payload to a calendar event when a usable start time exists.
 * Returns null when times cannot be inferred (caller should skip or warn).
 */
export function reservationDataToCalendarEvent(
  data: ReservationData,
  candidateId: string,
): { event: ICSParsedEvent; meta: GmailCalendarEventMeta } | null {
  if (!data || data.is_cancellation === true) return null;

  const cat = reservationCategory(data);
  const uidBase = typeof data._gmail_message_id === 'string' ? data._gmail_message_id : candidateId;
  const suffix = typeof data.confirmation_code === 'string' ? data.confirmation_code : data.type;
  const uid = `gmail:${uidBase}:${suffix}`;

  const build = (
    title: string,
    start: Date,
    end: Date,
    isAllDay: boolean,
    location?: string,
    description?: string,
  ): { event: ICSParsedEvent; meta: GmailCalendarEventMeta } => ({
    event: {
      uid,
      title: title.slice(0, 500),
      startTime: start,
      endTime: end,
      location,
      description,
      isAllDay,
    },
    meta: { eventCategory: cat },
  });

  switch (data.type) {
    case 'flight': {
      const start =
        parseLocalDateTime(data.departure_time_local) ||
        parseLocalDateTime(data.arrival_time_local);
      if (!start) return null;
      const end =
        parseLocalDateTime(data.arrival_time_local) ||
        addHours(parseLocalDateTime(data.departure_time_local) || start, 2);
      const parts = [
        data.airline_name,
        data.flight_number ? `(${data.flight_number})` : '',
        [
          data.departure_airport_code || data.departure_city,
          data.arrival_airport_code || data.arrival_city,
        ]
          .filter(Boolean)
          .join(' → '),
      ]
        .filter(Boolean)
        .join(' ');
      const title = parts.trim() || 'Flight';
      const loc = [data.departure_city, data.arrival_city].filter(Boolean).join(' → ');
      const desc = data.confirmation_code ? `Confirmation: ${data.confirmation_code}` : undefined;
      return build(
        title,
        start,
        end <= start ? addHours(start, 2) : end,
        false,
        loc || undefined,
        desc,
      );
    }
    case 'lodging': {
      const checkIn =
        parseLocalDateTime(data.check_in_local) || parseLocalDateTime(data.check_out_local);
      if (!checkIn) return null;
      const checkOut = parseLocalDateTime(data.check_out_local);
      const title = (data.property_name as string) || 'Lodging';
      const loc = [data.address, data.city].filter(Boolean).join(', ') || undefined;
      const desc = data.confirmation_code ? `Confirmation: ${data.confirmation_code}` : undefined;
      if (checkOut && checkOut > checkIn) {
        const endExclusive = addDays(checkOut, 1);
        return build(title, checkIn, endExclusive, true, loc, desc);
      }
      const endOfDay = new Date(checkIn);
      endOfDay.setHours(23, 59, 59, 999);
      return build(title, checkIn, endOfDay, true, loc, desc);
    }
    case 'ground_transport': {
      const start =
        parseLocalDateTime(data.pickup_time_local) || parseLocalDateTime(data.dropoff_time_local);
      if (!start) return null;
      const end =
        parseLocalDateTime(data.dropoff_time_local) ||
        addHours(parseLocalDateTime(data.pickup_time_local) || start, 1);
      const title =
        [data.provider_name, data.vehicle_type].filter(Boolean).join(' — ') || 'Ground transport';
      const loc =
        [data.pickup_location, data.dropoff_location].filter(Boolean).join(' → ') || undefined;
      return build(title, start, end <= start ? addHours(start, 1) : end, false, loc);
    }
    case 'event_ticket':
    case 'sports_ticket': {
      const start = parseLocalDateTime(data.start_time_local);
      if (!start) return null;
      const end =
        parseLocalDateTime(data.end_time_local) ||
        addHours(start, data.type === 'sports_ticket' ? 4 : 3);
      const title = (data.event_name as string) || 'Event';
      const loc =
        [data.venue_name, data.venue_address, data.city].filter(Boolean).join(' · ') || undefined;
      return build(title, start, end <= start ? addHours(start, 2) : end, false, loc);
    }
    case 'restaurant_reservation': {
      const start = parseLocalDateTime(data.reservation_time_local);
      if (!start) return null;
      const end = addHours(start, 2);
      const title = (data.restaurant_name as string) || 'Restaurant reservation';
      const loc = (data.city as string) || undefined;
      return build(title, start, end, false, loc);
    }
    case 'rail_bus_ferry': {
      const start =
        parseLocalDateTime(data.departure_time_local) ||
        parseLocalDateTime(data.arrival_time_local);
      if (!start) return null;
      const end =
        parseLocalDateTime(data.arrival_time_local) ||
        addHours(parseLocalDateTime(data.departure_time_local) || start, 2);
      const title =
        [data.provider_name, data.mode].filter(Boolean).join(' — ') || 'Rail / bus / ferry';
      const loc =
        [data.departure_location, data.arrival_location].filter(Boolean).join(' → ') || undefined;
      return build(title, start, end <= start ? addHours(start, 2) : end, false, loc);
    }
    case 'conference_registration': {
      const start = parseLocalDateTime(data.start_time_local);
      if (!start) return null;
      const end = parseLocalDateTime(data.end_time_local) || addHours(start, 8);
      const title = (data.event_name as string) || 'Conference';
      const loc = [data.venue_name, data.city].filter(Boolean).join(' · ') || undefined;
      return build(title, start, end <= start ? addHours(start, 4) : end, false, loc);
    }
    case 'generic_itinerary_item':
    default: {
      const start = parseLocalDateTime(data.start_time_local);
      if (!start) return null;
      const end = parseLocalDateTime(data.end_time_local) || addHours(start, 1);
      const title =
        (data.item_label as string) || (data.provider_name as string) || 'Itinerary item';
      const loc = (data.location as string) || undefined;
      return build(title, start, end <= start ? addHours(start, 1) : end, false, loc);
    }
  }
}

/**
 * Converts accepted Gmail smart-import rows into the same shape used by CalendarImportModal
 * (ICS-style events + optional per-row category metadata).
 */
export function gmailAcceptedCandidatesToSmartParseResult(
  candidates: SmartImportCandidate[],
): SmartParseResult {
  const events: ICSParsedEvent[] = [];
  const eventMeta: GmailCalendarEventMeta[] = [];
  const errors: string[] = [];

  for (const c of candidates) {
    const data = c.reservation_data;
    if (!data) continue;
    const mapped = reservationDataToCalendarEvent(data, c.id);
    if (!mapped) {
      errors.push(
        `Skipped "${data.type ?? 'item'}": no parseable date/time (confirmation ${
          data.confirmation_code ?? 'n/a'
        })`,
      );
      continue;
    }
    events.push(mapped.event);
    eventMeta.push(mapped.meta);
  }

  return {
    events,
    errors,
    isValid: events.length > 0,
    sourceFormat: 'gmail',
    confidenceScores: events.map(() => 0.82),
    eventMeta,
  };
}
