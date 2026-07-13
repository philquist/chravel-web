import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageTypeBar } from '../MessageTypeBar';
import type { TripChannel } from '@/types/roleChannels';

const makeChannel = (id: string, name: string): TripChannel => ({
  id,
  tripId: 'trip-1',
  channelName: name,
  channelSlug: name.toLowerCase(),
  requiredRoleId: `role-${id}`,
  requiredRoleName: name,
  isPrivate: true,
  isArchived: false,
  memberCount: 2,
  createdBy: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('MessageTypeBar external channel picker mode', () => {
  it('delegates to onOpenChannelPicker instead of rendering the popover', () => {
    const onOpenChannelPicker = vi.fn();
    const onFilterChange = vi.fn();
    render(
      <MessageTypeBar
        activeFilter="all"
        onFilterChange={onFilterChange}
        isPro
        hasChannels
        availableChannels={[makeChannel('c1', 'Coaches')]}
        channelPickerMode="external"
        onOpenChannelPicker={onOpenChannelPicker}
      />,
    );

    fireEvent.click(screen.getByText('Channels'));
    expect(onFilterChange).toHaveBeenCalledWith('channels');
    expect(onOpenChannelPicker).toHaveBeenCalledTimes(1);
    // The inline dropdown must not exist in external mode
    expect(screen.queryByText('All Messages')).not.toBeInTheDocument();
  });

  it('does not auto-open a popover in external mode when filter is channels', () => {
    render(
      <MessageTypeBar
        activeFilter="channels"
        onFilterChange={vi.fn()}
        isPro
        hasChannels
        availableChannels={[makeChannel('c1', 'Coaches')]}
        channelPickerMode="external"
        onOpenChannelPicker={vi.fn()}
      />,
    );
    expect(screen.queryByText('All Messages')).not.toBeInTheDocument();
  });

  it('default popover mode still renders the dropdown when active', () => {
    render(
      <MessageTypeBar
        activeFilter="channels"
        onFilterChange={vi.fn()}
        isPro
        hasChannels
        availableChannels={[makeChannel('c1', 'Coaches')]}
      />,
    );
    // Auto-open effect opens the popover with the channel list
    expect(screen.getByText('All Messages')).toBeInTheDocument();
    expect(screen.getByText('coaches')).toBeInTheDocument();
  });

  it('keeps 44px minimum touch targets on the pills', () => {
    render(<MessageTypeBar activeFilter="all" onFilterChange={vi.fn()} isPro hasChannels />);
    const messagesPill = screen.getByText('Messages').closest('button');
    expect(messagesPill?.className).toContain('min-h-11');
  });
});
