import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatSearchOverlay } from '../ChatSearchOverlay';
import { parseMessageSearchQuery } from '@/lib/parseMessageSearchQuery';
import { searchChatContentWithFilters } from '@/services/chatSearchService';

vi.mock('@/lib/parseMessageSearchQuery', () => ({
  parseMessageSearchQuery: vi.fn(),
}));

vi.mock('@/services/chatSearchService', () => ({
  searchChatContentWithFilters: vi.fn(),
}));

describe('ChatSearchOverlay search behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps an accessible 44px back control to exit search on mobile', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<ChatSearchOverlay tripId="trip-1" onClose={onClose} onResultSelect={vi.fn()} />);

    const backButton = screen.getByRole('button', { name: 'Back to chat' });
    expect(backButton).toHaveClass('min-h-11');

    await user.click(backButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores backdrop dismiss during the open-gesture guard window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();

    render(<ChatSearchOverlay tripId="trip-1" onClose={onClose} onResultSelect={vi.fn()} />);

    const overlay = screen.getByTestId('chat-search-overlay');
    await user.click(overlay);
    expect(onClose).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(450);
    await user.click(overlay);
    expect(onClose).toHaveBeenCalledWith();

    vi.useRealTimers();
  });

  it('parses filter query and renders both message and broadcast results', async () => {
    const user = userEvent.setup();
    const parsedQuery = {
      text: 'practice',
      sender: 'Coach',
      isBroadcastOnly: true,
    };

    vi.mocked(parseMessageSearchQuery).mockReturnValue(parsedQuery);
    vi.mocked(searchChatContentWithFilters).mockResolvedValue({
      messages: [
        {
          id: 'msg-1',
          content: 'Practice starts at 7',
          author_name: 'Coach Mike',
          user_id: 'user-1',
          created_at: '2026-04-10T10:00:00.000Z',
          type: 'message',
        },
      ],
      broadcasts: [
        {
          id: 'bc-1',
          message: 'Broadcast: Practice moved to field 2',
          created_by: 'user-1',
          created_by_name: 'Coach Mike',
          priority: 'urgent',
          created_at: '2026-04-10T11:00:00.000Z',
          type: 'broadcast',
        },
      ],
    });

    const onResultSelect = vi.fn();
    render(<ChatSearchOverlay tripId="trip-1" onClose={vi.fn()} onResultSelect={onResultSelect} />);

    const searchInput = screen.getByPlaceholderText('Search messages');
    await user.type(searchInput, 'broadcast from:Coach practice');

    await waitFor(() => {
      expect(parseMessageSearchQuery).toHaveBeenCalledWith('broadcast from:Coach practice');
      expect(searchChatContentWithFilters).toHaveBeenCalledWith('trip-1', parsedQuery);
    });

    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Broadcasts')).toBeInTheDocument();
    expect(screen.getByText('Practice starts at 7')).toBeInTheDocument();
    expect(screen.getByText('Broadcast: Practice moved to field 2')).toBeInTheDocument();

    await user.click(screen.getByText('Broadcast: Practice moved to field 2'));
    expect(onResultSelect).toHaveBeenCalledWith({ id: 'bc-1', type: 'broadcast' });
  });

  it('passes parsed day + sender filters and supports selecting a message result', async () => {
    const user = userEvent.setup();
    const parsedQuery = {
      text: 'meeting',
      sender: 'Alex',
      day: '2026-04-11',
      isBroadcastOnly: false,
    };

    vi.mocked(parseMessageSearchQuery).mockReturnValue(parsedQuery);
    vi.mocked(searchChatContentWithFilters).mockResolvedValue({
      messages: [
        {
          id: 'msg-2',
          content: 'Meeting moved to 3 PM',
          author_name: 'Alex',
          user_id: 'user-2',
          created_at: '2026-04-11T15:00:00.000Z',
          type: 'message',
        },
      ],
      broadcasts: [],
    });

    const onResultSelect = vi.fn();
    render(<ChatSearchOverlay tripId="trip-2" onClose={vi.fn()} onResultSelect={onResultSelect} />);

    const searchInput = screen.getByPlaceholderText('Search messages');
    await user.type(searchInput, 'from:Alex day:2026-04-11 meeting');

    await waitFor(() => {
      expect(parseMessageSearchQuery).toHaveBeenCalledWith('from:Alex day:2026-04-11 meeting');
      expect(searchChatContentWithFilters).toHaveBeenCalledWith('trip-2', parsedQuery);
    });

    await user.click(screen.getByText('Meeting moved to 3 PM'));
    expect(onResultSelect).toHaveBeenCalledWith({ id: 'msg-2', type: 'message' });
  });
});
