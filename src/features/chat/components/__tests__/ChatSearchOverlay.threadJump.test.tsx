import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatSearchOverlay } from '../ChatSearchOverlay';

vi.mock('@/services/chatSearchService', () => ({
  searchChatContentWithFilters: vi.fn().mockResolvedValue({
    messages: [
      {
        id: 'reply-1',
        content: 'Thread reply content',
        author_name: 'Alex',
        user_id: 'user-1',
        created_at: '2026-04-20T10:00:00.000Z',
        parent_message_id: 'parent-1',
        type: 'message',
      },
    ],
    broadcasts: [],
  }),
}));

describe('ChatSearchOverlay thread jump behavior', () => {
  it('routes thread reply search hits to parent message thread opening', async () => {
    const onResultSelect = vi.fn();

    render(<ChatSearchOverlay tripId="trip-1" onClose={vi.fn()} onResultSelect={onResultSelect} />);

    fireEvent.change(screen.getByPlaceholderText(/search messages/i), {
      target: { value: 'thread' },
    });

    await waitFor(() => {
      expect(screen.getByText('Thread reply content')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Thread reply content'));

    expect(onResultSelect).toHaveBeenCalledWith({
      id: 'parent-1',
      type: 'message',
      openThread: true,
    });
  });
});
