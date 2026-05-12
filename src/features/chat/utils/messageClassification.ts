export type ChatViewFilter = 'all' | 'broadcasts' | 'pinned' | 'channels';

type MessageClassificationShape = {
  isBroadcast?: boolean;
  isPinned?: boolean;
};

export function isBroadcastMessage<T extends MessageClassificationShape>(message: T) {
  return message.isBroadcast === true;
}

export function isPinnedMessage<T extends MessageClassificationShape>(message: T) {
  return message.isPinned === true;
}

export function getFilteredMessagesByChatView<T extends MessageClassificationShape>(
  messages: T[],
  filter: ChatViewFilter,
) {
  if (filter === 'all') return messages;
  if (filter === 'broadcasts') return messages.filter(isBroadcastMessage);
  if (filter === 'pinned') return messages.filter(isPinnedMessage);
  if (filter === 'channels') return [];
  return messages;
}
