import type { ChatMessage } from '../hooks/useChatComposer';

export type PinnedChatMessage = ChatMessage & {
  isPinned?: boolean;
  pinnedAt?: string;
};

export function isPinnedMessage<T extends { isPinned?: boolean }>(message: T) {
  return message.isPinned === true;
}

/**
 * Stream may deliver updated message snapshots more than once while events settle.
 * Keep only one entry per message id and return newest pinned-first order.
 */
export function derivePinnedMessages(messages: PinnedChatMessage[]) {
  const dedupedById = new Map<string, PinnedChatMessage>();

  for (const message of messages) {
    if (!isPinnedMessage(message)) {
      dedupedById.delete(message.id);
      continue;
    }
    dedupedById.set(message.id, {
      ...message,
    });
  }

  return Array.from(dedupedById.values()).sort((a, b) => {
    const aPinnedAt = Date.parse(a.pinnedAt || a.createdAt || '');
    const bPinnedAt = Date.parse(b.pinnedAt || b.createdAt || '');
    return bPinnedAt - aPinnedAt;
  });
}
