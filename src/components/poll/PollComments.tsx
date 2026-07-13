import React, { useState } from 'react';
import { MessageCircle, Send, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { usePollComments } from '@/hooks/usePollComments';

interface PollCommentsProps {
  tripId: string;
  pollId: string;
  pollCreatorId?: string;
  canComment?: boolean;
  open: boolean;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function PollComments({
  tripId,
  pollId,
  pollCreatorId,
  canComment = true,
  open,
}: PollCommentsProps) {
  const [draft, setDraft] = useState('');
  const { comments, isLoading, addComment, deleteComment, isAdding, currentUserId } =
    usePollComments(tripId, pollId, open);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isAdding || !canComment) return;
    try {
      await addComment(trimmed);
      setDraft('');
    } catch {
      // Toast handled in hook
    }
  };

  return (
    <div className="mt-1 rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <MessageCircle size={14} className="text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Discussion</p>
        <span className="text-xs text-muted-foreground">
          {comments.length} {comments.length === 1 ? 'reply' : 'replies'}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2" role="status" aria-label="Loading comments">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-5/6 rounded-lg" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Vote, then leave a note — why you picked that option, a caveat, or a better idea.
        </p>
      ) : (
        <ul className="space-y-2.5 max-h-56 overflow-y-auto overscroll-contain pr-1">
          {comments.map(comment => {
            const canDelete =
              !!currentUserId &&
              (comment.userId === currentUserId || pollCreatorId === currentUserId);
            return (
              <li key={comment.id} className="flex gap-2.5 group">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  {comment.author.avatarUrl ? (
                    <AvatarImage src={comment.author.avatarUrl} alt="" />
                  ) : null}
                  <AvatarFallback className="bg-primary/15 text-gold-light text-[10px]">
                    {initialsFromName(comment.author.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {comment.author.displayName}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">
                      {formatRelativeTime(comment.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-ink-2 whitespace-pre-wrap break-words">
                    {comment.body}
                  </p>
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      void deleteComment(comment.id);
                    }}
                    className="h-9 w-9 min-h-[44px] min-w-[44px] md:min-h-9 md:min-w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    aria-label="Delete comment"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canComment ? (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={event => setDraft(event.target.value.slice(0, 1000))}
            placeholder="Add a reply…"
            maxLength={1000}
            className="h-11 min-h-[44px] bg-white/5 border-white/10 text-sm"
            aria-label="Write a poll reply"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim() || isAdding}
            className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl flex-shrink-0"
            aria-label="Post reply"
          >
            <Send size={16} />
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">You don’t have permission to reply.</p>
      )}
    </div>
  );
}
