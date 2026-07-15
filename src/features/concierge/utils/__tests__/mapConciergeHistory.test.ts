import { describe, expect, it } from 'vitest';
import {
  isAiQueryHistoryRow,
  isConciergeChatMessage,
  mapAiQueryRowsToConciergeMessages,
  normalizeConciergeHistoryCache,
} from '../mapConciergeHistory';

describe('mapConciergeHistory', () => {
  const rawRows = [
    {
      id: 'row-1',
      query_text: 'Find hotels in Fort Wayne',
      response_text: 'Here are some options.',
      created_at: '2026-07-15T12:00:00Z',
      metadata: {
        functionCallPlaces: [{ name: 'Hotel Fort Wayne' }],
      },
    },
  ];

  it('maps ai_queries rows into user + assistant ChatMessage entries', () => {
    const messages = mapAiQueryRowsToConciergeMessages(rawRows);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      type: 'user',
      content: 'Find hotels in Fort Wayne',
    });
    expect(messages[1]).toMatchObject({
      type: 'assistant',
      content: 'Here are some options.',
      functionCallPlaces: [{ name: 'Hotel Fort Wayne' }],
    });
  });

  it('detects raw ai_queries rows vs mapped chat messages', () => {
    const mapped = mapAiQueryRowsToConciergeMessages(rawRows);
    expect(isAiQueryHistoryRow(rawRows[0])).toBe(true);
    expect(isConciergeChatMessage(mapped[0])).toBe(true);
    expect(isConciergeChatMessage(rawRows[0])).toBe(false);
  });

  it('normalizes legacy prefetch cache entries that stored raw rows', () => {
    const normalized = normalizeConciergeHistoryCache(rawRows);

    expect(normalized).toHaveLength(2);
    expect(normalized[0].content).toBe('Find hotels in Fort Wayne');
    expect(normalized[1].content).toBe('Here are some options.');
  });

  it('passes through already-mapped ChatMessage cache entries', () => {
    const mapped = mapAiQueryRowsToConciergeMessages(rawRows);
    expect(normalizeConciergeHistoryCache(mapped)).toEqual(mapped);
  });

  it('returns an empty array for unknown cache shapes', () => {
    expect(normalizeConciergeHistoryCache([{ foo: 'bar' }])).toEqual([]);
    expect(normalizeConciergeHistoryCache(null)).toEqual([]);
  });
});
