import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageTypeBar } from '../MessageTypeBar';

describe('MessageTypeBar pinned vs broadcasts hinting', () => {
  const baseProps = {
    onFilterChange: vi.fn(),
    onSearchClick: vi.fn(),
  } as const;

  it('renders search as a labeled pill in regular trips (no Channels pill)', () => {
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

  it('uses a dark-mode-aware amber for the inactive Pinned label so it stays readable in light mode', () => {
    render(<MessageTypeBar activeFilter="all" {...baseProps} />);

    const pinnedButton = screen.getByRole('button', { name: /Pinned/ });
    // Light-mode color must be darker than amber-300 (the prior value washed out on the bar);
    // dark: variant preserves the original amber-300 on dark surfaces.
    expect(pinnedButton.className).toMatch(/text-amber-700/);
    expect(pinnedButton.className).toMatch(/dark:text-amber-300/);
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
