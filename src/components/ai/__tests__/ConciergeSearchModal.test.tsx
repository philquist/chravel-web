import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConciergeSearchModal } from '../ConciergeSearchModal';

vi.mock('@/hooks/useUniversalSearch', () => ({
  useUniversalSearch: vi.fn(() => ({ results: [], isLoading: false })),
}));

describe('ConciergeSearchModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a dismiss control and accepts typed search input', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onOpenChange = vi.fn();

    render(
      <ConciergeSearchModal
        open
        onOpenChange={onOpenChange}
        tripId="trip-1"
        onNavigate={vi.fn()}
      />,
    );

    const input = screen.getByTestId('concierge-search-input');
    expect(input).toBeEnabled();
    expect(input).not.toHaveAttribute('readonly');

    // Focus is applied after open (50ms) — same path mobile needs for keyboard.
    await act(async () => {
      vi.advanceTimersByTime(60);
    });
    await waitFor(() => {
      expect(input).toHaveFocus();
    });

    await user.type(input, 'dinner');
    expect(input).toHaveValue('dinner');

    const closeButton = screen.getByTestId('concierge-search-close');
    expect(closeButton).toHaveClass('min-h-11');

    await user.click(closeButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not dismiss from the opening gesture landing on the backdrop', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onOpenChange = vi.fn();

    render(
      <ConciergeSearchModal
        open
        onOpenChange={onOpenChange}
        tripId="trip-1"
        onNavigate={vi.fn()}
      />,
    );

    const overlay = screen.getByTestId('concierge-search-overlay');
    await user.click(overlay);
    expect(onOpenChange).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(450);
    });

    await user.click(overlay);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onOpenChange = vi.fn();

    render(
      <ConciergeSearchModal
        open
        onOpenChange={onOpenChange}
        tripId="trip-1"
        onNavigate={vi.fn()}
      />,
    );

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
