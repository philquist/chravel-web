import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStreamTripChat } from '../useStreamTripChat';
import { supabase } from '@/integrations/supabase/client';
import { telemetry } from '@/telemetry/service';
import { derivePinnedMessages } from '@/features/chat/utils/pinnedMessages';

const sendMessageMock = vi.fn();
const watchMock = vi.fn();
const queryMock = vi.fn();
const stopWatchingMock = vi.fn();
const onMock = vi.fn();
const offMock = vi.fn();
const getConfigMock = vi.fn();
const eventHandlers = new Map<string, (event: unknown) => void>();

const mockChannel = {
  watch: watchMock,
  query: queryMock,
  stopWatching: stopWatchingMock,
  on: onMock,
  off: offMock,
  sendMessage: sendMessageMock,
  getConfig: getConfigMock,
};

vi.mock('@/services/stream/streamClient', () => ({
  connectStreamClient: vi.fn().mockResolvedValue({
    userID: 'user-1',
    channel: vi.fn(() => mockChannel),
  }),
  getStreamApiKey: vi.fn(() => 'stream-key'),
  getStreamClient: vi.fn(() => ({
    userID: 'user-1',
    channel: vi.fn(() => mockChannel),
  })),
  onStreamClientConnected: vi.fn(() => () => {}),
  onStreamClientConnectionStatusChange: vi.fn(() => () => {}),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        })),
      })),
    })),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    session: { access_token: 'mock-access-token' },
  }),
}));

vi.mock('@/telemetry/service', () => ({
  telemetry: {
    track: vi.fn(),
  },
}));

vi.mock('@/services/stream/streamCanary', () => ({
  isStreamCanaryEnabledForUser: vi.fn().mockResolvedValue(false),
  reportStreamCanaryIncident: vi.fn(),
}));

describe('useStreamTripChat send path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers.clear();
    onMock.mockImplementation((eventName: string, handler: (event: unknown) => void) => {
      eventHandlers.set(eventName, handler);
      return mockChannel;
    });
    offMock.mockImplementation((eventName: string) => {
      eventHandlers.delete(eventName);
      return mockChannel;
    });
    watchMock.mockResolvedValue({ messages: [], membership: { user_id: 'user-1' } });
    queryMock.mockResolvedValue({ messages: [] });
    getConfigMock.mockReturnValue({});
    sendMessageMock.mockResolvedValue({
      message: { id: 'msg-1', text: 'hello', created_at: new Date().toISOString() },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sendMessageAsync awaits real sendMessage and uses HTTP response for immediate UI update', async () => {
    const { result } = renderHook(() => useStreamTripChat('trip-abc', { enabled: true }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let settled = false;
    await act(async () => {
      void result.current.sendMessageAsync('hello', 'You').then(() => {
        settled = true;
      });
    });

    expect(settled).toBe(true);
    expect(result.current.isCreating).toBe(false);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    // Message should appear in local state from HTTP response
    expect(result.current.messages).toHaveLength(1);
  });

  it('keeps one chronological upsert path for send confirmations and message.updated pin toggles', async () => {
    watchMock.mockResolvedValueOnce({
      membership: { user_id: 'user-1' },
      messages: [
        { id: 'msg-old', text: 'old', created_at: '2026-01-01T10:00:00.000Z' },
        { id: 'msg-new', text: 'new', created_at: '2026-01-01T10:10:00.000Z' },
      ],
    });
    sendMessageMock.mockResolvedValueOnce({
      message: { id: 'msg-mid', text: 'mid', created_at: '2026-01-01T10:05:00.000Z' },
    });

    const { result } = renderHook(() => useStreamTripChat('trip-abc', { enabled: true }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessageAsync('mid', 'You');
    });

    expect(result.current.messages.map(message => message.id)).toEqual([
      'msg-old',
      'msg-mid',
      'msg-new',
    ]);

    await act(async () => {
      eventHandlers.get('message.updated')?.({
        message: {
          id: 'msg-mid',
          text: 'mid',
          created_at: '2026-01-01T10:05:00.000Z',
          pinned: true,
          pinned_at: '2026-01-01T10:15:00.000Z',
        },
      });
    });

    expect(result.current.messages.map(message => message.id)).toEqual([
      'msg-old',
      'msg-mid',
      'msg-new',
    ]);
    expect(result.current.messages.find(message => message.id === 'msg-mid')?.pinned).toBe(true);
  });

  it('hydrates a server-search result window around an unloaded message', async () => {
    watchMock.mockResolvedValueOnce({
      membership: { user_id: 'user-1' },
      messages: [{ id: 'msg-new', text: 'new', created_at: '2026-01-01T10:10:00.000Z' }],
    });
    queryMock.mockResolvedValueOnce({
      messages: [
        { id: 'msg-old', text: 'old', created_at: '2026-01-01T10:00:00.000Z' },
        { id: 'msg-new', text: 'new', created_at: '2026-01-01T10:10:00.000Z' },
      ],
    });

    const { result } = renderHook(() => useStreamTripChat('trip-abc', { enabled: true }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await expect(result.current.loadAroundMessage('msg-old')).resolves.toBe(true);
    });

    expect(queryMock).toHaveBeenCalledWith({
      messages: { limit: 30, id_around: 'msg-old' },
    });
    expect(result.current.messages.map(message => message.id)).toEqual(['msg-old', 'msg-new']);
  });

  it('sends mention payload when create-mention capability is present', async () => {
    getConfigMock.mockReturnValue({
      grants: {
        channel_member: ['read-channel', 'create-message', 'create-mention'],
      },
    });
    const { result } = renderHook(() => useStreamTripChat('trip-abc', { enabled: true }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessageAsync(
        'hello @Sam',
        'You',
        undefined,
        undefined,
        'user-1',
        undefined,
        'text',
        undefined,
        undefined,
        ['user-2'],
      );
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock.mock.calls[0]?.[0]?.mentioned_users).toEqual(['user-2']);
  });

  it('sendMessageAsync throws on rejected sendMessage so caller can restore draft', async () => {
    sendMessageMock.mockRejectedValue(new Error('Not a member'));

    const { result } = renderHook(() => useStreamTripChat('trip-abc', { enabled: true }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let caughtError: Error | null = null;
    await act(async () => {
      try {
        await result.current.sendMessageAsync('hello', 'You');
      } catch (err) {
        caughtError = err as Error;
      }
    });

    expect(caughtError).toBeTruthy();
    expect(caughtError!.message).toBe('Not a member');
    expect(result.current.isCreating).toBe(false);
    expect(telemetry.track).toHaveBeenCalledWith('message.send.failed', {
      trip_id: 'trip-abc',
      error: 'Not a member',
      transport: 'stream',
      mode: 'async',
    });
  });

  it('retries without mentions when Stream denies CreateMention permission', async () => {
    getConfigMock.mockReturnValue(undefined);
    sendMessageMock
      .mockRejectedValueOnce(
        new Error('StreamChat error code 17: ... action CreateMention ... not allowed'),
      )
      .mockResolvedValueOnce({
        message: {
          id: 'msg-mentions-fallback',
          text: 'hello',
          created_at: new Date().toISOString(),
        },
      });

    const { result } = renderHook(() => useStreamTripChat('trip-abc', { enabled: true }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessageAsync(
        'hello',
        'You',
        undefined,
        undefined,
        'user-1',
        undefined,
        'text',
        undefined,
        undefined,
        ['user-2'],
      );
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(2);
    expect(sendMessageMock.mock.calls[0]?.[0]?.mentioned_users).toEqual(['user-2']);
    expect(sendMessageMock.mock.calls[1]?.[0]?.mentioned_users).toBeUndefined();
    expect(result.current.messages).toHaveLength(1);
  });

  it('sends without mention payload when channel config grants do not include create-mention', async () => {
    getConfigMock.mockReturnValue({
      grants: {
        channel_member: ['read-channel', 'create-message'],
      },
    });

    const { result } = renderHook(() => useStreamTripChat('trip-abc', { enabled: true }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessageAsync(
        'hello',
        'You',
        undefined,
        undefined,
        'user-1',
        undefined,
        'text',
        undefined,
        undefined,
        ['user-2'],
      );
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock.mock.calls[0]?.[0]?.mentioned_users).toBeUndefined();
  });

  it('strips legacy reply ids before sending to Stream parent_id', async () => {
    const { result } = renderHook(() => useStreamTripChat('trip-abc', { enabled: true }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      result.current.sendMessage(
        'hello',
        'You',
        undefined,
        undefined,
        'user-1',
        undefined,
        'text',
        'legacy-1',
      );
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock.mock.calls[0]?.[0]?.parent_id).toBeUndefined();
  });

  it('deterministically recovers after join preflight timeout with a single ensure-membership retry', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: { access_token: 'jwt-token' } },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('signal is aborted without reason'));

    watchMock
      .mockRejectedValueOnce(
        new Error(
          "StreamChat error code 17: GetOrCreateChannel failed with error: User 'abc' is not allowed to perform action ReadChannel",
        ),
      )
      .mockResolvedValueOnce({
        membership: { user_id: 'user-1' },
        messages: [{ id: 'msg-joined', text: 'Joined', created_at: new Date().toISOString() }],
      });

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { success: true, code: 'ok', reasonCode: 'stream_membership_synced' },
      error: null,
    } as Awaited<ReturnType<typeof supabase.functions.invoke>>);

    const { result } = renderHook(() => useStreamTripChat('trip-abc', { enabled: true }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(watchMock).toHaveBeenCalledTimes(2);
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.messages[0]?.id).toBe('msg-joined');
    fetchSpy.mockRestore();
  });

  it('recovers deterministically when initial ReadChannel fails then ensure-membership succeeds', async () => {
    watchMock
      .mockRejectedValueOnce(
        new Error(
          "StreamChat error code 17: GetOrCreateChannel failed with error: User 'abc' is not allowed to perform action ReadChannel",
        ),
      )
      .mockResolvedValueOnce({
        membership: { user_id: 'user-1' },
        messages: [
          { id: 'msg-recovered', text: 'Recovered', created_at: new Date().toISOString() },
        ],
      });

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { success: true, code: 'ok' },
      error: null,
    } as Awaited<ReturnType<typeof supabase.functions.invoke>>);

    const { result } = renderHook(() => useStreamTripChat('trip-abc', { enabled: true }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('stream-ensure-membership', {
      body: { tripId: 'trip-abc', userId: 'user-1' },
    });
    expect(watchMock).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.messages[0]?.id).toBe('msg-recovered');
  });

  it('surfaces stable user-facing error when ensure-membership fails', async () => {
    watchMock.mockRejectedValue(
      new Error(
        "StreamChat error code 17: GetOrCreateChannel failed with error: User 'abc' is not allowed to perform action ReadChannel",
      ),
    );

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: false,
        code: 'membership_required',
        reasonCode: 'trip_membership_required',
        reason: 'User is not a trip member',
      },
      error: null,
    } as Awaited<ReturnType<typeof supabase.functions.invoke>>);

    const { result } = renderHook(() => useStreamTripChat('trip-abc', { enabled: true }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toBe(
      'You no longer have access to this trip chat. Ask the trip organizer to re-add you.',
    );
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
  });

  it('reflects pinned-visible state immediately when a message is pinned', async () => {
    watchMock.mockResolvedValueOnce({
      messages: [
        {
          id: 'msg-pin',
          text: 'Pin me',
          created_at: '2026-04-01T00:00:00.000Z',
          user: { id: 'user-2' },
          pinned: false,
        },
      ],
      membership: { user_id: 'user-1' },
    });

    const { result } = renderHook(() => useStreamTripChat('trip-abc', { enabled: true }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const updatedHandler = onMock.mock.calls.find(([event]) => event === 'message.updated')?.[1];
    expect(updatedHandler).toBeTypeOf('function');

    act(() => {
      updatedHandler?.({
        message: {
          id: 'msg-pin',
          text: 'Pin me',
          created_at: '2026-04-01T00:00:00.000Z',
          user: { id: 'user-2' },
          pinned: true,
          pinned_at: '2026-04-02T00:00:00.000Z',
        },
      });
    });

    await waitFor(() => {
      expect(result.current.messages.find(message => message.id === 'msg-pin')?.pinned).toBe(true);
    });

    const pinnedVisible = derivePinnedMessages(
      result.current.messages.map(message => ({
        id: message.id ?? '',
        text: message.text ?? '',
        sender: {
          id: message.user?.id ?? 'unknown',
          name: 'User',
        },
        createdAt: message.created_at ?? '',
        isPinned: !!message.pinned,
        pinnedAt: message.pinned_at ?? undefined,
      })),
    );
    expect(pinnedVisible.map(message => message.id)).toEqual(['msg-pin']);
  });

  it('removes pinned-visible state immediately when a message is unpinned', async () => {
    watchMock.mockResolvedValueOnce({
      messages: [
        {
          id: 'msg-pin',
          text: 'Pin me',
          created_at: '2026-04-01T00:00:00.000Z',
          user: { id: 'user-2' },
          pinned: true,
          pinned_at: '2026-04-02T00:00:00.000Z',
        },
      ],
      membership: { user_id: 'user-1' },
    });

    const { result } = renderHook(() => useStreamTripChat('trip-abc', { enabled: true }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const updatedHandler = onMock.mock.calls.find(([event]) => event === 'message.updated')?.[1];
    expect(updatedHandler).toBeTypeOf('function');

    act(() => {
      updatedHandler?.({
        message: {
          id: 'msg-pin',
          text: 'Pin me',
          created_at: '2026-04-01T00:00:00.000Z',
          user: { id: 'user-2' },
          pinned: false,
          pinned_at: null,
        },
      });
    });

    await waitFor(() => {
      expect(result.current.messages.find(message => message.id === 'msg-pin')?.pinned).toBe(false);
    });

    const pinnedVisible = derivePinnedMessages(
      result.current.messages.map(message => ({
        id: message.id ?? '',
        text: message.text ?? '',
        sender: {
          id: message.user?.id ?? 'unknown',
          name: 'User',
        },
        createdAt: message.created_at ?? '',
        isPinned: !!message.pinned,
        pinnedAt: message.pinned_at ?? undefined,
      })),
    );
    expect(pinnedVisible).toHaveLength(0);
  });

  it('keeps broadcast send payload behavior unchanged', async () => {
    const { result } = renderHook(() => useStreamTripChat('trip-abc', { enabled: true }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.sendMessageAsync(
        'Broadcast update',
        'You',
        undefined,
        undefined,
        'user-1',
        undefined,
        'broadcast',
      );
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        text: 'Broadcast update',
        message_type: 'broadcast',
      }),
    );
  });
});
