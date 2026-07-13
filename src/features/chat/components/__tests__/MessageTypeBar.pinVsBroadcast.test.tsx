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

  it('uses a dark-mode-aware gold for the inactive Pinned label so it stays readable in light mode', () => {
    render(<MessageTypeBar activeFilter="all" {...baseProps} />);

    const pinnedButton = screen.getByRole('button', { name: /Pinned/ });
    // Light-mode color must be a dark token (light golds wash out on the bar);
    // dark: variant uses the light champagne gold on dark surfaces. Same
    // contrast intent as the earlier amber-700/amber-300 pair, now on brand
    // tokens instead of raw palette values.
    expect(pinnedButton.className).toMatch(/text-gold-dark/);
    expect(pinnedButton.className).toMatch(/dark:text-gold-light/);
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
