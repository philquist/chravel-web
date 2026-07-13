import React, { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BarChart3, Plus } from 'lucide-react';
import { PollComponent, type PollListFilter } from './PollComponent';
import { ActionPill } from './ui/ActionPill';
import { useTripVariant } from '@/contexts/TripVariantContext';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from './mobile/PullToRefreshIndicator';
import { useQueryClient } from '@tanstack/react-query';
import { useDemoMode } from '@/hooks/useDemoMode';
import { tripKeys } from '@/lib/queryKeys';
import {
  TRIP_PARITY_COL_START,
  TRIP_PARITY_HEADER_SPAN_CLASS,
  PRO_PARITY_COL_START,
  PRO_PARITY_HEADER_SPAN_CLASS,
  EVENT_PARITY_COL_START,
  EVENT_PARITY_HEADER_SPAN_CLASS,
} from '@/lib/tabParity';
import { cn } from '@/lib/utils';
import {
  consumePollDeepLink,
  parsePollDeepLinkFromSearch,
  POLL_DEEP_LINK_EVENT,
  type PollDeepLink,
} from '@/lib/pollDeepLink';

interface PollPermissions {
  canView: boolean;
  canVote: boolean;
  canCreate: boolean;
  canClose: boolean;
  canDelete: boolean;
}

interface CommentsWallProps {
  tripId: string;
  permissions?: PollPermissions;
}

const FILTERS: { id: PollListFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Open' },
  { id: 'closed', label: 'Closed' },
];

export const CommentsWall = ({ tripId, permissions }: CommentsWallProps) => {
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [filter, setFilter] = useState<PollListFilter>('all');
  const [focusPollId, setFocusPollId] = useState<string | null>(null);
  const location = useLocation();
  const { variant } = useTripVariant();
  const queryClient = useQueryClient();
  const { isDemoMode } = useDemoMode();
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: tripKeys.polls(tripId, isDemoMode) }),
      queryClient.invalidateQueries({ queryKey: tripKeys.pollCommentCounts(tripId, isDemoMode) }),
    ]);
  }, [isDemoMode, queryClient, tripId]);

  const { isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
    maxPullDistance: 120,
  });

  const effectivePermissions: PollPermissions = permissions ?? {
    canView: true,
    canVote: true,
    canCreate: true,
    canClose: true,
    canDelete: true,
  };

  const isMdVariant = variant === 'pro' || variant === 'events';

  const gridClass = isMdVariant ? 'md:grid' : 'sm:grid';
  const gridColsClass =
    variant === 'pro'
      ? 'md:grid-cols-9'
      : variant === 'events'
        ? 'md:grid-cols-8'
        : 'sm:grid-cols-8';

  const headerSpanClass =
    variant === 'pro'
      ? PRO_PARITY_HEADER_SPAN_CLASS
      : variant === 'events'
        ? EVENT_PARITY_HEADER_SPAN_CLASS
        : TRIP_PARITY_HEADER_SPAN_CLASS;

  const buttonColStartClass =
    variant === 'pro'
      ? PRO_PARITY_COL_START.team
      : variant === 'events'
        ? EVENT_PARITY_COL_START.tasks
        : TRIP_PARITY_COL_START.tasks;

  useEffect(() => {
    const fromUrl = parsePollDeepLinkFromSearch(location.search);
    const fromStorage = consumePollDeepLink(tripId);
    const link = fromStorage ?? fromUrl;
    if (!link) return;
    if (link.createPoll) setShowCreatePoll(true);
    if (link.pollId) {
      setFocusPollId(link.pollId);
      setFilter('all');
    }
  }, [tripId, location.search]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<PollDeepLink>).detail;
      if (!detail || detail.tripId !== tripId) return;
      if (detail.createPoll) setShowCreatePoll(true);
      if (detail.pollId) {
        setFocusPollId(detail.pollId);
        setFilter('all');
      }
    };
    window.addEventListener(POLL_DEEP_LINK_EVENT, handler);
    return () => window.removeEventListener(POLL_DEEP_LINK_EVENT, handler);
  }, [tripId]);

  return (
    <div className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-4 space-y-3 mobile-safe-scroll">
      {(isRefreshing || pullDistance > 0) && (
        <PullToRefreshIndicator
          isRefreshing={isRefreshing}
          pullDistance={pullDistance}
          threshold={80}
        />
      )}

      <div className={`flex items-center justify-between gap-2 ${gridClass} ${gridColsClass}`}>
        <div className={`min-w-0 ${headerSpanClass}`}>
          <h3 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <BarChart3 size={18} className="text-primary flex-shrink-0" />
            Group Polls
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Vote, then discuss under each poll</p>
        </div>
        {effectivePermissions.canCreate && !showCreatePoll && (
          <ActionPill
            variant="manualOutline"
            leftIcon={<Plus />}
            iconOnly
            onClick={() => setShowCreatePoll(true)}
            className={`${buttonColStartClass} w-full`}
            aria-label="Create poll"
          />
        )}
      </div>

      <div
        className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10"
        role="tablist"
        aria-label="Filter polls"
      >
        {FILTERS.map(item => {
          const selected = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setFilter(item.id)}
              className={cn(
                'h-9 min-h-[44px] md:min-h-9 px-3 rounded-lg text-xs font-medium transition-colors',
                selected
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <PollComponent
        tripId={tripId}
        showCreatePoll={showCreatePoll}
        onShowCreatePollChange={setShowCreatePoll}
        hideCreateButton
        permissions={effectivePermissions}
        autoShowCreateOnEmpty
        filter={filter}
        focusPollId={focusPollId}
      />
    </div>
  );
};
