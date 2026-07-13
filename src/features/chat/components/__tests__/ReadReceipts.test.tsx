import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadReceipts } from '../ReadReceipts';

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('ReadReceipts', () => {
  it('shows Delivered when nobody else has read the message', () => {
    render(
      <ReadReceipts
        readStatuses={[]}
        totalRecipients={3}
        currentUserId="user-1"
        tripMembers={[{ id: 'user-2', name: 'Bailey' }]}
      />,
    );

    expect(screen.getByText('Delivered')).toBeInTheDocument();
  });

  it('shows gold read ticks when at least one other member has read', () => {
    const { container } = render(
      <ReadReceipts
        readStatuses={[
          {
            id: 'r1',
            message_id: 'm1',
            user_id: 'user-2',
            read_at: '2026-07-13T12:00:00.000Z',
            created_at: '2026-07-13T12:00:00.000Z',
          },
        ]}
        totalRecipients={3}
        currentUserId="user-1"
        tripMembers={[{ id: 'user-2', name: 'Bailey', avatar: 'b.png' }]}
      />,
    );

    expect(screen.queryByText('Delivered')).not.toBeInTheDocument();
    // Gold/primary double-check icon is present for the read state.
    expect(container.querySelector('.text-primary')).toBeTruthy();
  });
});
