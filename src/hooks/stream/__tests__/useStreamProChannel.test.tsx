import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStreamProChannel } from '../useStreamProChannel';

const watchMock = vi.fn();
const sendMessageMock = vi.fn();
const queryMock = vi.fn();
const stopWatchingMock = vi.fn();
const onMock = vi.fn();
const offMock = vi.fn();
const mockChannel = {
  watch: watchMock,
  sendMessage: sendMessageMock,
  query: queryMock,
  stopWatching: stopWatchingMock,
  on: onMock,
  off: offMock,
  state: { messages: [] },
};

const channelFactoryMock = vi.fn(() => mockChannel);
const getStreamClientMock = vi.fn();
const invokeMock = vi.fn();
let onConnectedCallback: (() => void) | null = null;
let onConnectionStatusCallback: ((isConnected: boolean) => void) | null = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock('@/services/stream/streamClient', () => ({
  getStreamClient: (...args: unknown[]) => getStreamClientMock(...args),
  onStreamClientConnected: (cb: () => void) => {
    onConnectedCallback = cb;
    return () => {
      onConnectedCallback = null;
    };
  },
  onStreamClientConnectionStatusChange: (cb: (isConnected: boolean) => void) => {
    onConnectionStatusCallback = cb;
    return () => {
      onConnectionStatusCallback = null;
    };
  },
}));

describe('useStreamProChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onConnectedCallback = null;
    onConnectionStatusCallback = null;
    watchMock.mockResolvedValue({ messages: [] });
    queryMock.mockResolvedValue({ messages: [] });
    sendMessageMock.mockResolvedValue({ message: { id: 'm1' } });
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });
    getStreamClientMock.mockReturnValue({
      userID: undefined,
      channel: channelFactoryMock,
    });
  });

  it('re-initializes channel watch after Stream client connects', async () => {
    renderHook(() => useStreamProChannel('channel-1'));

    expect(watchMock).not.toHaveBeenCalled();

    getStreamClientMock.mockReturnValue({
      userID: 'user-1',
      channel: channelFactoryMock,
    });

    await act(async () => {
      onConnectedCallback?.();
    });

    await waitFor(() => {
      expect(watchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('includes isBroadcast in Stream message payload when requested', async () => {
    getStreamClientMock.mockReturnValue({
      userID: 'user-1',
      channel: channelFactoryMock,
    });

    const { result } = renderHook(() => useStreamProChannel('channel-1'));

    await waitFor(() => {
      expect(watchMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.sendMessage('hello', { isBroadcast: true });
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock.mock.calls[0]?.[0]?.isBroadcast).toBe(true);
  });

  it('clears loading when stream disconnects before channel init can proceed', async () => {
    getStreamClientMock.mockReturnValue({
      userID: 'user-1',
      channel: channelFactoryMock,
    });
    watchMock.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ messages: [] }), 20)),
    );

    const { result } = renderHook(() => useStreamProChannel('channel-1'));

    await act(async () => {
      onConnectionStatusCallback?.(false);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('self-heals membership and re-watches when the first watch is denied', async () => {
    const recoveredMessages = [
      { id: 'm-1', text: 'recovered', user: { id: 'user-1', name: 'User 1' } },
    ];
    watchMock
      .mockRejectedValueOnce(new Error('permission denied'))
      .mockResolvedValueOnce({ messages: recoveredMessages });
    getStreamClientMock.mockReturnValue({
      userID: 'user-1',
      channel: channelFactoryMock,
    });

    const { result } = renderHook(() => useStreamProChannel('channel-1', 'trip-9'));

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
    });

    expect(invokeMock).toHaveBeenCalledWith('stream-ensure-membership', {
      body: { tripId: 'trip-9', channelId: 'channel-1' },
    });
    expect(watchMock).toHaveBeenCalledTimes(2);
  });

  it('does not attempt recovery when no tripId is provided', async () => {
    watchMock.mockRejectedValueOnce(new Error('permission denied'));
    getStreamClientMock.mockReturnValue({
      userID: 'user-1',
      channel: channelFactoryMock,
    });

    const { result } = renderHook(() => useStreamProChannel('channel-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(watchMock).toHaveBeenCalledTimes(1);
  });

  it('loads older messages with id_lt pagination and updates hasMore', async () => {
    const initialMessages = Array.from({ length: 30 }, (_, index) => ({
      id: `msg-${index + 1}`,
      text: `message-${index + 1}`,
      user: { id: 'user-1', name: 'User 1' },
      created_at: new Date().toISOString(),
    }));
    watchMock.mockResolvedValue({ messages: initialMessages });
    queryMock.mockResolvedValue({
      messages: [{ id: 'msg-0', text: 'older', user: { id: 'user-1', name: 'User 1' } }],
    });
    getStreamClientMock.mockReturnValue({
      userID: 'user-1',
      channel: channelFactoryMock,
    });

    const { result } = renderHook(() => useStreamProChannel('channel-1'));
    await waitFor(() => {
      expect(result.current.messages).toHaveLength(30);
    });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(queryMock).toHaveBeenCalledWith({
      messages: { limit: 30, id_lt: 'msg-1' },
    });
    expect(result.current.messages[0]?.id).toBe('msg-0');
    expect(result.current.hasMore).toBe(false);
  });
});
