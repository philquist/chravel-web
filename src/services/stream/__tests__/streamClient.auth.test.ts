import { beforeEach, describe, expect, it, vi } from 'vitest';

const clearStreamTokenCacheMock = vi.fn();
let authStateCallback:
  | ((eventOrPayload: unknown, session: unknown) => void | Promise<void>)
  | null = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (
        cb: (eventOrPayload: unknown, session: unknown) => void | Promise<void>,
      ) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));

vi.mock('../streamTokenService', () => ({
  getStreamToken: vi.fn(),
  clearStreamTokenCache: () => clearStreamTokenCacheMock(),
}));

vi.mock('stream-chat', () => ({
  StreamChat: {
    getInstance: vi.fn(() => ({
      connectUser: vi.fn(),
      disconnectUser: vi.fn(),
      on: vi.fn(),
    })),
  },
}));

describe('streamClient auth listener', () => {
  beforeEach(() => {
    vi.resetModules();
    clearStreamTokenCacheMock.mockClear();
    authStateCallback = null;
  });

  it('disconnects on SIGNED_OUT event payload object shape', async () => {
    await import('../streamClient');
    expect(authStateCallback).toBeTypeOf('function');

    authStateCallback?.({ event: 'SIGNED_OUT' }, null);

    expect(clearStreamTokenCacheMock).toHaveBeenCalledTimes(1);
  });

  it('resolves the Stream API key from stream-token without a hard-coded fallback', async () => {
    const { getStreamToken } = await import('../streamTokenService');
    vi.mocked(getStreamToken).mockResolvedValue({
      token: 'token',
      userId: 'user-1',
      apiKey: 'runtime-key',
    });

    const { connectStreamClient, getStreamApiKey } = await import('../streamClient');

    expect(getStreamApiKey()).toBeNull();

    await connectStreamClient();

    expect(getStreamApiKey()).toBe('runtime-key');
  });

  it('connects with a refreshing tokenProvider function, not a static token', async () => {
    const { getStreamToken } = await import('../streamTokenService');
    vi.mocked(getStreamToken).mockResolvedValue({
      token: 'tok-abc',
      userId: 'user-1',
      apiKey: 'runtime-key',
    });

    const connectUserMock = vi.fn().mockResolvedValue(undefined);
    const { StreamChat } = await import('stream-chat');
    vi.mocked(StreamChat.getInstance).mockReturnValue({
      connectUser: connectUserMock,
      disconnectUser: vi.fn(),
      on: vi.fn(),
    } as unknown as ReturnType<typeof StreamChat.getInstance>);

    const { connectStreamClient } = await import('../streamClient');
    await connectStreamClient();

    expect(connectUserMock).toHaveBeenCalledTimes(1);
    const [userArg, tokenArg] = connectUserMock.mock.calls[0];
    expect(userArg).toEqual({ id: 'user-1' });
    // A function (tokenProvider), not a raw token string — this is what lets
    // Stream re-mint the token on reconnect / after backgrounding.
    expect(tokenArg).toBeTypeOf('function');
    await expect(tokenArg()).resolves.toBe('tok-abc');
  });

  it('retries the initial connect after a transient token failure', async () => {
    vi.useFakeTimers();
    const { getStreamToken } = await import('../streamTokenService');
    vi.mocked(getStreamToken)
      .mockRejectedValueOnce(new Error('edge function cold start'))
      .mockResolvedValue({ token: 'tok', userId: 'user-1', apiKey: 'runtime-key' });

    const connectUserMock = vi.fn().mockResolvedValue(undefined);
    const { StreamChat } = await import('stream-chat');
    vi.mocked(StreamChat.getInstance).mockReturnValue({
      connectUser: connectUserMock,
      disconnectUser: vi.fn(),
      on: vi.fn(),
    } as unknown as ReturnType<typeof StreamChat.getInstance>);

    const { connectStreamClient } = await import('../streamClient');
    const connectPromise = connectStreamClient();
    await vi.runAllTimersAsync();
    await connectPromise;

    // First attempt threw; the loop backed off and re-fetched successfully.
    expect(vi.mocked(getStreamToken).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(connectUserMock).toHaveBeenCalledTimes(1);
    // Poisoned cache is cleared before each retry.
    expect(clearStreamTokenCacheMock).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
