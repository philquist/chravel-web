import { getStreamClient } from '@/services/stream/streamClient';
import { CHANNEL_TYPE_TRIP, tripChannelId } from '@/services/stream/streamChannelFactory';

const DEFAULT_PER_CHANNEL_LIMIT = 20;
const DEFAULT_CHANNEL_SCAN_LIMIT = 100;
const DEFAULT_AGGREGATION_LIMIT = 20;

export interface StreamMessageSearchHit {
  messageId: string;
  tripId: string;
  /** Stream channel custom `name` (trip chat title); set for multi-channel universal search. */
  tripName?: string;
  channelType: string;
  channelId: string;
  authorId: string | null;
  authorName: string;
  text: string;
  createdAt?: string;
  threadParentId?: string;
}

interface SearchTripChannelMessagesOptions {
  tripId: string;
  query: string;
  limit?: number;
  offset?: number;
}

interface SearchMessagesAcrossTripsOptions {
  query: string;
  tripIds?: string[];
  perChannelLimit?: number;
  maxChannels?: number;
  maxAggregatedResults?: number;
  offset?: number;
}

function mapChannelSearchHit(
  message: {
    id: string;
    text?: string;
    user?: { id?: string; name?: string };
    created_at?: string;
    parent_id?: string;
  },
  params: {
    tripId: string;
    channelType: string;
    channelId: string;
    tripName?: string;
  },
): StreamMessageSearchHit {
  return {
    messageId: message.id,
    tripId: params.tripId,
    tripName: params.tripName,
    channelType: params.channelType,
    channelId: params.channelId,
    authorId: message.user?.id || null,
    authorName: message.user?.name || message.user?.id || 'User',
    text: message.text || '',
    createdAt: message.created_at || undefined,
    threadParentId: message.parent_id || undefined,
  };
}

export async function searchTripChannelMessages({
  tripId,
  query,
  limit = DEFAULT_PER_CHANNEL_LIMIT,
  offset = 0,
}: SearchTripChannelMessagesOptions): Promise<StreamMessageSearchHit[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const client = getStreamClient();
  if (!client?.userID) return [];

  try {
    const channelType = CHANNEL_TYPE_TRIP;
    const channelId = tripChannelId(tripId);
    const channel = client.channel(channelType, channelId);
    const result = await channel.search(normalizedQuery, {
      limit,
      offset,
    });

    return (result.results || []).map(item =>
      mapChannelSearchHit(item.message, {
        tripId,
        channelType,
        channelId,
      }),
    );
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[StreamMessageSearch] Trip search failed:', error);
    }
    return [];
  }
}

export async function searchMessagesAcrossTripChannels({
  query,
  tripIds,
  perChannelLimit = DEFAULT_PER_CHANNEL_LIMIT,
  maxChannels = DEFAULT_CHANNEL_SCAN_LIMIT,
  maxAggregatedResults = DEFAULT_AGGREGATION_LIMIT,
  offset = 0,
}: SearchMessagesAcrossTripsOptions): Promise<StreamMessageSearchHit[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const client = getStreamClient();
  if (!client?.userID) return [];

  try {
    const filter: Record<string, unknown> = { type: CHANNEL_TYPE_TRIP };
    if (tripIds && tripIds.length > 0) {
      filter.id = { $in: tripIds.map(id => tripChannelId(id)) };
    }

    const channels = await client.queryChannels(
      filter,
      { last_message_at: -1 },
      { limit: maxChannels },
    );

    const perChannelHits = await Promise.all(
      channels.map(async channel => {
        const channelData = (channel.data ?? {}) as Record<string, unknown>;
        const tripId = String((channelData.trip_id as string | undefined) || '').trim();
        if (!tripId) return [] as StreamMessageSearchHit[];

        const result = await channel.search(normalizedQuery, {
          limit: perChannelLimit,
          offset,
        });

        const channelType = String(channel.type || CHANNEL_TYPE_TRIP);
        const channelId = String(channel.id || '').trim();
        const tripName = String((channelData.name as string | undefined) || 'Trip');

        return (result.results || []).map(item =>
          mapChannelSearchHit(item.message, {
            tripId,
            channelType,
            channelId,
            tripName,
          }),
        );
      }),
    );

    return perChannelHits.flat().slice(0, maxAggregatedResults);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[StreamMessageSearch] Multi-trip search failed:', error);
    }
    return [];
  }
}
