import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, sendMessageMock, getStreamClientMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  sendMessageMock: vi.fn(),
  getStreamClientMock: vi.fn(),
}));

vi.mock('../../integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock('../stream/streamClient', () => ({
  getStreamClient: () => getStreamClientMock(),
}));

import { systemMessageService } from '../systemMessageService';
import { CHANNEL_TYPE_TRIP, tripChannelId } from '../stream/streamChannelFactory';

const REAL_TRIP = '00000000-0000-0000-0000-000000000aaa';

const setupConsumerTrip = (): void => {
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { trip_type: 'consumer' } }) }),
    }),
  });
};

const setupProTrip = (): void => {
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { trip_type: 'pro' } }) }),
    }),
  });
};

const setupConnectedClient = (): { channelMock: ReturnType<typeof vi.fn> } => {
  const channelMock = vi.fn(() => ({
    sendMessage: sendMessageMock,
  }));
  getStreamClientMock.mockReturnValue({ userID: 'user-1', channel: channelMock });
  return { channelMock };
};

describe('systemMessageService — Stream emission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    systemMessageService._clearTripTypeCache();
    sendMessageMock.mockResolvedValue({});
  });

  it('emits to Stream trip channel as message_type=system with silent flag for consumer trips', async () => {
    setupConsumerTrip();
    const { channelMock } = setupConnectedClient();

    const ok = await systemMessageService.pollCreated(
      REAL_TRIP,
      'Alice',
      'poll-1',
      'Beach or pool?',
    );

    expect(ok).toBe(true);
    expect(channelMock).toHaveBeenCalledWith(CHANNEL_TYPE_TRIP, tripChannelId(REAL_TRIP));
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const [payload, options] = sendMessageMock.mock.calls[0];
    expect(payload).toMatchObject({
      message_type: 'system',
      system_event_type: 'poll_created',
      silent: true,
    });
    expect(payload.text).toContain('Alice');
    expect(payload.text).toContain('Beach or pool?');
    expect(payload.system_payload).toMatchObject({ pollId: 'poll-1' });
    expect(options).toEqual({ skip_push: true });
  });

  it('emits to Stream for pro trips (same contract as consumer)', async () => {
    setupProTrip();
    const { channelMock } = setupConnectedClient();

    const ok = await systemMessageService.taskCreated(REAL_TRIP, 'Bob', 'task-1', 'Pack');

    expect(ok).toBe(true);
    expect(channelMock).toHaveBeenCalledWith(CHANNEL_TYPE_TRIP, tripChannelId(REAL_TRIP));
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const [payload] = sendMessageMock.mock.calls[0];
    expect(payload).toMatchObject({
      message_type: 'system',
      system_event_type: 'task_created',
      silent: true,
    });
  });

  it('returns false (no throw) when Stream client is not connected', async () => {
    setupConsumerTrip();
    getStreamClientMock.mockReturnValue(null);

    const ok = await systemMessageService.calendarItemAdded(
      REAL_TRIP,
      'Alice',
      'event-1',
      'Dinner',
    );

    expect(ok).toBe(false);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('caches trip-type lookup across sequential emits', async () => {
    setupConsumerTrip();
    setupConnectedClient();

    await systemMessageService.pollCreated(REAL_TRIP, 'Alice', 'p1', 'Q1');
    await systemMessageService.pollCreated(REAL_TRIP, 'Alice', 'p2', 'Q2');

    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('mock consumer trip IDs (1..12) skip the DB lookup', async () => {
    setupConnectedClient();
    // No fromMock setup — should never be called
    fromMock.mockImplementation(() => {
      throw new Error('Should not query DB for mock trips');
    });

    const ok = await systemMessageService.pollCreated('1', 'Alice', 'p1', 'Q');
    expect(ok).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
