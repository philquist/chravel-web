import { describe, expect, it } from 'vitest';

import { getConciergeInvalidationKeys, isConciergeWriteAction } from '../conciergeInvalidation';

describe('conciergeInvalidation', () => {
  it('returns trip-scoped query keys for standard write actions', () => {
    expect(getConciergeInvalidationKeys('createTask', 'trip-123')[0]).toEqual([
      'tripTasks',
      'trip-123',
    ]);
    expect(getConciergeInvalidationKeys('createPoll', 'trip-123')[0]).toEqual([
      'tripPolls',
      'trip-123',
    ]);
    expect(getConciergeInvalidationKeys('addToCalendar', 'trip-123')[0]).toEqual([
      'calendarEvents',
      'trip-123',
    ]);
  });

  it('invalidates the shared trips cache for setTripHeaderImage', () => {
    expect(getConciergeInvalidationKeys('setTripHeaderImage', 'trip-123')[0]).toEqual(['trips']);
  });

  it('identifies concierge write tools correctly', () => {
    expect(isConciergeWriteAction('setTripHeaderImage')).toBe(true);
    expect(isConciergeWriteAction('searchPlaces')).toBe(false);
  });

  it('returns no invalidation keys for tools with no mapping', () => {
    expect(getConciergeInvalidationKeys('searchPlaces', 'trip-123')).toHaveLength(0);
  });
});
