import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  type EventHandler = (...args: unknown[]) => void;

  class FakeRoom {
    public static latestRoomInstance: FakeRoom | null = null;
    public handlers = new Map<string, EventHandler[]>();
    public remoteParticipants = new Map();
    public localParticipant = {
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
    };

    constructor() {
      FakeRoom.latestRoomInstance = this;
    }

    on(event: string, handler: EventHandler): void {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    connect = vi.fn().mockResolvedValue(undefined);

    disconnect = vi.fn();

    trigger(event: string, ...args: unknown[]): void {
      const handlers = this.handlers.get(event) ?? [];
      handlers.forEach(handler => handler(...args));
    }
  }

  return {
    getLatestRoom: () => FakeRoom.latestRoomInstance,
    resetLatestRoom: () => {
      FakeRoom.latestRoomInstance = null;
    },
    FakeRoom,
    roomEvent: {
      DataReceived: 'data_received',
      ParticipantConnected: 'participant_connected',
      Disconnected: 'disconnected',
    },
    getSession: vi.fn(),
    fetch: vi.fn(),
  };
});

vi.mock('livekit-client', () => ({
  Room: mocks.FakeRoom,
  RoomEvent: mocks.roomEvent,
  Track: {},
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

import { LIVEKIT_WS_URL } from '@/config/voiceFeatureFlags';
import { useLiveKitVoice } from '../useLiveKitVoice';

describe('useLiveKitVoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetLatestRoom();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-access-token' } },
    });
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ token: 'livekit-token' }),
    });
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  type HookResult = ReturnType<typeof useLiveKitVoice>;

  async function startSessionAndJoin(result: {
    current: HookResult;
  }): Promise<InstanceType<typeof mocks.FakeRoom>> {
    let startPromise!: Promise<void>;

    await act(async () => {
      startPromise = result.current.startSession();
    });

    await waitFor(() => {
      expect(mocks.getLatestRoom()).not.toBeNull();
    });

    const room = mocks.getLatestRoom() as InstanceType<typeof mocks.FakeRoom>;

    await act(async () => {
      room.trigger(mocks.roomEvent.ParticipantConnected, { identity: 'agent-test' });
      await startPromise;
    });

    await waitFor(() => {
      expect(result.current.state).toBe('listening');
    });

    return room;
  }

  it('uses the centralized LiveKit URL and reads the latest data-message callbacks', async () => {
    const firstTurnComplete = vi.fn();
    const secondTurnComplete = vi.fn();
    const firstRichCard = vi.fn();
    const secondRichCard = vi.fn();

    const { result, rerender } = renderHook(
      ({ onTurnComplete, onRichCard }) =>
        useLiveKitVoice({
          tripId: 'trip-123',
          onTurnComplete,
          onRichCard,
        }),
      {
        initialProps: {
          onTurnComplete: firstTurnComplete,
          onRichCard: firstRichCard,
        },
      },
    );

    const room = await startSessionAndJoin(result);

    expect(room.connect).toHaveBeenCalledWith(LIVEKIT_WS_URL, 'livekit-token');

    rerender({
      onTurnComplete: secondTurnComplete,
      onRichCard: secondRichCard,
    });

    const payload = (body: Record<string, unknown>): Uint8Array =>
      new TextEncoder().encode(JSON.stringify(body));

    await act(async () => {
      room.trigger(
        mocks.roomEvent.DataReceived,
        payload({ toolName: 'searchPlaces', cardData: { title: 'Cafe' } }),
        null,
        null,
        'rich_card',
      );
      room.trigger(
        mocks.roomEvent.DataReceived,
        payload({ userText: 'hello', assistantText: 'hi there', toolResults: [] }),
        null,
        null,
        'turn_complete',
      );
    });

    expect(firstRichCard).not.toHaveBeenCalled();
    expect(firstTurnComplete).not.toHaveBeenCalled();
    expect(secondRichCard).toHaveBeenCalledWith('searchPlaces', { title: 'Cafe' });
    expect(secondTurnComplete).toHaveBeenCalledWith(
      'hello',
      'hi there',
      [],
      expect.objectContaining({ userText: 'hello', assistantText: 'hi there', toolResults: [] }),
      expect.any(Function),
    );
  });

  it('surfaces reconnecting hook state while keeping diagnostics in the supported connection union', async () => {
    const { result } = renderHook(() =>
      useLiveKitVoice({
        tripId: 'trip-456',
      }),
    );

    const room = await startSessionAndJoin(result);

    vi.useFakeTimers();

    await act(async () => {
      room.trigger(mocks.roomEvent.Disconnected);
      await Promise.resolve();
    });

    expect(result.current.state).toBe('reconnecting');
    expect(result.current.diagnostics.connectionStatus).toBe('connecting');
    expect(result.current.diagnostics.substep).toContain('Reconnecting (attempt 1/3)');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(room.connect).toHaveBeenNthCalledWith(2, LIVEKIT_WS_URL, 'livekit-token');
    expect(result.current.state).toBe('ready');
    expect(result.current.diagnostics.connectionStatus).toBe('open');
  });

  it('fails fast when agent does not join within the 10s readiness window', async () => {
    const { result } = renderHook(() =>
      useLiveKitVoice({
        tripId: 'trip-timeout',
      }),
    );

    await act(async () => {
      await result.current.startSession();
    });

    expect(result.current.state).toBe('error');
    expect(result.current.error).toContain('Agent did not join within timeout');
  }, 15_000);

  it('returns to idle cleanly after stop/disconnect', async () => {
    const { result } = renderHook(() =>
      useLiveKitVoice({
        tripId: 'trip-stop',
      }),
    );

    const room = await startSessionAndJoin(result);

    await act(async () => {
      await result.current.endSession();
    });

    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('idle');
    expect(result.current.userTranscript).toBe('');
    expect(result.current.assistantTranscript).toBe('');
    expect(result.current.diagnostics.connectionStatus).toBe('closed');
  });
});
