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
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}));

const basePoll: PollType = {
  id: 'poll-1',
  question: 'Where should we eat?',
  options: [
    { id: 'opt-1', text: 'Sushi', votes: 2, voters: ['user-2', 'user-3'] },
    { id: 'opt-2', text: 'Tacos', votes: 1, voters: ['user-4'] },
  ],
  totalVotes: 3,
  status: 'active',
  createdBy: 'user-1',
  allow_multiple: false,
  allow_vote_change: true,
  is_anonymous: false,
};

function renderPoll(overrides: Partial<ComponentProps<typeof Poll>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onSuggestOption = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={client}>
      <Poll
        tripId="trip-1"
        poll={basePoll}
        onVote={vi.fn()}
        canSuggestOption
        onSuggestOption={onSuggestOption}
        voterProfiles={{
          'user-2': { displayName: 'Sam', avatarUrl: null },
          'user-3': { displayName: 'Jordan', avatarUrl: null },
          'user-4': { displayName: 'Riley', avatarUrl: null },
        }}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onSuggestOption };
}

describe('Poll facepiles + suggest option', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders voter facepile names via tooltip triggers', () => {
    renderPoll();
    expect(screen.getByLabelText('Sam')).toBeInTheDocument();
    expect(screen.getByLabelText('Jordan')).toBeInTheDocument();
    expect(screen.getByLabelText('Riley')).toBeInTheDocument();
  });

  it('hides facepiles for anonymous polls', () => {
    renderPoll({ poll: { ...basePoll, is_anonymous: true } });
    expect(screen.queryByLabelText('Sam')).not.toBeInTheDocument();
  });

  it('submits a suggested option', async () => {
    const user = userEvent.setup();
    const { onSuggestOption } = renderPoll();
    await user.click(screen.getByRole('button', { name: /Suggest an option/i }));
    await user.type(screen.getByLabelText(/Suggest a poll option/i), 'Ramen');
    await user.click(screen.getByRole('button', { name: /^Add$/i }));
    await waitFor(() => {
      expect(onSuggestOption).toHaveBeenCalledWith('poll-1', 'Ramen');
    });
  });
});
