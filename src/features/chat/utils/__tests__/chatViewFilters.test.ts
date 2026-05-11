import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/features/chat/hooks/useChatComposer';
import { getFilteredMessagesByChatView } from '../chatViewFilters';

const messages: ChatMessage[] = [
  {
    id: 'message-1',
    text: 'normal message',
    sender: { id: 'u1', name: 'User 1' },
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'broadcast-1',
    text: 'broadcast message',
    sender: { id: 'u2', name: 'User 2' },
    createdAt: '2026-01-01T00:01:00.000Z',
    isBroadcast: true,
  },
  {
    id: 'pinned-1',
    text: 'pinned message',
    sender: { id: 'u3', name: 'User 3' },
    createdAt: '2026-01-01T00:02:00.000Z',
    isPinned: true,
  } as ChatMessage,
];

describe('getFilteredMessagesByChatView', () => {
  it('normal-only -> Messages only', () => {
    const filtered = getFilteredMessagesByChatView(messages, {
      includeBroadcasts: false,
      includePinned: false,
    });

    expect(filtered.map(message => message.id)).toEqual(['message-1']);
  });

  it('broadcast-only -> Messages + Broadcasts', () => {
    const filtered = getFilteredMessagesByChatView(messages, {
      includeBroadcasts: true,
      includePinned: false,
    });

    expect(filtered.map(message => message.id)).toEqual(['message-1', 'broadcast-1']);
  });

  it('pinned-only -> Messages + Pinned', () => {
    const filtered = getFilteredMessagesByChatView(messages, {
      includeBroadcasts: false,
      includePinned: true,
    });

    expect(filtered.map(message => message.id)).toEqual(['message-1', 'pinned-1']);
  });

  it('broadcast+pinned -> Messages + Broadcasts + Pinned', () => {
    const filtered = getFilteredMessagesByChatView(messages, {
      includeBroadcasts: true,
      includePinned: true,
    });

    expect(filtered.map(message => message.id)).toEqual(['message-1', 'broadcast-1', 'pinned-1']);
  });
});
