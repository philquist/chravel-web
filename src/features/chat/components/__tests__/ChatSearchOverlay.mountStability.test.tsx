import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatSearchOverlay } from '../ChatSearchOverlay';

vi.mock('@/services/chatSearchService', () => ({
  searchChatContentWithFilters: vi.fn().mockResolvedValue({ messages: [], broadcasts: [] }),
}));

vi.mock('@/lib/parseMessageSearchQuery', () => ({
  parseMessageSearchQuery: vi
    .fn()
    .mockReturnValue({ text: '', sender: null, isBroadcastOnly: false }),
}));

describe('ChatSearchOverlay mount stability', () => {
  it('mounts with empty query without infinite re-render (stable demoMessages default)', () => {
    render(<ChatSearchOverlay tripId="trip-1" onClose={vi.fn()} onResultSelect={vi.fn()} />);
    expect(screen.getByPlaceholderText('Search messages')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to chat' })).toBeInTheDocument();
  });
});
