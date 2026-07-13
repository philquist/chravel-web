/**
 * Apple "Sign in with Apple" client-secret JWT minting (ES256).
 *
 * Apple's token endpoints (including /auth/revoke) require a short-lived client
 * secret signed with the Sign in with Apple .p8 private key (ECDSA P-256 / ES256).
 * This mints that JWT from the APPLE_* edge secrets. Nothing here is persisted.
 *
 * Secrets: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_P8_PRIVATE_KEY.
 */

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importP8(pem: string): Promise<CryptoKey> {
  const normalized = pem.replace(/\\n/g, '\n');
  const body = normalized
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  if (!body) throw new Error('APPLE_P8_PRIVATE_KEY is empty or malformed');
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
}

export interface AppleClientSecretConfig {
  teamId: string;
  keyId: string;
  clientId: string;
  privateKeyPem: string;
}

export function appleConfigFromEnv(): AppleClientSecretConfig {
  const cfg = {
    teamId: Deno.env.get('APPLE_TEAM_ID') ?? '',
    keyId: Deno.env.get('APPLE_KEY_ID') ?? '',
    clientId: Deno.env.get('APPLE_CLIENT_ID') ?? '',
    privateKeyPem: Deno.env.get('APPLE_P8_PRIVATE_KEY') ?? '',
  };
  const missing = Object.entries(cfg)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`Apple config missing secrets: ${missing.join(', ')}`);
  return cfg;
}

export async function mintAppleClientSecret(
  cfg: AppleClientSecretConfig = appleConfigFromEnv(),
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: cfg.keyId, typ: 'JWT' };
  const payload = {
    iss: cfg.teamId,
    iat: now,
    exp: now + 300,
    aud: 'https://appleid.apple.com',
    sub: cfg.clientId,
  };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const key = await importP8(cfg.privateKeyPem);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      key,
      new TextEncoder().encode(signingInput),
    ),
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}
