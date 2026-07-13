import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProTripDetailHeader } from '../ProTripDetailHeader';

const mockUseAuth = vi.fn();
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

const baseProps = {
  tripContext: null,
  showInbox: false,
  onToggleInbox: vi.fn(),
  onShowInvite: vi.fn(),
  onShowTripSettings: vi.fn(),
  onShowAuth: vi.fn(),
};

const renderHeader = (props = {}) =>
  render(
    <MemoryRouter>
      <ProTripDetailHeader {...baseProps} {...props} />
    </MemoryRouter>,
  );

describe('ProTripDetailHeader action bar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
  });

  it('renders Inbox, Invite, and Settings actions plus the PRO badge', () => {
    renderHeader();
    expect(screen.getByLabelText('Message inbox')).toBeInTheDocument();
    expect(screen.getByText('Invite')).toBeInTheDocument();
    expect(screen.getByLabelText('Trip settings')).toBeInTheDocument();
    expect(screen.getByText('PRO')).toBeInTheDocument();
  });

  it('fires the wired callbacks', () => {
    const onToggleInbox = vi.fn();
    const onShowInvite = vi.fn();
    const onShowTripSettings = vi.fn();
    renderHeader({ onToggleInbox, onShowInvite, onShowTripSettings });

    fireEvent.click(screen.getByLabelText('Message inbox'));
    expect(onToggleInbox).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Invite'));
    expect(onShowInvite).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Trip settings'));
    expect(onShowTripSettings).toHaveBeenCalledTimes(1);
  });

  it('reflects inbox state via aria-pressed', () => {
    renderHeader({ showInbox: true });
    expect(screen.getByLabelText('Message inbox')).toHaveAttribute('aria-pressed', 'true');
  });

  it('routes signed-out users to auth instead of the invite modal', () => {
    mockUseAuth.mockReturnValue({ user: null });
    const onShowInvite = vi.fn();
    const onShowAuth = vi.fn();
    renderHeader({ onShowInvite, onShowAuth });

    fireEvent.click(screen.getByText('Invite'));
    expect(onShowInvite).not.toHaveBeenCalled();
    expect(onShowAuth).toHaveBeenCalledTimes(1);
  });
});
