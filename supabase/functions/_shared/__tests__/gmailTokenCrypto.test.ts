import { describe, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

// gmailTokenCrypto.ts uses the global `crypto` (subtle + getRandomValues). vitest runs under
// jsdom, whose `crypto` can lack `subtle`, so back the global with Node's WebCrypto. This is
// the same AES-GCM module the Apple refresh-token store (store-apple-token / appleRevoke) reuses.
vi.stubGlobal('crypto', webcrypto);

import { encryptToken, decryptToken } from '../gmailTokenCrypto.ts';

function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function randomBase64Key(byteLength = 32): string {
  return base64Encode(webcrypto.getRandomValues(new Uint8Array(byteLength)));
}

describe('gmailTokenCrypto (AES-GCM token encryption)', () => {
  it('round-trips a token through encrypt/decrypt', async () => {
    const key = randomBase64Key();
    const plain = 'apple-refresh-token-abc123.def456';
    const encrypted = await encryptToken(plain, key);
    expect(await decryptToken(encrypted, key)).toBe(plain);
  });

  it('produces ciphertext with the enc:v1: prefix', async () => {
    const encrypted = await encryptToken('secret', randomBase64Key());
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
  });

  it('uses a random IV so identical plaintext encrypts differently each time', async () => {
    const key = randomBase64Key();
    const a = await encryptToken('same-plaintext', key);
    const b = await encryptToken('same-plaintext', key);
    expect(a).not.toBe(b);
    // ...but both still decrypt back to the original.
    expect(await decryptToken(a, key)).toBe('same-plaintext');
    expect(await decryptToken(b, key)).toBe('same-plaintext');
  });

  it('returns the value unchanged when it lacks the enc:v1: prefix (legacy plaintext)', async () => {
    expect(await decryptToken('legacy-plaintext-token', randomBase64Key())).toBe(
      'legacy-plaintext-token',
    );
  });

  it('returns null for a null token', async () => {
    expect(await decryptToken(null, randomBase64Key())).toBeNull();
  });

  it('fails to decrypt with the wrong key (AES-GCM auth-tag mismatch)', async () => {
    const encrypted = await encryptToken('top-secret', randomBase64Key());
    await expect(decryptToken(encrypted, randomBase64Key())).rejects.toThrow();
  });

  it('rejects a key that is not 32 bytes', async () => {
    const shortKey = randomBase64Key(16);
    await expect(encryptToken('x', shortKey)).rejects.toThrow(/32 random bytes/);
  });
});
