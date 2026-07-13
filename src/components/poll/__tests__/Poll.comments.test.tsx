import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import { Poll } from '@/components/poll/Poll';
import type { Poll as PollType } from '@/components/poll/types';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', displayName: 'Alex', avatar: '' },
  }),
}));

vi.mock('@/lib/featureFlags', () => ({
  useFeatureFlag: () => true,
}));

vi.mock('@/hooks/usePollComments', () => ({
  usePollComments: () => ({
    comments: [],
    isLoading: false,
    addComment: vi.fn(),
    deleteComment: vi.fn(),
    isAdding: false,
    isDeleting: false,
    currentUserId: 'user-1',
  }),
  useTripPollCommentCounts: () => ({ data: {} }),
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}));

const basePoll: PollType = {
  id: 'poll-1',
  question: 'Where should we eat?',
  options: [
    { id: 'opt-1', text: 'Sushi', votes: 2, voters: ['user-2'] },
    { id: 'opt-2', text: 'Tacos', votes: 3, voters: ['user-3', 'user-4', 'user-5'] },
  ],
  totalVotes: 5,
  status: 'active',
  createdBy: 'user-1',
  allow_multiple: false,
  allow_vote_change: true,
};

function renderPoll(overrides: Partial<ComponentProps<typeof Poll>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onVote = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <Poll tripId="trip-1" poll={basePoll} onVote={onVote} commentCount={2} {...overrides} />
    </QueryClientProvider>,
  );
  return { onVote };
}

describe('Poll UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders vote options and discussion affordance', () => {
    renderPoll();
    expect(screen.getByText('Where should we eat?')).toBeInTheDocument();
    expect(screen.getByText('Sushi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discussion for poll/i })).toBeInTheDocument();
    expect(screen.getByText('2 replies')).toBeInTheDocument();
  });

  it('does not crash when onVote is undefined (viewer permissions)', async () => {
    const user = userEvent.setup();
    renderPoll({ onVote: undefined, disabled: true });
    await user.click(screen.getByText('Sushi'));
    expect(screen.getByText('Where should we eat?')).toBeInTheDocument();
  });

  it('expands discussion wall when Reply is clicked', async () => {
    const user = userEvent.setup();
    renderPoll();
    await user.click(screen.getByRole('button', { name: /discussion for poll/i }));
    await waitFor(() => {
      expect(screen.getByText(/Vote, then leave a note/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Write a poll reply/i)).toBeInTheDocument();
  });

  it('calls onVote for single-choice selection', async () => {
    const user = userEvent.setup();
    const { onVote } = renderPoll();
    await user.click(screen.getByText('Tacos'));
    expect(onVote).toHaveBeenCalledWith('poll-1', 'opt-2');
  });
});
