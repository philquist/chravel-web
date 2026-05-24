import type { CalendarEvent } from '@/types/calendar';
import { brandEventTitleForIcs } from '@/utils/icsBranding';

/**
 * Calendar Sync Service
 *
 * ICS generation for API/email use cases. For user-facing ICS export,
 * use `useCalendarExport` hook (which delegates to `@/utils/calendarExport`).
 */

export interface ICalEvent {
  uid: string;
  dtstart: Date;
  dtend?: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  rrule?: string;
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  isAllDay?: boolean;
}

/**
 * Convert CalendarEvent to iCal format
 */
function eventToICal(event: CalendarEvent): ICalEvent {
  let startDate: Date;
  let endDate: Date | undefined;

  if (event.is_all_day) {
    // event.date is UTC midnight after the timezone fix — use UTC components directly.
    const d = event.date;
    startDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const endSrc = event.end_date ?? event.date;
    // ICS all-day DTEND is the exclusive next day per RFC 5545
    endDate = new Date(
      Date.UTC(endSrc.getUTCFullYear(), endSrc.getUTCMonth(), endSrc.getUTCDate() + 1),
    );
  } else {
    startDate = new Date(event.date);
    const [hours, minutes] = event.time.split(':');
    startDate.setHours(parseInt(hours, 10), parseInt(minutes, 10));

    if (event.end_time) {
      endDate = event.end_time;
    } else if (event.time) {
      endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 1);
    }
  }

  const status =
    event.availability_status === 'tentative'
      ? 'TENTATIVE'
      : event.availability_status === 'free'
        ? 'TENTATIVE'
        : 'CONFIRMED';

  return {
    uid: `chravel-${event.id}@chravel.app`,
    dtstart: startDate,
    dtend: endDate,
    summary: brandEventTitleForIcs(event.title),
    description: event.description || '',
    location: event.location || '',
    rrule: event.recurrence_rule,
    status,
    isAllDay: event.is_all_day ?? false,
  };
}

/**
 * Escape special characters in iCal text fields
 */
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/**
 * Generate iCal file content from CalendarEvents
 */
function generateICalContent(events: CalendarEvent[], tripName: string): string {
  const now = new Date();
  const formattedNow = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  let ical = `BEGIN:VCALENDAR\r\n`;
  ical += `VERSION:2.0\r\n`;
  ical += `PRODID:-//Chravel//Trip Calendar//EN\r\n`;
  ical += `CALSCALE:GREGORIAN\r\n`;
  ical += `METHOD:PUBLISH\r\n`;
  ical += `X-WR-CALNAME:${tripName}\r\n`;
  ical += `X-WR-TIMEZONE:UTC\r\n`;

  events.forEach(event => {
    const icalEvent = eventToICal(event);
    ical += `BEGIN:VEVENT\r\n`;
    ical += `UID:${icalEvent.uid}\r\n`;
    ical += `DTSTAMP:${formattedNow}\r\n`;

    if (icalEvent.isAllDay) {
      const dateOnly = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
      ical += `DTSTART;VALUE=DATE:${dateOnly(icalEvent.dtstart)}\r\n`;
      if (icalEvent.dtend) {
        ical += `DTEND;VALUE=DATE:${dateOnly(icalEvent.dtend)}\r\n`;
      }
    } else {
      const dtstart = icalEvent.dtstart.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      ical += `DTSTART:${dtstart}\r\n`;
      if (icalEvent.dtend) {
        const dtend = icalEvent.dtend.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        ical += `DTEND:${dtend}\r\n`;
      }
    }

    ical += `SUMMARY:${escapeICalText(icalEvent.summary)}\r\n`;

    if (icalEvent.description) {
      ical += `DESCRIPTION:${escapeICalText(icalEvent.description)}\r\n`;
    }

    if (icalEvent.location) {
      ical += `LOCATION:${escapeICalText(icalEvent.location)}\r\n`;
    }

    if (icalEvent.rrule) {
      ical += `RRULE:${icalEvent.rrule}\r\n`;
    }

    if (icalEvent.status) {
      ical += `STATUS:${icalEvent.status}\r\n`;
    }

    ical += `END:VEVENT\r\n`;
  });

  ical += `END:VCALENDAR\r\n`;
  return ical;
}

/**
 * Generate iCal content as string (for API/email use cases)
 */
export function generateICalString(events: CalendarEvent[], tripName: string): string {
  return generateICalContent(events, tripName);
}

/**
 * Parse RRULE string to human-readable format
 */
export function parseRRule(rrule: string): string {
  if (!rrule) return '';

  const parts = rrule.split(';');
  const freq = parts
    .find(p => p.startsWith('FREQ='))
    ?.split('=')[1]
    ?.toLowerCase();
  const interval = parts.find(p => p.startsWith('INTERVAL='))?.split('=')[1];
  const count = parts.find(p => p.startsWith('COUNT='))?.split('=')[1];
  const until = parts.find(p => p.startsWith('UNTIL='))?.split('=')[1];

  if (!freq) return rrule;

  let description = '';

  switch (freq) {
    case 'daily':
      description = interval && interval !== '1' ? `Every ${interval} days` : 'Daily';
      break;
    case 'weekly':
      description = interval && interval !== '1' ? `Every ${interval} weeks` : 'Weekly';
      break;
    case 'monthly':
      description = interval && interval !== '1' ? `Every ${interval} months` : 'Monthly';
      break;
    case 'yearly':
      description = interval && interval !== '1' ? `Every ${interval} years` : 'Yearly';
      break;
    default:
      return rrule;
  }

  if (count) {
    description += ` (${count} occurrences)`;
  } else if (until) {
    const untilDate = new Date(until);
    description += ` until ${untilDate.toLocaleDateString()}`;
  }

  return description;
}
