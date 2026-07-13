import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatSidebar } from '../sidebar/ChatSidebar';
import type { TripChannel } from '@/types/roleChannels';

const makeChannel = (id: string, name: string): TripChannel => ({
  id,
  tripId: 'trip-1',
  channelName: name,
  channelSlug: name.toLowerCase().replace(/\s+/g, '-'),
  requiredRoleId: `role-${id}`,
  requiredRoleName: name,
  isPrivate: true,
  isArchived: false,
  memberCount: 4,
  createdBy: 'user-9',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const baseProps = {
  activeFilter: 'all' as const,
  onFilterChange: vi.fn(),
  channels: [] as TripChannel[],
  activeChannelId: null,
  onChannelSelect: vi.fn(),
  channelUnreadCounts: {},
  messageUnreadCount: 0,
  broadcastBadgeCount: 0,
  pinnedCount: 0,
  onSearchClick: vi.fn(),
  canManageChannels: false,
};

describe('ChatSidebar', () => {
  it('renders sections and channels sorted with unread badges', () => {
    render(
      <ChatSidebar
        {...baseProps}
        channels={[makeChannel('c2', 'Staff'), makeChannel('c1', 'Coaches')]}
        channelUnreadCounts={{ c1: 3 }}
        messageUnreadCount={2}
      />,
    );

    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Broadcasts')).toBeInTheDocument();
    expect(screen.getByText('Pinned')).toBeInTheDocument();

    const coachesRow = screen.getByRole('button', { name: /coaches/i });
    const staffRow = screen.getByRole('button', { name: /staff/i });
    // Alphabetical: coaches before staff
    expect(
      coachesRow.compareDocumentPosition(staffRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Unread badge on coaches only
    expect(coachesRow).toHaveTextContent('3');
    expect(staffRow).not.toHaveTextContent('3');
    // Messages section badge
    expect(screen.getByText('Messages').parentElement).toHaveTextContent('2');
  });

  it('selecting a channel and a section fires the right callbacks', () => {
    const onChannelSelect = vi.fn();
    const onFilterChange = vi.fn();
    const coaches = makeChannel('c1', 'Coaches');
    render(
      <ChatSidebar
        {...baseProps}
        channels={[coaches]}
        onChannelSelect={onChannelSelect}
        onFilterChange={onFilterChange}
      />,
    );

    fireEvent.click(screen.getByText('coaches'));
    expect(onChannelSelect).toHaveBeenCalledWith(coaches);

    fireEvent.click(screen.getByText('Broadcasts'));
    expect(onChannelSelect).toHaveBeenCalledWith(null);
    expect(onFilterChange).toHaveBeenCalledWith('broadcasts');
  });

  it('marks the active channel row with aria-current', () => {
    render(
      <ChatSidebar
        {...baseProps}
        activeFilter="channels"
        channels={[makeChannel('c1', 'Coaches')]}
        activeChannelId="c1"
      />,
    );
    expect(screen.getByRole('button', { name: /coaches/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('shows the empty state; Team CTA only for admins', () => {
    const onNavigateToTeam = vi.fn();
    const { rerender } = render(
      <ChatSidebar {...baseProps} canManageChannels={false} onNavigateToTeam={onNavigateToTeam} />,
    );
    expect(screen.getByText(/created from roles in the Team tab/i)).toBeInTheDocument();
    expect(screen.queryByText('Open Team')).not.toBeInTheDocument();

    rerender(
      <ChatSidebar {...baseProps} canManageChannels={true} onNavigateToTeam={onNavigateToTeam} />,
    );
    fireEvent.click(screen.getByText('Open Team'));
    expect(onNavigateToTeam).toHaveBeenCalled();
  });

  it('fires search from the rail header', () => {
    const onSearchClick = vi.fn();
    render(<ChatSidebar {...baseProps} onSearchClick={onSearchClick} />);
    fireEvent.click(screen.getByLabelText('Search messages'));
    expect(onSearchClick).toHaveBeenCalled();
  });
});
