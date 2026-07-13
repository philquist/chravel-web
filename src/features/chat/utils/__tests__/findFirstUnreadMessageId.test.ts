import { describe, expect, it } from 'vitest';
import { findFirstUnreadMessageId } from '../findFirstUnreadMessageId';

describe('findFirstUnreadMessageId', () => {
  const messages = [
    {
      id: 'm1',
      createdAt: '2026-07-13T12:00:00.000Z',
      sender: { id: 'user-2' },
    },
    {
      id: 'm2',
      createdAt: '2026-07-13T12:05:00.000Z',
      sender: { id: 'user-2' },
    },
    {
      id: 'm3',
      createdAt: '2026-07-13T12:10:00.000Z',
      sender: { id: 'user-1' },
    },
    {
      id: 'm4',
      createdAt: '2026-07-13T12:15:00.000Z',
      sender: { id: 'user-2' },
    },
  ];

  it('returns the first message after last_read from another sender', () => {
    expect(
      findFirstUnreadMessageId({
        messages,
        currentUserId: 'user-1',
        lastRead: '2026-07-13T12:06:00.000Z',
      }),
    ).toBe('m4');
  });

  it('skips own messages when finding the first unread', () => {
    expect(
      findFirstUnreadMessageId({
        messages,
        currentUserId: 'user-1',
        lastRead: '2026-07-13T12:04:00.000Z',
      }),
    ).toBe('m2');
  });

  it('returns null when there is no last_read or no unread', () => {
    expect(
      findFirstUnreadMessageId({
        messages,
        currentUserId: 'user-1',
        lastRead: null,
      }),
    ).toBeNull();
    expect(
      findFirstUnreadMessageId({
        messages,
        currentUserId: 'user-1',
        lastRead: '2026-07-13T12:20:00.000Z',
      }),
    ).toBeNull();
  });
});
