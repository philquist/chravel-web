import { describe, it, expect } from 'vitest';
import { derivePinnedMessages } from '../pinnedMessages';
import { isPinnedMessage } from '../messageClassification';

describe('derivePinnedMessages', () => {
  it('returns pinned messages sorted by pinned_at desc', () => {
    const pinned = derivePinnedMessages([
      {
        id: 'a',
        text: 'first',
        sender: { id: 'u1', name: 'A' },
        createdAt: '2026-01-01T00:00:00.000Z',
        isPinned: true,
        pinnedAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'b',
        text: 'second',
        sender: { id: 'u2', name: 'B' },
        createdAt: '2026-01-01T00:00:00.000Z',
        isPinned: true,
        pinnedAt: '2026-01-03T00:00:00.000Z',
      },
    ]);

    expect(pinned.map(message => message.id)).toEqual(['b', 'a']);
  });

  it('keeps list consistent when Stream emits mixed pin/unpin snapshots for same id', () => {
    const pinned = derivePinnedMessages([
      {
        id: 'x',
        text: 'hello',
        sender: { id: 'u1', name: 'A' },
        createdAt: '2026-01-01T00:00:00.000Z',
        isPinned: true,
        pinnedAt: '2026-01-03T00:00:00.000Z',
      },
      {
        id: 'x',
        text: 'hello',
        sender: { id: 'u1', name: 'A' },
        createdAt: '2026-01-01T00:00:00.000Z',
        isPinned: false,
      },
      {
        id: 'y',
        text: 'stays pinned',
        sender: { id: 'u2', name: 'B' },
        createdAt: '2026-01-01T00:00:00.000Z',
        isPinned: true,
        pinnedAt: '2026-01-04T00:00:00.000Z',
      },
    ]);

    expect(pinned.map(message => message.id)).toEqual(['y']);
  });
});

describe('isPinnedMessage', () => {
  it('returns true only for explicitly pinned messages', () => {
    expect(
      isPinnedMessage({
        id: 'pinned',
        text: 'hello',
        sender: { id: 'u1', name: 'A' },
        createdAt: '2026-01-01T00:00:00.000Z',
        isPinned: true,
      }),
    ).toBe(true);

    expect(
      isPinnedMessage({
        id: 'not-pinned',
        text: 'hello',
        sender: { id: 'u1', name: 'A' },
        createdAt: '2026-01-01T00:00:00.000Z',
        isPinned: false,
      }),
    ).toBe(false);

    expect(
      isPinnedMessage({
        id: 'missing-pin-flag',
        text: 'hello',
        sender: { id: 'u1', name: 'A' },
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(false);
  });
});
