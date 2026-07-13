import { describe, expect, it } from 'vitest';

interface ChatMessage {
  id: string;
  trip_id: string;
  content: string;
  created_at: string;
}

function appendAndSort(messages: ChatMessage[], next: ChatMessage): ChatMessage[] {
  return [...messages, next].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

describe('Chat Message Send → Receive Flow', () => {
  it('adds the sent message to trip chat history in chronological order', () => {
    const result = appendAndSort(
      [{ id: 'later', trip_id: 'trip-1', content: 'Later', created_at: '2026-01-01T10:05:00Z' }],
      {
        id: 'sent',
        trip_id: 'trip-1',
        content: 'Hello everyone!',
        created_at: '2026-01-01T10:00:00Z',
      },
    );

    expect(result.map(message => message.content)).toEqual(['Hello everyone!', 'Later']);
  });
});
