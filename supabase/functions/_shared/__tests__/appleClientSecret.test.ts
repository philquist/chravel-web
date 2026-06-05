import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';

// appleClientSecret.ts reads `Deno.env` and uses the global `crypto` (subtle ECDSA P-256).
// Stub both: a Map-backed Deno.env (same pattern as cors.security.test.ts) and Node's WebCrypto
// for `crypto`, since vitest runs under jsdom whose `crypto` can lack `subtle`.
const env = new Map<string, string>();
vi.stubGlobal('Deno', { env: { get: (key: string) => env.get(key) ?? '' } });
vi.stubGlobal('crypto', webcrypto);

import { mintAppleClientSecret, appleConfigFromEnv } from '../appleClientSecret.ts';

const TEAM_ID = 'TEAM123456';
const KEY_ID = 'KEY7654321';
const CLIENT_ID = 'app.chravel.client';

function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64UrlToBytes(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  b64 += '='.repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function decodeJwtSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

let publicKey: CryptoKey;
let applePem: string;

beforeAll(async () => {
  // Generate an ephemeral P-256 keypair; mint with the private key (as a .p8-style PEM) and
  // verify the resulting JWT signature with the public key — proving ES256 signing end-to-end.
  const pair = (await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  publicKey = pair.publicKey;

  const pkcs8 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey));
  applePem =
    '-----BEGIN PRIVATE KEY-----\n' +
    (base64Encode(pkcs8)
      .match(/.{1,64}/g)
      ?.join('\n') ?? '') +
    '\n-----END PRIVATE KEY-----';
});

// Reset to a complete, valid Apple config before every test so a test that deletes a key
// (e.g. the missing-secret case) cannot leak empty env into another test under reorder/retry.
beforeEach(() => {
  env.clear();
  env.set('APPLE_TEAM_ID', TEAM_ID);
  env.set('APPLE_KEY_ID', KEY_ID);
  env.set('APPLE_CLIENT_ID', CLIENT_ID);
  env.set('APPLE_P8_PRIVATE_KEY', applePem);
});

describe('appleClientSecret (ES256 Apple client-secret JWT)', () => {
  it('mints a three-segment JWT', async () => {
    const jwt = await mintAppleClientSecret();
    expect(jwt.split('.')).toHaveLength(3);
  });

  it('sets an ES256 header with the configured key id', async () => {
    const [headerB64] = (await mintAppleClientSecret()).split('.');
    expect(decodeJwtSegment(headerB64)).toMatchObject({
      alg: 'ES256',
      kid: KEY_ID,
      typ: 'JWT',
    });
  });

  it('sets the Apple-required claims in the payload', async () => {
    const [, payloadB64] = (await mintAppleClientSecret()).split('.');
    const payload = decodeJwtSegment(payloadB64);
    expect(payload.iss).toBe(TEAM_ID);
    expect(payload.sub).toBe(CLIENT_ID);
    expect(payload.aud).toBe('https://appleid.apple.com');
    expect((payload.exp as number) - (payload.iat as number)).toBe(300);
  });

  it('produces a signature that verifies against the signing key', async () => {
    const [headerB64, payloadB64, signatureB64] = (await mintAppleClientSecret()).split('.');
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const valid = await webcrypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      publicKey,
      base64UrlToBytes(signatureB64),
      signingInput,
    );
    expect(valid).toBe(true);
  });

  it('throws naming the missing field when config is incomplete', () => {
    // beforeEach restores full env, so deleting one key here cannot leak into other tests.
    env.delete('APPLE_KEY_ID');
    // appleConfigFromEnv reports the config field (`keyId`) sourced from APPLE_KEY_ID.
    expect(() => appleConfigFromEnv()).toThrow(/missing secrets: keyId/);
  });
});
