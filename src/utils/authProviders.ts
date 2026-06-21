import type { Session, User } from '@supabase/supabase-js';

/** Collect linked auth providers from a Supabase user record. */
export function getAuthProviders(user: User | null | undefined): string[] {
  if (!user) return [];

  return [
    user.app_metadata?.provider,
    ...(Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : []),
    ...(user.identities ?? []).map(identity => identity.provider),
  ].filter((provider): provider is string => typeof provider === 'string' && provider.length > 0);
}

/** True when the signed-in user can authenticate with email + password. */
export function userHasEmailPasswordIdentity(session: Session | null | undefined): boolean {
  if (!session?.user) return false;
  return getAuthProviders(session.user).includes('email');
}
