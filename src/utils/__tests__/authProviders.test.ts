import { describe, expect, it } from 'vitest';
import type { Session, User } from '@supabase/supabase-js';
import { getAuthProviders, userHasEmailPasswordIdentity } from '../authProviders';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'traveler@example.com',
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as User;
}

function makeSession(user: User): Session {
  return {
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user,
  };
}

describe('authProviders', () => {
  it('detects email/password users from identities', () => {
    const user = makeUser({
      identities: [{ provider: 'email', identity_id: 'id-1' } as User['identities'][number]],
    });

    expect(getAuthProviders(user)).toContain('email');
    expect(userHasEmailPasswordIdentity(makeSession(user))).toBe(true);
  });

  it('does not require password re-auth for Google-only users', () => {
    const user = makeUser({
      app_metadata: { provider: 'google', providers: ['google'] },
      identities: [{ provider: 'google', identity_id: 'google-1' } as User['identities'][number]],
    });

    expect(userHasEmailPasswordIdentity(makeSession(user))).toBe(false);
  });

  it('does not require password re-auth for Apple-only users', () => {
    const user = makeUser({
      app_metadata: { provider: 'apple', providers: ['apple'] },
      identities: [{ provider: 'apple', identity_id: 'apple-1' } as User['identities'][number]],
    });

    expect(userHasEmailPasswordIdentity(makeSession(user))).toBe(false);
  });

  it('requires password re-auth when email is linked alongside OAuth', () => {
    const user = makeUser({
      app_metadata: { provider: 'google', providers: ['google', 'email'] },
      identities: [
        { provider: 'google', identity_id: 'google-1' } as User['identities'][number],
        { provider: 'email', identity_id: 'email-1' } as User['identities'][number],
      ],
    });

    expect(userHasEmailPasswordIdentity(makeSession(user))).toBe(true);
  });
});
