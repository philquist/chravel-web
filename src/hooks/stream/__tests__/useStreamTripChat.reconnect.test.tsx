/**
 * Chat reconnect backfill tests (Lesson: Chat backfill is mandatory on websocket reconnect)
 *
 * These tests verify that messages missed during a WebSocket disconnection
 * are fetched and merged — without duplicates — when the connection recovers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStreamTripChat } from '../useStreamTripChat';

const watchMock = vi.fn();
const queryMock = vi.fn();
const onMock = vi.fn();
const offMock = vi.fn();

const mockChannel = {
  watch: watchMock,
  query: queryMock,
  stopWatching: vi.fn(),
  on: onMock,
  off: offMock,
  sendMessage: vi.fn(),
  sendReaction: vi.fn(),
  deleteReaction: vi.fn(),
  getConfig: vi.fn().mockReturnValue({}),
  state: { messages: [] as unknown[] },
};

// Capture the reconnect callback so tests can trigger it
let connectionStatusCallback: (connected: boolean) => void = () => {};

vi.mock('@/services/stream/streamClient', () => ({
  connectStreamClient: vi.fn().mockResolvedValue({
    userID: 'user-1',
    channel: vi.fn(() => mockChannel),
    partialUpdateMessage: vi.fn(),
  }),
  getStreamApiKey: vi.fn(() => 'stream-key'),
  getStreamClient: vi.fn(() => ({
    userID: 'user-1',
    channel: vi.fn(() => mockChannel),
    partialUpdateMessage: vi.fn(),
  })),
  onStreamClientConnected: vi.fn(() => () => {}),
  onStreamClientConnectionStatusChange: vi.fn((cb: (connected: boolean) => void) => {
    connectionStatusCallback = cb;
    return () => {};
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
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

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: { access_token: 'token' } }),
}));

vi.mock('@/telemetry/service', () => ({ telemetry: { track: vi.fn() } }));

vi.mock('@/telemetry/events', () => ({
  messageEvents: {
    messageReceived: vi.fn(),
    messageSent: vi.fn(),
    sent: vi.fn(),
    sendFailed: vi.fn(),
    sendFailedAsync: vi.fn(),
  },
  streamReliabilityEvents: {
    timeToFirstMessage: vi.fn(),
    reconnectBackfill: vi.fn(),
    membershipRecoveryAttempt: vi.fn(),
  },
}));

vi.mock('@/services/stream/streamCanary', () => ({
  isStreamCanaryEnabledForUser: vi.fn().mockResolvedValue(false),
  reportStreamCanaryIncident: vi.fn(),
}));

// global.fetch mock to avoid real network calls in the stream-join-channel preflight
global.fetch = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });

const MSG_A = {
  id: 'msg-a',
  text: 'first',
  created_at: '2026-01-01T10:00:00.000Z',
  type: 'regular',
};
const MSG_B = {
  id: 'msg-b',
  text: 'missed',
  created_at: '2026-01-01T11:00:00.000Z',
  type: 'regular',
};

describe('useStreamTripChat – reconnect backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectionStatusCallback = () => {};
    onMock.mockImplementation(() => mockChannel);
    offMock.mockImplementation(() => mockChannel);
    queryMock.mockResolvedValue({ messages: [] });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    });
  });

  it('calls channel.query on reconnect once initial messages are loaded', async () => {
    watchMock.mockResolvedValue({
      membership: { user_id: 'user-1' },
      messages: [MSG_A],
    });

    const { result } = renderHook(() => useStreamTripChat('trip-1', { enabled: true }));

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
    });

    queryMock.mockClear();
    queryMock.mockResolvedValueOnce({ messages: [] });

    await act(async () => {
      connectionStatusCallback(true);
    });

    expect(queryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.objectContaining({
          created_at_after: MSG_A.created_at,
          limit: 100,
        }),
      }),
    );
  });

  it('merges backfilled messages without duplicates', async () => {
    watchMock.mockResolvedValue({
      membership: { user_id: 'user-1' },
      messages: [MSG_A],
    });

    const { result } = renderHook(() => useStreamTripChat('trip-1', { enabled: true }));

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
    });

    queryMock.mockResolvedValueOnce({ messages: [MSG_B] });

    await act(async () => {
      connectionStatusCallback(true);
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    const ids = result.current.messages.map(m => m.id);
    expect(ids).toContain('msg-a');
    expect(ids).toContain('msg-b');
  });

  it('deduplicates messages already in state from backfill response', async () => {
    watchMock.mockResolvedValue({
      membership: { user_id: 'user-1' },
      messages: [MSG_A, MSG_B],
    });

    const { result } = renderHook(() => useStreamTripChat('trip-1', { enabled: true }));

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    // Backfill returns both already-present messages (overlap scenario)
    queryMock.mockResolvedValueOnce({ messages: [MSG_A, MSG_B] });

    await act(async () => {
      connectionStatusCallback(true);
    });

    // No duplicates — still exactly 2 messages
    expect(result.current.messages).toHaveLength(2);
  });

  it('does not trigger backfill query before initial hydration', async () => {
    // Watch never resolves — hook never sets messages
    watchMock.mockReturnValue(new Promise(() => {}));

    renderHook(() => useStreamTripChat('trip-1', { enabled: true }));

    await act(async () => {
      connectionStatusCallback(true);
    });

    // No backfill query because hasHydratedMessagesRef is false
    const backfillCalls = queryMock.mock.calls.filter(
      call =>
        call[0] &&
        typeof call[0] === 'object' &&
        call[0].messages &&
        'created_at_after' in call[0].messages,
    );
    expect(backfillCalls).toHaveLength(0);
  });

  it('does not crash when backfill query fails', async () => {
    watchMock.mockResolvedValue({
      membership: { user_id: 'user-1' },
      messages: [MSG_A],
    });

    const { result } = renderHook(() => useStreamTripChat('trip-1', { enabled: true }));

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
    });

    queryMock.mockRejectedValueOnce(new Error('Stream query failed'));

    await act(async () => {
      connectionStatusCallback(true);
    });

    // Hook remains stable, messages unchanged
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('sorts merged messages chronologically after backfill', async () => {
    const MSG_EARLY = {
      id: 'msg-early',
      text: 'early',
      created_at: '2026-01-01T09:00:00.000Z',
      type: 'regular',
    };

    watchMock.mockResolvedValue({
      membership: { user_id: 'user-1' },
      messages: [MSG_A], // 10:00
    });

    const { result } = renderHook(() => useStreamTripChat('trip-1', { enabled: true }));

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
    });

    // Backfill returns newer message and one that pre-dates MSG_A
    queryMock.mockResolvedValueOnce({ messages: [MSG_B, MSG_EARLY] });

    await act(async () => {
      connectionStatusCallback(true);
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(3);
    });

    const [first, second, third] = result.current.messages;
    expect(first.id).toBe('msg-early'); // 09:00
    expect(second.id).toBe('msg-a'); // 10:00
    expect(third.id).toBe('msg-b'); // 11:00
  });
});
