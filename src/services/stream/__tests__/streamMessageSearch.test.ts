import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  searchMessagesAcrossTripChannels,
  searchTripChannelMessages,
} from '../streamMessageSearch';

const getStreamClientMock = vi.fn();

vi.mock('@/services/stream/streamClient', () => ({
  getStreamClient: () => getStreamClientMock(),
}));

describe('streamMessageSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty results for empty queries', async () => {
    const tripResult = await searchTripChannelMessages({ tripId: 'trip-1', query: '   ' });
    const multiResult = await searchMessagesAcrossTripChannels({ query: '' });

    expect(tripResult).toEqual([]);
    expect(multiResult).toEqual([]);
    expect(getStreamClientMock).not.toHaveBeenCalled();
  });

  it('returns empty results when stream client is disconnected', async () => {
    getStreamClientMock.mockReturnValue(null);

    const result = await searchMessagesAcrossTripChannels({ query: 'dinner' });

    expect(result).toEqual([]);
  });

  it('passes the normalized text query to Stream trip search so terms are full-text indexed', async () => {
    const channelSearch = vi.fn().mockResolvedValue({
      results: [
        {
          message: {
            id: 'm-join',
            text: 'join this trip',
            user: { id: 'u-1', name: 'Alex' },
            created_at: '2026-06-21T12:00:00.000Z',
          },
        },
      ],
    });
    const channel = vi.fn().mockReturnValue({ search: channelSearch });

    getStreamClientMock.mockReturnValue({
      userID: 'stream-user',
      channel,
    });

    const results = await searchTripChannelMessages({
      tripId: 'trip-1',
      query: ' join ',
      limit: 10,
    });

    expect(channelSearch).toHaveBeenCalledWith('join', { limit: 10, offset: 0 });
    expect(results).toEqual([
      {
        messageId: 'm-join',
        tripId: 'trip-1',
        channelType: 'chravel-trip',
        channelId: 'trip-trip-1',
        authorId: 'u-1',
        authorName: 'Alex',
        text: 'join this trip',
        createdAt: '2026-06-21T12:00:00.000Z',
        threadParentId: undefined,
      },
    ]);
  });

  it('enforces aggregated multi-channel result limits', async () => {
    const channelOneSearch = vi.fn().mockResolvedValue({
      results: [
        {
          message: {
            id: 'm-1',
            text: 'first',
            user: { id: 'u-1', name: 'A' },
            created_at: '2026-01-01T00:00:00.000Z',
          },
        },
        {
          message: {
            id: 'm-2',
            text: 'second',
            user: { id: 'u-2', name: 'B' },
            created_at: '2026-01-01T00:00:01.000Z',
          },
        },
      ],
    });

    const channelTwoSearch = vi.fn().mockResolvedValue({
      results: [
        {
          message: {
            id: 'm-3',
            text: 'third',
            user: { id: 'u-3', name: 'C' },
            created_at: '2026-01-01T00:00:02.000Z',
            parent_id: 'parent-1',
          },
        },
      ],
    });

    getStreamClientMock.mockReturnValue({
      userID: 'stream-user',
      queryChannels: vi.fn().mockResolvedValue([
        {
          id: 'trip-trip-1',
          type: 'chravel-trip',
          data: { trip_id: 'trip-1', name: 'Alpha Trip' },
          search: channelOneSearch,
        },
        {
          id: 'trip-trip-2',
          type: 'chravel-trip',
          data: { trip_id: 'trip-2', name: 'Beta Trip' },
          search: channelTwoSearch,
        },
      ]),
    });

    const results = await searchMessagesAcrossTripChannels({
      query: 'trip',
      perChannelLimit: 2,
      maxAggregatedResults: 2,
    });

    expect(results).toHaveLength(2);
    expect(results[0].messageId).toBe('m-1');
    expect(results[0].tripName).toBe('Alpha Trip');
    expect(results[1].messageId).toBe('m-2');
    expect(results[1].tripName).toBe('Alpha Trip');
    expect(channelOneSearch).toHaveBeenCalledWith('trip', { limit: 2, offset: 0 });
    expect(channelTwoSearch).toHaveBeenCalledWith('trip', { limit: 2, offset: 0 });
  });
});
