/**
 * Native Sign in with Apple (ASAuthorization) bridge + Supabase id-token exchange.
 *
 * On iOS / iPad the SFSafariViewController + Universal-Link OAuth round-trip can strand the
 * user after they authenticate ("did not proceed to next page" — App Review Guideline
 * 2.1(a)). When the chravel-mobile shell exposes `window.ChravelNative.signInWithApple`, we
 * authenticate with the native Apple credential via `supabase.auth.signInWithIdToken`
 * instead, skipping the browser round-trip entirely.
 *
 * Bridge contract (mirrored in `src/utils/nativeBridge.ts` and chravel-mobile/CLAUDE.md):
 *   window.ChravelNative.signInWithApple(): Promise<NativeAppleCredential>
 *   - the shell generates a random `rawNonce`, sends `SHA256(rawNonce)` as the `nonce` on
 *     the `ASAuthorizationAppleIDRequest`, and returns the RAW (unhashed) nonce plus the
 *     identity token. Supabase/Apple verify `SHA256(nonce)` against the token, so the RAW
 *     nonce must be passed to `signInWithIdToken`.
 */

export interface NativeAppleCredential {
  identityToken: string;
  rawNonce: string;
  email?: string;
  fullName?: string;
  /** One-time Apple authorization code, for server-side token revocation capture. */
  authorizationCode?: string;
}

type NativeAppleSignInFn = () => Promise<NativeAppleCredential>;

interface ChravelNativeAppleBridge {
  signInWithApple?: NativeAppleSignInFn;
}

/**
 * Minimal structural slice of `supabase.auth` so this helper is trivially mockable in tests
 * without importing the full client. `supabase.auth` is structurally assignable to it.
 */
export interface SupabaseIdTokenAuth {
  signInWithIdToken(credentials: {
    provider: 'apple';
    token: string;
    nonce?: string;
  }): Promise<{ error: { message: string } | null }>;
}

export interface NativeAppleSignInOutcome {
  /** True when the native bridge handled the attempt (a definitive success or error). */
  handled: boolean;
  /** Provider error message when `signInWithIdToken` failed. */
  error?: string;
  /** Apple authorization code (single-use) to forward for token-revocation capture. */
  authorizationCode?: string;
}

/** Returns the native Apple Sign In bridge function if the shell injected it, else null. */
export function getNativeAppleSignIn(): NativeAppleSignInFn | null {
  if (typeof window === 'undefined') return null;
  const fn = (window as Window & { ChravelNative?: ChravelNativeAppleBridge }).ChravelNative
    ?.signInWithApple;
  return typeof fn === 'function' ? fn : null;
}

/**
 * Attempt native Apple sign-in via the chravel-mobile bridge + Supabase id-token exchange.
 *
 * Returns `{ handled: false }` when the bridge is unavailable, throws, or returns an
 * incomplete credential — the caller then falls back to the existing web OAuth flow. Never
 * throws.
 */
export async function attemptNativeAppleSignIn(
  auth: SupabaseIdTokenAuth,
): Promise<NativeAppleSignInOutcome> {
  const nativeSignIn = getNativeAppleSignIn();
  if (!nativeSignIn) return { handled: false };

  let credential: NativeAppleCredential;
  try {
    credential = await nativeSignIn();
  } catch (err) {
    // Bridge unavailable mid-flight or the native sheet errored/canceled — fall back to the
    // web OAuth flow rather than stranding the user.
    if (import.meta.env.DEV) {
      console.warn('[Auth] Native Apple bridge threw; falling back to OAuth:', err);
    }
    return { handled: false };
  }

  if (!credential?.identityToken || !credential.rawNonce) {
    return { handled: false };
  }

  const { error } = await auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: credential.rawNonce,
  });

  if (error) {
    return { handled: true, error: error.message };
  }

  return { handled: true, authorizationCode: credential.authorizationCode };
}
