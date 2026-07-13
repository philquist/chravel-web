import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChannelUnreadCounts } from '../useChannelUnreadCounts';

type StreamEvent = Record<string, unknown>;

const listeners = new Set<(event: StreamEvent) => void>();
const queryChannelsMock = vi.fn();
const onMock = vi.fn((handler: (event: StreamEvent) => void) => {
  listeners.add(handler);
  return { unsubscribe: () => listeners.delete(handler) };
});

let fakeClient: {
  userID: string | undefined;
  queryChannels: typeof queryChannelsMock;
  on: typeof onMock;
} | null = null;

vi.mock('@/services/stream/streamClient', () => ({
  getStreamClient: () => fakeClient,
  onStreamClientConnected: vi.fn(() => () => {}),
  onStreamClientConnectionStatusChange: vi.fn(() => () => {}),
}));

const emit = (event: StreamEvent) => {
  listeners.forEach(listener => listener(event));
};

const streamChannel = (supabaseId: string, unread: number) => ({
  cid: `chravel-channel:channel-${supabaseId}`,
  countUnread: () => unread,
  state: { read: {} },
});

describe('useChannelUnreadCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    fakeClient = { userID: 'user-1', queryChannels: queryChannelsMock, on: onMock };
    queryChannelsMock.mockResolvedValue([]);
  });

  it('returns empty and stays idle when disabled', async () => {
    const { result } = renderHook(() =>
      useChannelUnreadCounts({ channelIds: ['c1'], enabled: false }),
    );
    expect(result.current.counts).toEqual({});
    expect(queryChannelsMock).not.toHaveBeenCalled();
    expect(onMock).not.toHaveBeenCalled();
  });

  it('seeds counts from queryChannels with the pro-channel cid filter, watch off', async () => {
    queryChannelsMock.mockResolvedValue([streamChannel('c1', 3), streamChannel('c2', 0)]);

    const { result } = renderHook(() =>
      useChannelUnreadCounts({ channelIds: ['c1', 'c2'], enabled: true }),
    );

    await waitFor(() => {
      expect(result.current.counts).toEqual({ c1: 3, c2: 0 });
    });
    expect(result.current.totalUnread).toBe(3);

    const [filter, , options] = queryChannelsMock.mock.calls[0];
    expect(filter).toEqual({
      type: 'chravel-channel',
      cid: { $in: ['chravel-channel:channel-c1', 'chravel-channel:channel-c2'] },
    });
    expect(options).toMatchObject({ watch: false, state: true });
  });

  it('increments on notification.message_new from others; ignores own and active channel', async () => {
    queryChannelsMock.mockResolvedValue([streamChannel('c1', 0), streamChannel('c2', 0)]);

    const { result } = renderHook(() =>
      useChannelUnreadCounts({ channelIds: ['c1', 'c2'], enabled: true, activeChannelId: 'c2' }),
    );
    await waitFor(() => expect(queryChannelsMock).toHaveBeenCalled());

    act(() => {
      emit({
        type: 'notification.message_new',
        cid: 'chravel-channel:channel-c1',
        user: { id: 'user-2' },
      });
      // Own message — must not count
      emit({
        type: 'notification.message_new',
        cid: 'chravel-channel:channel-c1',
        user: { id: 'user-1' },
      });
      // Active channel — must not count
      emit({
        type: 'message.new',
        cid: 'chravel-channel:channel-c2',
        user: { id: 'user-2' },
      });
      // Unrelated channel — ignored entirely
      emit({
        type: 'notification.message_new',
        cid: 'chravel-trip:trip-xyz',
        user: { id: 'user-2' },
      });
    });

    await waitFor(() => {
      expect(result.current.counts.c1).toBe(1);
    });
    expect(result.current.counts.c2 ?? 0).toBe(0);
  });

  it('zeroes a channel on own mark_read but not on other users reads', async () => {
    queryChannelsMock.mockResolvedValue([streamChannel('c1', 5)]);

    const { result } = renderHook(() =>
      useChannelUnreadCounts({ channelIds: ['c1'], enabled: true }),
    );
    await waitFor(() => expect(result.current.counts.c1).toBe(5));

    act(() => {
      emit({
        type: 'message.read',
        cid: 'chravel-channel:channel-c1',
        user: { id: 'someone-else' },
      });
    });
    expect(result.current.counts.c1).toBe(5);

    act(() => {
      emit({
        type: 'notification.mark_read',
        cid: 'chravel-channel:channel-c1',
        user: { id: 'user-1' },
      });
    });
    await waitFor(() => expect(result.current.counts.c1).toBe(0));
  });

  it('zeroes the newly opened channel immediately', async () => {
    queryChannelsMock.mockResolvedValue([streamChannel('c1', 4)]);

    const { result, rerender } = renderHook(
      ({ activeChannelId }: { activeChannelId: string | null }) =>
        useChannelUnreadCounts({ channelIds: ['c1'], enabled: true, activeChannelId }),
      { initialProps: { activeChannelId: null as string | null } },
    );
    await waitFor(() => expect(result.current.counts.c1).toBe(4));

    rerender({ activeChannelId: 'c1' });
    await waitFor(() => expect(result.current.counts.c1).toBe(0));
  });

  it('unsubscribes the client listener on unmount', async () => {
    queryChannelsMock.mockResolvedValue([streamChannel('c1', 1)]);
    const { unmount } = renderHook(() =>
      useChannelUnreadCounts({ channelIds: ['c1'], enabled: true }),
    );
    await waitFor(() => expect(onMock).toHaveBeenCalled());
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
