import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GoogleCalendarSync } from '../GoogleCalendarSync';

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

describe('GoogleCalendarSync — sync-token expiry UX', () => {
  it('renders a distinct reconnect prompt when the sync token expired', () => {
    render(<GoogleCalendarSync tripId="trip-1" status="reauth_required" />);

    // The status copy makes it clear a plain retry will not recover the sync.
    expect(screen.getByText(/Sync expired — reconnect to resume/i)).toBeInTheDocument();
    // The action is Reconnect (re-auth), NOT a no-op Sync button.
    expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^sync$/i })).not.toBeInTheDocument();
  });

  it('invokes onConnect (re-authorize) from the reconnect action', async () => {
    const onConnect = vi.fn();
    render(<GoogleCalendarSync tripId="trip-1" status="reauth_required" onConnect={onConnect} />);

    await userEvent.click(screen.getByRole('button', { name: /reconnect/i }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('still offers Sync (not Reconnect) for a recoverable error state', () => {
    render(<GoogleCalendarSync tripId="trip-1" status="error" />);
    expect(screen.getByRole('button', { name: /^sync$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reconnect/i })).not.toBeInTheDocument();
  });
});
