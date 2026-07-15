import { describe, expect, it } from 'vitest';
import { mapRowToNotification } from '../useNotificationRealtime';

describe('mapRowToNotification', () => {
  it('falls back to notifications.trip_id when metadata.trip_id is missing', () => {
    const mapped = mapRowToNotification({
      id: 'notif-1',
      type: 'info',
      title: 'Join Request Approved',
      message: 'Your request to join "MLB All Star Weekend" has been approved!',
      is_read: false,
      metadata: { trip_name: 'MLB All Star Weekend', action: 'join_approved' },
      trip_id: 'trip-from-column',
      created_at: '2026-03-19T12:00:00.000Z',
    });

    expect(mapped).not.toBeNull();
    expect(mapped!.tripId).toBe('trip-from-column');
    expect(mapped!.tripName).toBe('MLB All Star Weekend');
    expect(mapped!.title).toBe("You've been approved");
    expect(mapped!.description).toBe(
      "You've been approved to join your MLB All Star Weekend trip.",
    );
  });

  it('normalizes legacy basecamp rows that stored an address in the body', () => {
    const mapped = mapRowToNotification({
      id: 'notif-basecamp',
      type: 'basecamp',
      title: 'Basecamp updated',
      message: '123 Main St',
      is_read: false,
      metadata: { trip_id: 'trip-bc', trip_name: 'Austin Weekend', tab: 'places' },
      trip_id: 'trip-bc',
      created_at: '2026-03-19T12:00:00.000Z',
    });

    expect(mapped).not.toBeNull();
    expect(mapped!.title).toBe('Basecamp updated in Austin Weekend');
    expect(mapped!.description).toBe('The basecamp was updated in your Austin Weekend trip.');
    expect(mapped!.description).not.toContain('123 Main');
  });

  it('prefers metadata.trip_id when both metadata and column are present', () => {
    const mapped = mapRowToNotification({
      id: 'notif-2',
      type: 'info',
      title: 'Join Request Approved',
      message: 'Approved',
      is_read: false,
      metadata: { trip_id: 'trip-from-metadata' },
      trip_id: 'trip-from-column',
      created_at: '2026-03-19T12:00:00.000Z',
    });

    expect(mapped).not.toBeNull();
    expect(mapped.tripId).toBe('trip-from-metadata');
  });

  it('returns null for malformed rows', () => {
    const mapped = mapRowToNotification({ id: 'notif-bad' });
    expect(mapped).toBeNull();
  });
});
