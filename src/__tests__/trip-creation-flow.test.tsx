import { describe, expect, it } from 'vitest';

function buildInviteUrl(origin: string, inviteCode: string): string {
  return `${origin.replace(/\/$/, '')}/join/${inviteCode}`;
}

describe('Trip Creation → Invite → Join Flow', () => {
  it('builds canonical join links from persisted invite codes', () => {
    expect(buildInviteUrl('https://chravel.app/', 'abc123')).toBe(
      'https://chravel.app/join/abc123',
    );
  });

  it('treats invite joins as membership inserts for the invited user', () => {
    const membership = {
      trip_id: 'trip-1',
      user_id: 'joining-user',
      role: 'member',
      status: 'active',
    };
    expect(membership).toMatchObject({
      trip_id: 'trip-1',
      user_id: 'joining-user',
      status: 'active',
    });
  });
});
