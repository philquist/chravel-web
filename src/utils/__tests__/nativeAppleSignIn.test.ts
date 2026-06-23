import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attemptNativeAppleSignIn,
  getNativeAppleSignIn,
  type SupabaseIdTokenAuth,
} from '@/utils/nativeAppleSignIn';

function setBridge(fn: unknown): void {
  (window as unknown as { ChravelNative?: Record<string, unknown> }).ChravelNative = {
    signInWithApple: fn,
  };
}

describe('attemptNativeAppleSignIn', () => {
  afterEach(() => {
    delete (window as unknown as { ChravelNative?: unknown }).ChravelNative;
    vi.restoreAllMocks();
  });

  it('authenticates via signInWithIdToken with the RAW nonce when the bridge is present', async () => {
    setBridge(
      vi.fn().mockResolvedValue({
        identityToken: 'id-token',
        rawNonce: 'raw-nonce',
        authorizationCode: 'auth-code',
      }),
    );
    const signInWithIdToken = vi.fn().mockResolvedValue({ error: null });

    const outcome = await attemptNativeAppleSignIn({ signInWithIdToken } as SupabaseIdTokenAuth);

    expect(signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'id-token',
      nonce: 'raw-nonce',
    });
    expect(outcome).toEqual({ handled: true, authorizationCode: 'auth-code' });
  });

  it('falls back (handled: false) and does not call signInWithIdToken when the bridge is absent', async () => {
    const signInWithIdToken = vi.fn();

    const outcome = await attemptNativeAppleSignIn({ signInWithIdToken } as SupabaseIdTokenAuth);

    expect(outcome).toEqual({ handled: false });
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it('falls back (handled: false) when the bridge throws (e.g. user canceled)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setBridge(vi.fn().mockRejectedValue(new Error('user canceled')));
    const signInWithIdToken = vi.fn();

    const outcome = await attemptNativeAppleSignIn({ signInWithIdToken } as SupabaseIdTokenAuth);

    expect(outcome).toEqual({ handled: false });
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it('surfaces the provider error (handled) when signInWithIdToken fails', async () => {
    setBridge(vi.fn().mockResolvedValue({ identityToken: 't', rawNonce: 'n' }));
    const signInWithIdToken = vi
      .fn()
      .mockResolvedValue({ error: { message: 'provider is not enabled' } });

    const outcome = await attemptNativeAppleSignIn({ signInWithIdToken } as SupabaseIdTokenAuth);

    expect(outcome).toEqual({ handled: true, error: 'provider is not enabled' });
  });

  it('falls back when the native credential is incomplete', async () => {
    setBridge(vi.fn().mockResolvedValue({ identityToken: '', rawNonce: '' }));
    const signInWithIdToken = vi.fn();

    const outcome = await attemptNativeAppleSignIn({ signInWithIdToken } as SupabaseIdTokenAuth);

    expect(outcome).toEqual({ handled: false });
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });
});

describe('getNativeAppleSignIn', () => {
  afterEach(() => {
    delete (window as unknown as { ChravelNative?: unknown }).ChravelNative;
  });

  it('returns null when no bridge is injected', () => {
    expect(getNativeAppleSignIn()).toBeNull();
  });

  it('returns the bridge function when injected', () => {
    const fn = vi.fn();
    setBridge(fn);
    expect(getNativeAppleSignIn()).toBe(fn);
  });
});
