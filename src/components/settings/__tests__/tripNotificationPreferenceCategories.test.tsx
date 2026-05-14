import { describe, it, expect } from 'vitest';
import { getTripNotificationPreferenceCategories } from '../tripNotificationPreferenceCategories';

describe('getTripNotificationPreferenceCategories', () => {
  it('includes broadcast/pin and trip chat as the first two rows for consumer shells', () => {
    const rows = getTripNotificationPreferenceCategories({ includeTripInvites: false });
    expect(rows[0]?.label).toBe('Broadcast and pinned messages');
    expect(rows[0]?.dbKey).toBe('broadcasts');
    expect(rows[1]?.label).toBe('Trip chat');
    expect(rows[1]?.dbKey).toBe('chat_messages');
    expect(rows.some(r => r.key === 'tripInvites')).toBe(false);
  });

  it('appends trip invitations for enterprise shells', () => {
    const rows = getTripNotificationPreferenceCategories({ includeTripInvites: true });
    const invites = rows.find(r => r.key === 'tripInvites');
    expect(invites?.label).toBe('Trip Invitations');
    expect(invites?.dbKey).toBe('trip_invites');
  });
});
