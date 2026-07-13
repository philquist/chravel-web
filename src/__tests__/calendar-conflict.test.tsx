import { describe, expect, it } from 'vitest';

interface EventWindow {
  id: string;
  title: string;
  start_time: string;
  end_time?: string;
}

function findConflicts(
  events: EventWindow[],
  startTime: string,
  endTime?: string,
  excludeId?: string,
) {
  const newStart = new Date(startTime).getTime();
  const newEnd = endTime ? new Date(endTime).getTime() : newStart + 60 * 60 * 1000;
  return events
    .filter(event => event.id !== excludeId)
    .filter(event => {
      const eventStart = new Date(event.start_time).getTime();
      const eventEnd = event.end_time
        ? new Date(event.end_time).getTime()
        : eventStart + 60 * 60 * 1000;
      return newStart < eventEnd && newEnd > eventStart;
    })
    .map(event => event.title);
}

describe('Calendar Event → Conflict Detection', () => {
  const existing = [
    {
      id: 'flight',
      title: 'Flight',
      start_time: '2026-01-10T10:00:00Z',
      end_time: '2026-01-10T12:00:00Z',
    },
  ];

  it('flags overlapping event windows', () => {
    expect(findConflicts(existing, '2026-01-10T11:30:00Z', '2026-01-10T13:00:00Z')).toEqual([
      'Flight',
    ]);
  });

  it('allows adjacent event windows and excludes the edited event', () => {
    expect(findConflicts(existing, '2026-01-10T12:00:00Z', '2026-01-10T13:00:00Z')).toEqual([]);
    expect(
      findConflicts(existing, '2026-01-10T10:30:00Z', '2026-01-10T11:30:00Z', 'flight'),
    ).toEqual([]);
  });
});
