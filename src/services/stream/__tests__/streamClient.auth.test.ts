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

  it('does not ship a hard-coded Stream API key fallback', async () => {
    const { getStreamApiKey } = await import('../streamClient');

    expect(getStreamApiKey()).toBeNull();
  });
});
