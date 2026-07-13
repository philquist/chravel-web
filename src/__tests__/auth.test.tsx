import { describe, expect, it } from 'vitest';
import { buildSessionDerivedUser } from '@/lib/sessionDerivedUser';

describe('Authentication', () => {
  it('derives a stable app user from a Supabase session user', () => {
    const user = buildSessionDerivedUser({
      id: 'user-123',
      email: 'traveler@example.com',
      app_metadata: {},
      user_metadata: { display_name: 'Traveler' },
      aud: 'authenticated',
      created_at: '2026-01-01T00:00:00Z',
    });

    expect(user).toMatchObject({
      id: 'user-123',
      email: 'traveler@example.com',
      displayName: 'Traveler',
    });
  });
});
