import type { ChannelMessage } from '@/types/roleChannels';
import type { MessageResponse } from 'stream-chat';

type ReactionState = { count: number; userReacted: boolean; users: string[] };
type ReactionMap = Record<string, Record<string, ReactionState>>;
type PendingReactionIntent = Record<string, Record<string, boolean>>;

export function mapStreamMessagesToChannelMessages(
  streamMessages: MessageResponse[],
  channelId: string,
): ChannelMessage[] {
  const streamById = new Map<string, MessageResponse>(
    streamMessages.map(message => [String(message.id), message]),
  );

  return streamMessages.map(streamMessage => {
    const parentId = streamMessage.parent_id ?? undefined;
    const parent = parentId ? streamById.get(parentId) : undefined;
    const streamExtra = streamMessage as MessageResponse & { isBroadcast?: boolean };
    const metadata: Record<string, unknown> = {};

    if (parent) {
      metadata.replyTo = {
        id: String(parent.id),
        text: parent.text || '',
        sender: parent.user?.name || 'Unknown',
      };
    }
    if (streamExtra.isBroadcast) {
      metadata.isBroadcast = true;
    }

    return {
      id: String(streamMessage.id),
      channelId,
      senderId: streamMessage.user?.id || '',
      senderName: streamMessage.user?.name || 'Unknown',
      senderAvatar: streamMessage.user?.image,
      content: streamMessage.text || '',
      messageType: streamExtra.isBroadcast ? 'system' : 'text',
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      createdAt: streamMessage.created_at || new Date().toISOString(),
    };
  });
}

export function mapStreamReactionMap(streamMessages: MessageResponse[]): ReactionMap {
  return streamMessages.reduce<ReactionMap>((acc, streamMessage) => {
    const counts = (streamMessage.reaction_counts || {}) as Record<string, number>;
    const own = new Set((streamMessage.own_reactions || []).map(reaction => reaction.type));
    const latest = (streamMessage.latest_reactions || []) as Array<{
      type: string;
      user?: { id?: string };
    }>;

    const byType: Record<string, ReactionState> = {};
    Object.entries(counts).forEach(([type, count]) => {
      const users = latest
        .filter(reaction => reaction.type === type && reaction.user?.id)
        .map(reaction => reaction.user?.id as string);

      byType[type] = {
        count,
        userReacted: own.has(type),
        users: Array.from(new Set(users)),
      };
    });

    acc[String(streamMessage.id)] = byType;
    return acc;
  }, {});
}

export function applyPendingReactionOverlay(
  reactionMap: ReactionMap,
  pendingIntents: PendingReactionIntent,
  userId: string | null | undefined,
): ReactionMap {
  if (!userId) return reactionMap;

  const overlaid: ReactionMap = { ...reactionMap };
  Object.entries(pendingIntents).forEach(([messageId, intentsByType]) => {
    Object.entries(intentsByType).forEach(([reactionType, expectedUserReacted]) => {
      // Clone the per-message object — the top-level spread above is shallow,
      // so writing into reactionMap's inner object would mutate the caller's
      // base map. That mutation made the reconciliation effect see Stream
      // state as already-matching (instantly clearing pending intents) and
      // left phantom reactions behind when a Stream write failed.
      const currentByType = { ...(overlaid[messageId] || {}) };
      const currentReaction = currentByType[reactionType] || {
        count: 0,
        userReacted: false,
        users: [],
      };

      if (currentReaction.userReacted === expectedUserReacted) return;

      currentByType[reactionType] = {
        count: expectedUserReacted
          ? currentReaction.count + 1
          : Math.max(0, currentReaction.count - 1),
        userReacted: expectedUserReacted,
        users: expectedUserReacted
          ? Array.from(new Set([...currentReaction.users, userId]))
          : currentReaction.users.filter(id => id !== userId),
      };
      overlaid[messageId] = currentByType;
    });
  });

  return overlaid;
}
