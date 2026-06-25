/**
 * Classify Supabase refresh failures so we only destroy persisted sessions on
 * definitive auth errors — not transient network blips (a common cause of
 * involuntary logout + auth-modal loops on mobile).
 */
export type AuthRefreshErrorLike = {
  message?: string;
  name?: string;
  status?: number;
};

const FATAL_REFRESH_MESSAGE_FRAGMENTS = [
  'invalid_grant',
  'refresh_token_not_found',
  'refresh token not found',
  'invalid refresh token',
  'session not found',
  'user not found',
  'token has been revoked',
  'refresh token has been revoked',
] as const;

export function isFatalAuthRefreshError(error: AuthRefreshErrorLike | null | undefined): boolean {
  if (!error) return false;

  const message = (error.message ?? '').toLowerCase();
  if (FATAL_REFRESH_MESSAGE_FRAGMENTS.some(fragment => message.includes(fragment))) {
    return true;
  }

  // Supabase returns 400 for invalid_grant; treat other 4xx refresh denials as fatal.
  if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
    if (
      message.includes('invalid') ||
      message.includes('expired') ||
      message.includes('revoked') ||
      message.includes('not found')
    ) {
      return true;
    }
  }

  return false;
}
