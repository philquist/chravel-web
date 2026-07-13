import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('globalSyncProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_STREAM_CHAT_DISABLED', 'true');

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('returns true when Stream is not configured', async () => {
    const { shouldUseLegacyChatSync } = await import('../globalSyncProcessor');
    expect(shouldUseLegacyChatSync()).toBe(true);
  });

  it('returns false when Stream is configured (regardless of connection timing)', async () => {
    vi.stubEnv('VITE_STREAM_CHAT_DISABLED', 'false');
    const { shouldUseLegacyChatSync } = await import('../globalSyncProcessor');
    expect(shouldUseLegacyChatSync()).toBe(false);
  });

  it('omits legacy chat handlers from sync queue when Stream is configured', async () => {
    vi.stubEnv('VITE_STREAM_CHAT_DISABLED', 'false');

    const getQueuedOperations = vi
      .fn()
      .mockResolvedValueOnce([{ id: '1' }])
      .mockResolvedValueOnce([{ id: '1' }]);
    const processSyncQueue = vi.fn().mockResolvedValue({ processed: 0, failed: 0 });

    vi.doMock('../offlineSyncService', () => ({
      offlineSyncService: {
        getQueuedOperations,
        processSyncQueue,
      },
    }));

    vi.doMock('../chatService', () => ({
      sendChatMessage: vi.fn(),
      sendRichChatMessage: vi.fn(),
    }));

    vi.doMock('../calendarService', () => ({
      calendarService: {
        createEvent: vi.fn(),
        updateEvent: vi.fn(),
        deleteEvent: vi.fn(),
      },
    }));

    const { processGlobalSyncQueue } = await import('../globalSyncProcessor');
    await processGlobalSyncQueue();

    const handlers = processSyncQueue.mock.calls[0][0] as Record<string, unknown>;
    expect(handlers.onChatMessageCreate).toBeUndefined();
    expect(handlers.onChatMessageUpdate).toBeUndefined();
  });

  it('keeps legacy chat create handler and prefers rich payload when Stream is not configured', async () => {
    const getQueuedOperations = vi
      .fn()
      .mockResolvedValueOnce([{ id: '1' }])
      .mockResolvedValueOnce([{ id: '1' }]);
    const processSyncQueue = vi.fn().mockResolvedValue({ processed: 0, failed: 0 });

    const sendChatMessage = vi.fn().mockResolvedValue({ id: 'chat-message' });
    const sendRichChatMessage = vi.fn().mockResolvedValue({ id: 'rich-chat-message' });

    vi.doMock('../offlineSyncService', () => ({
      offlineSyncService: {
        getQueuedOperations,
        processSyncQueue,
      },
    }));

    vi.doMock('../chatService', () => ({
      sendChatMessage,
      sendRichChatMessage,
    }));

    vi.doMock('../calendarService', () => ({
      calendarService: {
        createEvent: vi.fn(),
        updateEvent: vi.fn(),
        deleteEvent: vi.fn(),
      },
    }));

    const { processGlobalSyncQueue } = await import('../globalSyncProcessor');
    await processGlobalSyncQueue();

    const handlers = processSyncQueue.mock.calls[0][0] as {
      onChatMessageCreate?: (tripId: string, data: Record<string, unknown>) => Promise<unknown>;
    };

    expect(handlers.onChatMessageCreate).toBeTypeOf('function');

    await handlers.onChatMessageCreate?.('trip-1', { text: 'hello' });
    await handlers.onChatMessageCreate?.('trip-1', {
      text: 'hello',
      client_message_id: 'client-1',
    });

    expect(sendChatMessage).toHaveBeenCalledWith({ text: 'hello' });
    expect(sendRichChatMessage).toHaveBeenCalledWith({
      text: 'hello',
      client_message_id: 'client-1',
    });
  });
});
