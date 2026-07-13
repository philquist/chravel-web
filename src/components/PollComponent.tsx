import React, { useMemo, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { Poll as PollType } from './poll/types';
import { Poll } from './poll/Poll';
import { CreatePollForm, PollSettings } from './poll/CreatePollForm';
import { PollsEmptyState } from './polls/PollsEmptyState';
import { useTripPolls } from '@/hooks/useTripPolls';
import { useTripPollCommentCounts } from '@/hooks/usePollComments';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { VoterProfile } from './poll/PollOption';

const POLL_CARD_STACK_CLASS = 'space-y-3';
const POLL_CARD_SHELL_CLASS = 'bg-white/[0.04] border border-white/10 rounded-2xl p-4 space-y-3';

export type PollListFilter = 'all' | 'active' | 'closed';

interface PollPermissions {
  canView: boolean;
  canVote: boolean;
  canCreate: boolean;
  canClose: boolean;
  canDelete: boolean;
}

interface PollComponentProps {
  tripId: string;
  showCreatePoll?: boolean;
  onShowCreatePollChange?: (show: boolean) => void;
  hideCreateButton?: boolean;
  permissions?: PollPermissions;
  autoShowCreateOnEmpty?: boolean;
  filter?: PollListFilter;
  focusPollId?: string | null;
}

function isPollClosedForVoting(poll: PollType): boolean {
  if (poll.status === 'closed') return true;
  if (!poll.deadline_at) return false;
  return new Date(poll.deadline_at).getTime() <= Date.now();
}

export const PollComponent = ({
  tripId,
  showCreatePoll: controlledShowCreatePoll,
  onShowCreatePollChange,
  hideCreateButton = false,
  permissions,
  autoShowCreateOnEmpty = false,
  filter = 'all',
  focusPollId = null,
}: PollComponentProps) => {
  const { isDemoMode } = useDemoMode();

  const effectivePermissions: PollPermissions = isDemoMode
    ? { canView: true, canVote: true, canCreate: true, canClose: true, canDelete: true }
    : (permissions ?? {
        canView: true,
        canVote: true,
        canCreate: true,
        canClose: true,
        canDelete: true,
      });

  const isControlled =
    controlledShowCreatePoll !== undefined && onShowCreatePollChange !== undefined;
  const [internalShowCreatePoll, setInternalShowCreatePoll] = React.useState(false);

  const showCreatePoll = isControlled ? controlledShowCreatePoll : internalShowCreatePoll;
  const setShowCreatePoll = isControlled ? onShowCreatePollChange : setInternalShowCreatePoll;

  const { user } = useAuth();
  const {
    polls,
    isLoading,
    createPollAsync,
    votePollAsync,
    removeVote,
    closePollAsync,
    deletePollAsync,
    suggestOptionAsync,
    isCreatingPoll,
    isVoting,
    isRemovingVote,
    isClosing,
    isDeleting,
    isSuggestingOption,
  } = useTripPolls(tripId);
  const { data: commentCounts = {} } = useTripPollCommentCounts(tripId);

  const voterIds = useMemo(() => {
    const ids = new Set<string>();
    polls.forEach(poll => {
      if (poll.is_anonymous) return;
      (Array.isArray(poll.options) ? poll.options : []).forEach(option => {
        (option.voters || []).forEach(voterId => {
          if (voterId) ids.add(voterId);
        });
      });
    });
    return [...ids];
  }, [polls]);

  const { data: voterProfiles = {} } = useQuery({
    queryKey: ['pollVoterProfiles', tripId, voterIds.join(',')],
    enabled: voterIds.length > 0 && !isDemoMode,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Record<string, VoterProfile>> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', voterIds);
      if (error) throw error;
      const map: Record<string, VoterProfile> = {};
      (data ?? []).forEach(row => {
        map[row.user_id] = {
          displayName: row.display_name || 'Traveler',
          avatarUrl: row.avatar_url,
        };
      });
      return map;
    },
  });

  const demoVoterProfiles = useMemo(() => {
    if (!isDemoMode) return {};
    const map: Record<string, VoterProfile> = {};
    voterIds.forEach(id => {
      map[id] = {
        displayName: id === 'demo-user' ? 'You' : id.replace(/^user-/, 'Traveler '),
        avatarUrl: null,
      };
    });
    return map;
  }, [isDemoMode, voterIds]);

  const resolvedVoterProfiles = isDemoMode ? demoVoterProfiles : voterProfiles;

  const userId = user?.id;

  const hasAutoShown = React.useRef(false);
  useEffect(() => {
    if (
      autoShowCreateOnEmpty &&
      !isLoading &&
      polls.length === 0 &&
      effectivePermissions.canCreate &&
      !showCreatePoll &&
      !hasAutoShown.current
    ) {
      hasAutoShown.current = true;
      setShowCreatePoll(true);
    }
  }, [
    autoShowCreateOnEmpty,
    isLoading,
    polls.length,
    effectivePermissions.canCreate,
    showCreatePoll,
    setShowCreatePoll,
  ]);

  const formattedPolls: PollType[] = useMemo(() => {
    return polls.map(poll => {
      const safeOptions = Array.isArray(poll.options) ? poll.options : [];
      const userVoteOptions = safeOptions.filter(option => option.voters?.includes(userId || ''));
      const userVote = poll.allow_multiple
        ? userVoteOptions.map(opt => opt.id)
        : userVoteOptions[0]?.id;

      return {
        id: poll.id,
        question: poll.question,
        options: safeOptions.map(option => ({
          id: option.id,
          text: option.text,
          votes: option.votes,
          voters: option.voters,
        })),
        totalVotes: poll.total_votes,
        userVote,
        status: poll.status,
        createdAt: poll.created_at,
        createdBy: poll.created_by,
        allow_multiple: poll.allow_multiple,
        is_anonymous: poll.is_anonymous,
        allow_vote_change: poll.allow_vote_change,
        deadline_at: poll.deadline_at,
        closed_at: poll.closed_at,
        closed_by: poll.closed_by,
      };
    });
  }, [polls, userId]);

  const visiblePolls = useMemo(() => {
    if (filter === 'all') return formattedPolls;
    if (filter === 'active') {
      return formattedPolls.filter(
        poll => poll.status === 'active' && !isPollClosedForVoting(poll),
      );
    }
    return formattedPolls.filter(poll => poll.status === 'closed' || isPollClosedForVoting(poll));
  }, [formattedPolls, filter]);

  const handleVote = async (pollId: string, optionIds: string | string[]) => {
    const poll = formattedPolls.find(p => p.id === pollId);
    if (!poll) return;

    if (isPollClosedForVoting(poll)) {
      toast.error('Voting is closed for this poll');
      return;
    }

    if (!effectivePermissions.canVote) {
      toast.error("You don't have permission to vote");
      return;
    }
    try {
      await votePollAsync({ pollId, optionIds });
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error('Failed to vote on poll:', error);
      }
      toast.error('Failed to vote', { description: 'Please try again.' });
    }
  };

  const handleCreatePoll = async (question: string, options: string[], settings: PollSettings) => {
    if (!effectivePermissions.canCreate) {
      toast.error("You don't have permission to create polls");
      return;
    }
    try {
      await createPollAsync({ question, options, settings });
      setShowCreatePoll(false);
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error('Failed to create poll:', error);
      }
    }
  };

  const handleClosePoll = async (pollId: string) => {
    if (!effectivePermissions.canClose) {
      toast.error("You don't have permission to close polls");
      return;
    }
    try {
      await closePollAsync({ pollId });
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error('Failed to close poll:', error);
      }
    }
  };

  const handleRemoveVote = (pollId: string) => {
    removeVote({ pollId });
  };

  const handleSuggestOption = async (pollId: string, optionText: string) => {
    await suggestOptionAsync({ pollId, optionText });
  };

  const handleDeletePoll = async (pollId: string) => {
    if (!effectivePermissions.canDelete) {
      toast.error("You don't have permission to delete polls");
      return;
    }
    try {
      await deletePollAsync(pollId);
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error('Failed to delete poll:', error);
      }
    }
  };

  const handleExportPoll = (pollId: string) => {
    const poll = formattedPolls.find(p => p.id === pollId);
    if (!poll) return;

    const escapeCsv = (value: string): string => {
      if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvLines: string[][] = [
      ['Poll Question', poll.question],
      ['Total Votes', poll.totalVotes.toString()],
      ['Status', poll.status ?? 'active'],
      [],
      ['Option', 'Votes', 'Percentage', ...(poll.is_anonymous ? [] : ['Voters'])],
    ];

    (Array.isArray(poll.options) ? poll.options : []).forEach(option => {
      const percentage =
        poll.totalVotes > 0 ? ((option.votes / poll.totalVotes) * 100).toFixed(1) : '0';
      const row = [
        option.text,
        option.votes.toString(),
        `${percentage}%`,
        ...(poll.is_anonymous ? [] : [option.voters?.join('; ') || '']),
      ];
      csvLines.push(row);
    });

    const csvContent = csvLines.map(row => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `poll-${pollId}-results.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success('Poll exported', {
      description: 'Results saved as CSV file.',
    });
  };

  return (
    <div className={POLL_CARD_STACK_CLASS}>
      {!hideCreateButton && effectivePermissions.canCreate && !showCreatePoll && (
        <Button
          onClick={() => setShowCreatePoll(true)}
          className="w-full h-11 min-h-[44px] rounded-xl text-sm font-medium md:font-semibold"
          aria-label="Create a new poll"
        >
          <BarChart3 size={18} className="mr-2" />
          Create Poll
        </Button>
      )}

      {showCreatePoll && effectivePermissions.canCreate && (
        <CreatePollForm
          onCreatePoll={handleCreatePoll}
          onCancel={() => setShowCreatePoll(false)}
          isSubmitting={isCreatingPoll}
          isInlineEmptyState={autoShowCreateOnEmpty && formattedPolls.length === 0}
        />
      )}

      {isLoading ? (
        <div className={POLL_CARD_STACK_CLASS} role="status" aria-label="Loading polls">
          {[0, 1].map(i => (
            <div key={i} className={POLL_CARD_SHELL_CLASS}>
              <Skeleton className="h-5 rounded w-3/4" />
              <div className="space-y-2">
                <Skeleton className="h-12 bg-muted/30 rounded-xl" />
                <Skeleton className="h-12 bg-muted/30 rounded-xl" />
                <Skeleton className="h-12 bg-muted/30 rounded-xl w-5/6" />
              </div>
              <Skeleton className="h-3 rounded bg-muted/30 w-1/4" />
            </div>
          ))}
        </div>
      ) : formattedPolls.length === 0 && !showCreatePoll ? (
        <PollsEmptyState containerClassName={POLL_CARD_SHELL_CLASS} />
      ) : visiblePolls.length === 0 ? (
        <div className={`${POLL_CARD_SHELL_CLASS} text-center`}>
          <p className="text-sm text-muted-foreground">
            {filter === 'active' ? 'No open polls right now.' : 'No closed polls yet.'}
          </p>
        </div>
      ) : (
        visiblePolls.map(poll => (
          <Poll
            key={poll.id}
            poll={poll}
            tripId={tripId}
            commentCount={commentCounts[poll.id] ?? 0}
            voterProfiles={resolvedVoterProfiles}
            highlighted={focusPollId === poll.id}
            onVote={effectivePermissions.canVote ? handleVote : undefined}
            onRemoveVote={handleRemoveVote}
            onClose={effectivePermissions.canClose ? handleClosePoll : undefined}
            onDelete={effectivePermissions.canDelete ? handleDeletePoll : undefined}
            onExport={handleExportPoll}
            onSuggestOption={effectivePermissions.canVote ? handleSuggestOption : undefined}
            disabled={isPollClosedForVoting(poll) || !userId || !effectivePermissions.canVote}
            canComment={effectivePermissions.canVote}
            canSuggestOption={effectivePermissions.canVote}
            isVoting={isVoting}
            isRemovingVote={isRemovingVote}
            isClosing={isClosing}
            isDeleting={isDeleting}
            isSuggestingOption={isSuggestingOption}
          />
        ))
      )}
    </div>
  );
};
