import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * Capture the Apple Sign-in refresh token so it can be revoked on account deletion
 * (App Store 5.1.1(v)). Apple sign-in here runs through Supabase WebView OAuth (GoTrue)
 * for both web and native — there is no native ASAuthorization flow — so the refresh
 * token is read server-side-style from the Supabase session on the SIGNED_IN event and
 * handed to the `store-apple-token` edge function, which stores it encrypted.
 *
 * IMPORTANT: `provider_refresh_token` is only present on the INITIAL OAuth redirect, not
 * on later TOKEN_REFRESHED events — so this must run on the SIGNED_IN transition.
 *
 * Best-effort and non-blocking: never throws, never gates the auth flow. If the provider
 * is not Apple, or no provider refresh token is present, it no-ops.
 */
export const captureAppleRefreshToken = (session: Session | null): void => {
  if (!session?.user) return;

  const user = session.user;
  const providers: string[] = [
    user.app_metadata?.provider,
    ...(Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : []),
    ...(user.identities ?? []).map(i => i.provider),
  ].filter(Boolean) as string[];

  if (!providers.includes('apple')) return;

  const refreshToken = session.provider_refresh_token;
  if (!refreshToken) return;

  const appleSub =
    user.identities?.find(i => i.provider === 'apple')?.id ??
    (typeof user.user_metadata?.sub === 'string' ? user.user_metadata.sub : undefined);

  // Defer off the auth callback (Supabase warns against async work inside the
  // onAuthStateChange listener) and swallow all errors — token capture must never
  // block or break sign-in.
  setTimeout(() => {
    void supabase.functions
      .invoke('store-apple-token', {
        body: { refreshToken, appleSub },
      })
      .catch(error => {
        if (import.meta.env.DEV) {
          console.warn('[Auth] Failed to store Apple refresh token:', error);
        }
      });
  }, 0);
};

/**
 * Native (ASAuthorization) counterpart to {@link captureAppleRefreshToken}.
 *
 * Native Sign in with Apple authenticates via `signInWithIdToken`, which carries NO
 * `provider_refresh_token` on the Supabase session — so `captureAppleRefreshToken` cannot
 * capture it. Instead the native bridge returns a one-time Apple `authorizationCode`; we
 * forward it to `store-apple-token` so the server can exchange it for a refresh token and
 * revoke the Apple grant on account deletion (App Store 5.1.1(v)).
 *
 * The server-side authorization-code → refresh-token exchange (which needs the Apple `.p8`
 * client secret) is tracked as F1 in APP_STORE_READINESS_AUDIT.md §8; until those secrets
 * land, `store-apple-token` acknowledges the code without storing it.
 *
 * Best-effort and non-blocking: never throws, never gates sign-in.
 */
export const captureAppleAuthorizationCode = (authorizationCode: string): void => {
  if (!authorizationCode) return;

  setTimeout(() => {
    void supabase.functions
      .invoke('store-apple-token', {
        body: { authorizationCode },
      })
      .catch(error => {
        if (import.meta.env.DEV) {
          console.warn('[Auth] Failed to forward Apple authorization code:', error);
        }
      });
  }, 0);
};
