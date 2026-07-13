import React, { useState, useEffect, useMemo } from 'react';
import { Poll as PollType } from './types';
import { PollOption, type VoterProfile } from './PollOption';
import { PollComments } from './PollComments';
import { Clock, Trash2, AlertTriangle, MessageCircle, MoreHorizontal, Plus } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useFeatureFlag } from '@/lib/featureFlags';

interface PollProps {
  poll: PollType;
  tripId: string;
  commentCount?: number;
  voterProfiles?: Record<string, VoterProfile>;
  highlighted?: boolean;
  onVote?: (pollId: string, optionIds: string | string[]) => void;
  onRemoveVote?: (pollId: string) => void;
  onClose?: (pollId: string) => void;
  onDelete?: (pollId: string) => void;
  onExport?: (pollId: string) => void;
  onSuggestOption?: (pollId: string, optionText: string) => Promise<void> | void;
  disabled?: boolean;
  canComment?: boolean;
  canSuggestOption?: boolean;
  isVoting?: boolean;
  isClosing?: boolean;
  isRemovingVote?: boolean;
  isDeleting?: boolean;
  isSuggestingOption?: boolean;
}

export const Poll = ({
  poll,
  tripId,
  commentCount = 0,
  voterProfiles = {},
  highlighted = false,
  onVote,
  onRemoveVote,
  onClose,
  onDelete,
  onExport: _onExport,
  onSuggestOption,
  disabled = false,
  canComment = true,
  canSuggestOption = false,
  isVoting = false,
  isClosing = false,
  isRemovingVote = false,
  isDeleting = false,
  isSuggestingOption = false,
}: PollProps) => {
  const { user } = useAuth();
  const commentsEnabled = useFeatureFlag('poll_comments', true);
  const suggestEnabled = useFeatureFlag('poll_suggest_option', true);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [showComments, setShowComments] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestDraft, setSuggestDraft] = useState('');
  const articleRef = React.useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!poll.deadline_at || poll.status === 'closed') return;

    const updateCountdown = () => {
      const deadline = new Date(poll.deadline_at!);
      const now = new Date();
      const diff = deadline.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining('Voting ended');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeRemaining(`${days}d ${hours}h remaining`);
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m remaining`);
      } else {
        setTimeRemaining(`${minutes}m remaining`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);

    return () => clearInterval(interval);
  }, [poll.deadline_at, poll.status]);

  const isDeadlinePassed = poll.deadline_at ? new Date(poll.deadline_at) < new Date() : false;
  const isDeadlineUrgent = useMemo(() => {
    if (!poll.deadline_at || isDeadlinePassed || poll.status === 'closed') return false;
    const diff = new Date(poll.deadline_at).getTime() - Date.now();
    return diff > 0 && diff < 60 * 60 * 1000;
  }, [poll.deadline_at, isDeadlinePassed, poll.status]);

  useEffect(() => {
    if (!highlighted || !articleRef.current) return;
    articleRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlighted]);

  const optionCount = Array.isArray(poll.options) ? poll.options.length : 0;
  const canShowSuggest =
    suggestEnabled &&
    canSuggestOption &&
    !!onSuggestOption &&
    poll.status === 'active' &&
    !isDeadlinePassed &&
    optionCount < 10;
  const canVote =
    !disabled && !isVoting && poll.status === 'active' && !isDeadlinePassed && !!onVote;
  const hasVoted = poll.allow_multiple
    ? Array.isArray(poll.userVote) && poll.userVote.length > 0
    : !!poll.userVote;
  const canChangeVote = hasVoted && poll.allow_vote_change && canVote;
  const isCreator = user?.id === poll.createdBy;
  const displayCommentCount = Math.max(commentCount, 0);

  const handleVote = (optionId: string) => {
    if (!onVote) return;
    if (!canVote && !canChangeVote) return;

    if (poll.allow_multiple) {
      setSelectedOptions(prev => {
        const newSelection = prev.includes(optionId)
          ? prev.filter(id => id !== optionId)
          : [...prev, optionId];
        return newSelection;
      });
    } else {
      onVote(poll.id, optionId);
    }
  };

  const handleSubmitMultiple = () => {
    if (!onVote) return;
    if (selectedOptions.length > 0) {
      onVote(poll.id, selectedOptions);
    }
  };

  const handleRemoveVote = () => {
    if (onRemoveVote) {
      onRemoveVote(poll.id);
    }
  };

  const handleClose = () => {
    if (onClose && isCreator) {
      onClose(poll.id);
    }
  };

  const handleConfirmDelete = () => {
    if (onDelete && isCreator) {
      onDelete(poll.id);
    }
    setConfirmDeleteOpen(false);
  };

  return (
    <article
      ref={articleRef}
      id={`poll-card-${poll.id}`}
      className={[
        'bg-white/[0.04] border rounded-2xl p-4 space-y-3 shadow-enterprise transition-shadow',
        highlighted ? 'border-primary/50 shadow-ring-glow' : 'border-white/10',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight text-foreground leading-snug">
          {poll.question}
        </h3>
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
          {poll.is_anonymous && (
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium">
              Anonymous
            </Badge>
          )}
          {poll.allow_multiple && (
            <Badge variant="gold" className="text-[10px] px-2 py-0.5 font-medium">
              Multi-select
            </Badge>
          )}
          {poll.status === 'closed' && (
            <Badge variant="destructive" className="text-[10px] px-2 py-0.5 font-medium">
              Closed
            </Badge>
          )}
          {isDeadlinePassed && poll.status !== 'closed' && (
            <Badge
              variant="outline"
              className="text-[10px] px-2 py-0.5 font-medium border-amber-500/40 text-amber-300"
            >
              Expired
            </Badge>
          )}
          {isCreator && (onClose || onDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-9 w-9 min-h-[44px] min-w-[44px] md:min-h-9 md:min-w-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label={`More actions for poll: ${poll.question}`}
                >
                  <MoreHorizontal size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {isCreator && poll.status === 'active' && onClose && (
                  <DropdownMenuItem disabled={isClosing} onClick={handleClose}>
                    {isClosing ? 'Closing…' : 'Close poll'}
                  </DropdownMenuItem>
                )}
                {isCreator && onDelete && (
                  <DropdownMenuItem
                    disabled={isDeleting}
                    className="text-destructive focus:text-destructive"
                    onClick={() => setConfirmDeleteOpen(true)}
                  >
                    Delete poll
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Deadline countdown / expiration status */}
      {poll.deadline_at && (
        <div
          className={`flex items-center gap-1.5 text-xs ${
            poll.status === 'closed'
              ? 'text-muted-foreground'
              : isDeadlinePassed
                ? 'text-red-400'
                : isDeadlineUrgent
                  ? 'text-amber-300'
                  : 'text-muted-foreground'
          }`}
          role="timer"
          aria-label={
            poll.status === 'closed'
              ? 'Poll closed'
              : isDeadlinePassed
                ? 'Voting has ended'
                : `Poll deadline: ${timeRemaining}`
          }
        >
          {isDeadlinePassed || poll.status === 'closed' ? (
            <AlertTriangle size={12} />
          ) : (
            <Clock size={12} className={isDeadlineUrgent ? 'motion-safe:animate-pulse' : ''} />
          )}
          <span>
            {poll.status === 'closed'
              ? `Closed${poll.closed_at ? ` on ${new Date(poll.closed_at).toLocaleDateString()}` : ''}`
              : isDeadlinePassed
                ? 'Voting ended'
                : timeRemaining}
          </span>
        </div>
      )}

      {/* Options */}
      <div className="space-y-2" role="listbox" aria-label={`Options for ${poll.question}`}>
        {(() => {
          const options = Array.isArray(poll.options) ? poll.options : [];
          const maxVotes = Math.max(0, ...options.map(o => o.votes));
          const hasVotes = poll.totalVotes > 0;
          return options.map(option => (
            <PollOption
              key={option.id}
              option={option}
              totalVotes={poll.totalVotes}
              userVote={poll.userVote}
              selectedOptions={selectedOptions}
              onVote={handleVote}
              disabled={!canVote && !canChangeVote}
              isMultiple={poll.allow_multiple}
              isLeading={
                hasVotes &&
                option.votes === maxVotes &&
                options.filter(o => o.votes === maxVotes).length === 1
              }
              showVoters={!poll.is_anonymous}
              voterProfiles={voterProfiles}
            />
          ));
        })()}
      </div>

      {/* Submit button for multiple choice */}
      {poll.allow_multiple && canVote && !hasVoted && (
        <Button
          onClick={handleSubmitMultiple}
          disabled={selectedOptions.length === 0 || isVoting}
          className="w-full h-11 min-h-[44px] rounded-xl font-medium text-sm"
          aria-label={`Submit ${selectedOptions.length} vote${selectedOptions.length !== 1 ? 's' : ''} for poll: ${poll.question}`}
        >
          {isVoting
            ? 'Submitting…'
            : `Submit ${selectedOptions.length} Vote${selectedOptions.length !== 1 ? 's' : ''}`}
        </Button>
      )}

      {canShowSuggest && (
        <div className="pt-1">
          {!suggestOpen ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSuggestOpen(true)}
              className="h-10 min-h-[44px] w-full justify-start px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus size={14} className="mr-1.5" />
              Suggest an option
            </Button>
          ) : (
            <form
              className="flex items-center gap-2"
              onSubmit={async event => {
                event.preventDefault();
                const trimmed = suggestDraft.trim();
                if (!trimmed || !onSuggestOption || isSuggestingOption) return;
                await onSuggestOption(poll.id, trimmed);
                setSuggestDraft('');
                setSuggestOpen(false);
              }}
            >
              <Input
                value={suggestDraft}
                onChange={event => setSuggestDraft(event.target.value.slice(0, 120))}
                placeholder="Add another option…"
                maxLength={120}
                className="h-11 min-h-[44px] bg-white/5 border-white/10 text-sm"
                aria-label="Suggest a poll option"
                autoFocus
              />
              <Button
                type="submit"
                disabled={!suggestDraft.trim() || isSuggestingOption}
                className="h-11 min-h-[44px] rounded-xl px-3 flex-shrink-0"
              >
                {isSuggestingOption ? 'Adding…' : 'Add'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 min-h-[44px] px-2 text-xs text-muted-foreground"
                onClick={() => {
                  setSuggestOpen(false);
                  setSuggestDraft('');
                }}
              >
                Cancel
              </Button>
            </form>
          )}
        </div>
      )}

      {/* Footer with actions */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-xs text-muted-foreground tabular-nums">
            {poll.totalVotes} vote{poll.totalVotes !== 1 ? 's' : ''}
          </p>
          {hasVoted && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25">
              You voted
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {hasVoted && poll.allow_vote_change && onRemoveVote && (
            <Button
              onClick={handleRemoveVote}
              disabled={isRemovingVote}
              variant="ghost"
              size="sm"
              className="h-9 min-h-[44px] px-2.5 text-xs text-muted-foreground hover:text-foreground"
              aria-label={`Remove your vote from poll: ${poll.question}`}
            >
              <Trash2 size={12} className="mr-1" />
              {isRemovingVote ? 'Removing…' : 'Change'}
            </Button>
          )}

          {commentsEnabled && (
            <Button
              onClick={() => setShowComments(prev => !prev)}
              variant="ghost"
              size="sm"
              className={[
                'h-9 min-h-[44px] px-2.5 text-xs',
                showComments
                  ? 'text-primary bg-primary/10 hover:bg-primary/15'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
              aria-expanded={showComments}
              aria-label={`${showComments ? 'Hide' : 'Show'} discussion for poll: ${poll.question}`}
            >
              <MessageCircle size={13} className="mr-1.5" />
              {displayCommentCount > 0
                ? `${displayCommentCount} ${displayCommentCount === 1 ? 'reply' : 'replies'}`
                : 'Reply'}
            </Button>
          )}
        </div>
      </div>

      {commentsEnabled && (
        <PollComments
          tripId={tripId}
          pollId={poll.id}
          pollCreatorId={poll.createdBy}
          canComment={canComment}
          open={showComments}
        />
      )}

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this poll?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the poll, its votes, and any discussion replies. This can’t
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
};
