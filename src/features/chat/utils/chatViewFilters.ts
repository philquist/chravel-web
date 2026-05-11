import { derivePinnedMessages } from './pinnedMessages';
import type { ChatMessage } from '../hooks/useChatComposer';

export interface ChatViewFilters {
  includeBroadcasts: boolean;
  includePinned: boolean;
}

export const getFilteredMessagesByChatView = (
  messages: ChatMessage[],
  { includeBroadcasts, includePinned }: ChatViewFilters,
): ChatMessage[] => {
  const baseMessages = messages.filter(message => !message.isBroadcast);

  const pinnedMessageIds = new Set(derivePinnedMessages(messages).map(message => message.id));

  if (includeBroadcasts) {
    return includePinned ? messages : messages.filter(message => !pinnedMessageIds.has(message.id));
  }

  if (!includePinned) {
    return baseMessages.filter(message => !pinnedMessageIds.has(message.id));
  }

  const normalMessageIds = new Set(baseMessages.map(message => message.id));

  return messages.filter(
    message => normalMessageIds.has(message.id) || pinnedMessageIds.has(message.id),
  );
};
