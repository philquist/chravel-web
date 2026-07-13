import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualizedMessageContainer } from '../VirtualizedMessageContainer';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 72,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 72,
        size: 72,
        key: index,
      })),
    measureElement: vi.fn(),
  }),
}));

vi.mock('@/services/hapticService', () => ({
  hapticService: { light: vi.fn() },
}));

describe('VirtualizedMessageContainer Stream grouping', () => {
  it('collapses sender info for consecutive Stream messages from the same sender.id', () => {
    const messages = [
      {
        id: 'm1',
        createdAt: '2026-07-13T12:00:00.000Z',
        sender: { id: 'user-1' },
      },
      {
        id: 'm2',
        createdAt: '2026-07-13T12:02:00.000Z',
        sender: { id: 'user-1' },
      },
      {
        id: 'm3',
        createdAt: '2026-07-13T12:06:00.000Z',
        sender: { id: 'user-1' },
      },
      {
        id: 'm4',
        createdAt: '2026-07-13T12:06:30.000Z',
        sender: { id: 'user-2' },
      },
    ];

    render(
      <div style={{ height: 400 }}>
        <VirtualizedMessageContainer
          messages={messages}
          renderMessage={(message, _index, showSenderInfo, isLastInGroup) => (
            <div
              data-testid={`msg-${message.id}`}
              data-show-sender={String(showSenderInfo)}
              data-last={String(isLastInGroup)}
            >
              {message.id}
            </div>
          )}
          onLoadMore={() => undefined}
          hasMore={false}
          isLoading={false}
          autoScroll={false}
          restoreScroll={false}
          initialVisibleCount={10}
        />
      </div>,
    );

    // 3-minute window: m1→m2 (2min) grouped; m2→m3 (4min) breaks group.
    expect(screen.getByTestId('msg-m1')).toHaveAttribute('data-show-sender', 'true');
    expect(screen.getByTestId('msg-m2')).toHaveAttribute('data-show-sender', 'false');
    expect(screen.getByTestId('msg-m3')).toHaveAttribute('data-show-sender', 'true');
    expect(screen.getByTestId('msg-m4')).toHaveAttribute('data-show-sender', 'true');

    const lastFlags = Array.from(document.querySelectorAll('[data-last-in-group]')).map(el =>
      el.getAttribute('data-last-in-group'),
    );
    expect(lastFlags).toEqual(['false', 'true', 'true', 'true']);
  });

  it('inserts a New Messages divider before the first unread message', () => {
    const messages = [
      {
        id: 'm1',
        createdAt: '2026-07-13T12:00:00.000Z',
        sender: { id: 'user-1' },
      },
      {
        id: 'm2',
        createdAt: '2026-07-13T12:01:00.000Z',
        sender: { id: 'user-2' },
      },
    ];

    render(
      <div style={{ height: 400 }}>
        <VirtualizedMessageContainer
          messages={messages}
          firstUnreadMessageId="m2"
          renderMessage={message => <div data-testid={`msg-${message.id}`}>{message.id}</div>}
          onLoadMore={() => undefined}
          hasMore={false}
          isLoading={false}
          autoScroll={false}
          restoreScroll={false}
          initialVisibleCount={10}
        />
      </div>,
    );

    expect(document.querySelector('[data-unread-divider="true"]')).toBeTruthy();
    expect(screen.getByText('New Messages')).toBeInTheDocument();
  });
});
