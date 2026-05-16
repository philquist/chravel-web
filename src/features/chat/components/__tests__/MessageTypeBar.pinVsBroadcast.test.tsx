import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageTypeBar } from '../MessageTypeBar';

describe('MessageTypeBar pinned vs broadcasts hinting', () => {
  const baseProps = {
    onFilterChange: vi.fn(),
    onSearchClick: vi.fn(),
  } as const;

  it('exposes search with an accessible name in both trip variants', () => {
    render(<MessageTypeBar activeFilter="all" {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Search messages' })).toBeInTheDocument();
  });

  it('renders search as a full labeled pill in regular trips (4 visible pills)', () => {
    render(<MessageTypeBar activeFilter="all" {...baseProps} />);

    const searchButton = screen.getByRole('button', { name: 'Search messages' });
    expect(searchButton).toHaveTextContent('Search');
    expect(screen.queryByRole('button', { name: /channels/i })).not.toBeInTheDocument();
  });

  it('renders search as a compact icon-only control in pro trips', () => {
    render(<MessageTypeBar activeFilter="all" isPro {...baseProps} />);

    const searchButton = screen.getByRole('button', { name: 'Search messages' });
    expect(searchButton).not.toHaveTextContent('Search');
    expect(screen.getByRole('button', { name: /channels/i })).toBeInTheDocument();
  });

  it('shows explicit broadcasts hint when broadcasts tab is active', () => {
    render(<MessageTypeBar activeFilter="broadcasts" {...baseProps} />);

    expect(
      screen.getByText('Broadcasts = announcement messages (pinned or unpinned).'),
    ).toBeInTheDocument();
  });

  it('shows explicit pinned hint when pinned tab is active', () => {
    render(<MessageTypeBar activeFilter="pinned" {...baseProps} />);

    expect(
      screen.getByText('Pinned = important messages from any type (including broadcasts).'),
    ).toBeInTheDocument();
  });
});
