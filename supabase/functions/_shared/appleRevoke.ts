/**
 * Revoke a user's Sign in with Apple grant on account deletion (App Store 5.1.1(v)).
 *
 * Looks up the encrypted Apple refresh token captured at sign-in (apple_auth_tokens),
 * decrypts it (reuses ./gmailTokenCrypto.ts), mints an ES256 client secret, and POSTs
 * to appleid.apple.com/auth/revoke. Always audit-logs the attempt and deletes the row.
 *
 * Designed to NEVER throw to the caller — deletion must proceed even if revocation
 * fails. No-ops cleanly (reason: 'no_token') when the user never signed in with Apple,
 * and (reason: 'misconfigured') when the APPLE_* secrets are not set.
 */

import { decryptToken } from './gmailTokenCrypto.ts';
import { appleConfigFromEnv, mintAppleClientSecret } from './appleClientSecret.ts';

const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

export interface AppleRevokeResult {
  revoked: boolean;
  reason?: 'no_token' | 'revoke_http_error' | 'misconfigured' | 'exception';
  status?: number;
}

export async function revokeAppleForUser(
  // deno-lint-ignore no-explicit-any -- service-role SupabaseClient; avoid deep generic inference
  adminClient: any,
  userId: string,
): Promise<AppleRevokeResult> {
  const { data: row, error: selectError } = await adminClient
    .from('apple_auth_tokens')
    .select('id, refresh_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError) {
    console.warn('[appleRevoke] lookup failed (continuing):', selectError.message);
    return { revoked: false, reason: 'exception' };
  }

  if (!row || !row.refresh_token) {
    return { revoked: false, reason: 'no_token' };
  }

  let result: AppleRevokeResult = { revoked: false };

  try {
    const encryptionKey = Deno.env.get('APPLE_TOKEN_ENCRYPTION_KEY') ?? '';
    if (!encryptionKey) throw new Error('APPLE_TOKEN_ENCRYPTION_KEY not set');

    const token = await decryptToken(row.refresh_token, encryptionKey);
    if (!token) throw new Error('decrypted Apple token was empty');

    const cfg = appleConfigFromEnv();
    const clientSecret = await mintAppleClientSecret(cfg);

    const resp = await fetch(APPLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: clientSecret,
        token,
        token_type_hint: 'refresh_token',
      }),
    });

    result = resp.ok
      ? { revoked: true, status: resp.status }
      : { revoked: false, reason: 'revoke_http_error', status: resp.status };

    if (!resp.ok) {
      console.warn(
        `[appleRevoke] revoke returned ${resp.status} for user ${userId}:`,
        await resp.text().catch(() => ''),
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[appleRevoke] error for user ${userId} (continuing):`, message);
    result = {
      revoked: false,
      reason:
        message.includes('not set') || message.includes('missing secrets')
          ? 'misconfigured'
          : 'exception',
    };
  }

  try {
    await adminClient.from('security_audit_log').insert({
      user_id: userId,
      action: 'apple_token_revoked',
      table_name: 'apple_auth_tokens',
      record_id: row.id,
      metadata: {
        revoked: result.revoked,
        reason: result.reason ?? null,
        http_status: result.status ?? null,
        revoked_at: new Date().toISOString(),
      },
    });
  } catch (auditErr) {
    console.warn('[appleRevoke] audit log insert failed:', auditErr);
  }

  try {
    await adminClient.from('apple_auth_tokens').delete().eq('user_id', userId);
  } catch (delErr) {
    console.warn('[appleRevoke] failed to delete apple_auth_tokens row:', delErr);
  }

  return result;
}
