import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageTypeBar } from '../MessageTypeBar';

describe('MessageTypeBar pinned vs broadcasts hinting', () => {
  const baseProps = {
    onFilterChange: vi.fn(),
    onSearchClick: vi.fn(),
  } as const;

  it('exposes search as an icon-only control with an accessible name', () => {
    render(<MessageTypeBar activeFilter="all" {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Search messages' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^search$/i })).not.toBeInTheDocument();
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
