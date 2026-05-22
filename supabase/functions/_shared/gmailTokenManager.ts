// Shared Gmail token lifecycle helper.
// Owns: refresh-on-401, re-encrypt on rotation, audit log, and reconnect signaling.
// Callers (gmail-import-worker, future Gmail-dependent functions) get a valid access
// token or a typed error indicating the user must reconnect.

import { decryptToken, encryptToken } from './gmailTokenCrypto.ts';

export const GMAIL_RECONNECT_REQUIRED = 'GMAIL_RECONNECT_REQUIRED';

export class GmailReconnectRequiredError extends Error {
  code = GMAIL_RECONNECT_REQUIRED;
  constructor(message = 'Gmail access expired or revoked. Please reconnect Gmail.') {
    super(message);
    this.name = 'GmailReconnectRequiredError';
  }
}

type AdminClient = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => Promise<unknown>;
    };
    insert: (values: Record<string, unknown>) => Promise<unknown>;
  };
};

interface GmailAccountRow {
  id: string;
  email: string;
  access_token: string | null;
  refresh_token: string | null;
}

interface RefreshResult {
  accessToken: string;
  expiresIn: number | null;
}

async function callGoogleRefresh(refreshToken: string): Promise<RefreshResult> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    // 400 invalid_grant means the user revoked access — surface as reconnect.
    if (resp.status === 400 && /invalid_grant/i.test(body)) {
      throw new GmailReconnectRequiredError();
    }
    throw new Error(`Token refresh failed (${resp.status}): ${body}`);
  }

  const data = await resp.json();
  return {
    accessToken: data.access_token,
    expiresIn: typeof data.expires_in === 'number' ? data.expires_in : null,
  };
}

/**
 * Decrypt the stored access token; if Gmail rejects it with 401 and we have a
 * refresh token, rotate via Google, persist the new encrypted access token,
 * and write an audit log row. On invalid_grant (revoked), mark the account
 * inactive and throw GmailReconnectRequiredError.
 */
export async function getValidGmailAccessToken(
  adminClient: AdminClient,
  encryptionKey: string,
  userId: string,
  account: GmailAccountRow,
): Promise<string> {
  if (!account.access_token)
    throw new GmailReconnectRequiredError('No Gmail access token on file.');

  let accessToken = await decryptToken(account.access_token, encryptionKey);
  const refreshToken = account.refresh_token
    ? await decryptToken(account.refresh_token, encryptionKey)
    : null;

  if (!accessToken) throw new GmailReconnectRequiredError();

  const probe = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // Drain body to avoid Deno resource leak.
  await probe.text();

  if (probe.status !== 401) return accessToken;

  if (!refreshToken) {
    await markAccountInactive(adminClient, account.id);
    throw new GmailReconnectRequiredError();
  }

  try {
    const refreshed = await callGoogleRefresh(refreshToken);
    accessToken = refreshed.accessToken;

    await adminClient
      .from('gmail_accounts')
      .update({
        access_token: await encryptToken(accessToken, encryptionKey),
        token_expires_at: refreshed.expiresIn
          ? new Date(Date.now() + (refreshed.expiresIn - 60) * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', account.id);

    await adminClient.from('gmail_token_audit_logs').insert({
      user_id: userId,
      gmail_account_email: account.email,
      action: 'access_token_refresh',
    });

    return accessToken;
  } catch (err) {
    if (err instanceof GmailReconnectRequiredError) {
      await markAccountInactive(adminClient, account.id);
    }
    throw err;
  }
}

async function markAccountInactive(adminClient: AdminClient, accountId: string): Promise<void> {
  try {
    await adminClient
      .from('gmail_accounts')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', accountId);
  } catch {
    // Best-effort; the caller will still surface the reconnect error.
  }
}
