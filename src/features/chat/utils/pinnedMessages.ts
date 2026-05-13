export type PinnedChatMessage = {
  id: string;
  text?: string;
  sender?: { id: string; name: string; avatar?: string };
  createdAt?: string;
  created_at?: string;
  isPinned?: boolean;
  pinnedAt?: string;
};

export function isPinnedMessage(message: {
  isPinned?: boolean;
  pinned?: boolean;
  pinnedAt?: string | null;
  pinned_at?: string | null;
}) {
  if (message.isPinned === true || message.pinned === true) return true;

  if (message.isPinned === false || message.pinned === false) return false;

  return Boolean(message.pinnedAt || message.pinned_at);
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
    const aPinnedAt = Date.parse(a.pinnedAt || a.createdAt || a.created_at || '');
    const bPinnedAt = Date.parse(b.pinnedAt || b.createdAt || b.created_at || '');
    return bPinnedAt - aPinnedAt;
  });
}
