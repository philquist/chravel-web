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

/**
 * Why the native bridge did NOT produce a session (only set when `handled` is false).
 * Lets the iOS-native caller log a precise cause and refuse the browser fallback:
 *   - `bridge-missing`        — the shell did not inject `signInWithApple` (older build).
 *   - `bridge-threw`          — the native ASAuthorization sheet errored or was canceled.
 *   - `incomplete-credential` — the sheet resolved without an identityToken / rawNonce.
 */
export type NativeAppleUnhandledReason =
  | 'bridge-missing'
  | 'bridge-threw'
  | 'incomplete-credential';

export interface NativeAppleSignInOutcome {
  /** True when the native bridge handled the attempt (a definitive success or error). */
  handled: boolean;
  /** Provider error message when `signInWithIdToken` failed. */
  error?: string;
  /** Apple authorization code (single-use) to forward for token-revocation capture. */
  authorizationCode?: string;
  /** Set when `handled` is false — why the native path did not produce a session. */
  unhandledReason?: NativeAppleUnhandledReason;
  /** The underlying error thrown by the native sheet (only for `bridge-threw`), for logging. */
  cause?: unknown;
}

/**
 * Heuristic: did the native Apple sheet throw because the user dismissed/canceled it?
 * `ASAuthorizationError.canceled` (code 1001) and the Expo bridge surface
 * "canceled" / "cancelled" / "user canceled" in the message. Cancellations are
 * expected UX, not faults — callers use this to keep them out of error reporting.
 */
export function isLikelyUserCancellation(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
  return /cancel/i.test(message) || /\b1001\b/.test(message);
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
 * Returns `{ handled: true }` on a definitive outcome (a session or a provider error).
 * Returns `{ handled: false, unhandledReason }` when the bridge is unavailable, throws, or
 * returns an incomplete credential. On non-iOS surfaces the caller falls back to the web
 * OAuth flow; on the iOS shell the caller MUST surface a retriable error instead of falling
 * through to the browser PKCE path (App Store 2.1(a)). Never throws.
 */
export async function attemptNativeAppleSignIn(
  auth: SupabaseIdTokenAuth,
): Promise<NativeAppleSignInOutcome> {
  const nativeSignIn = getNativeAppleSignIn();
  if (!nativeSignIn) return { handled: false, unhandledReason: 'bridge-missing' };

  let credential: NativeAppleCredential;
  try {
    credential = await nativeSignIn();
  } catch (err) {
    // The native sheet errored or was canceled. Surface the cause so the caller can log it;
    // on non-iOS surfaces it falls back to web OAuth, on iOS it shows a retriable error.
    if (import.meta.env.DEV) {
      console.warn('[Auth] Native Apple bridge threw:', err);
    }
    return { handled: false, unhandledReason: 'bridge-threw', cause: err };
  }

  if (!credential?.identityToken || !credential.rawNonce) {
    return { handled: false, unhandledReason: 'incomplete-credential' };
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
