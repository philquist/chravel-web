import React, { useMemo } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { LARGE_LIST_THRESHOLDS } from '@/lib/largeListThresholds';
import { MemberAvatarStack } from '@/components/members/MemberAvatarStack';
import { formatCollaboratorName } from '@/utils/nameFormatUtils';
import { getInitials, isValidAvatarUrl } from '@/utils/avatarUtils';

export interface CollaboratorItem {
  id: number | string;
  name: string;
  avatar?: string;
  role?: string;
}

interface CollaboratorsGridProps {
  participants: CollaboratorItem[];
  countLabel?: string;
  maxRows?: number;
  minColWidth?: number;
  onShowAll: () => void;
  tripType?: 'consumer' | 'pro' | 'event';
  displayContext?: 'home' | 'trip-detail';
  pendingRequestsCount?: number;
  hideBottomRow?: boolean;
}

const COMPACT_PREVIEW_THRESHOLD = 8;

export const CollaboratorsGrid: React.FC<CollaboratorsGridProps> = ({
  participants,
  countLabel,
  maxRows: _maxRows = 1,
  minColWidth: _minColWidth = 140,
  onShowAll,
  tripType = 'consumer',
  displayContext = 'trip-detail',
  pendingRequestsCount: _pendingRequestsCount = 0,
  hideBottomRow = false,
}) => {
  const isMobile = useIsMobile();
  const showAvatars = tripType !== 'event' && displayContext === 'trip-detail';
  const useCompactPreview = participants.length > COMPACT_PREVIEW_THRESHOLD;

  const stackMembers = useMemo(
    () =>
      participants.map(participant => ({
        id: participant.id,
        name: formatCollaboratorName(participant.name, tripType),
        avatar: showAvatars ? participant.avatar : undefined,
      })),
    [participants, showAvatars, tripType],
  );

  if (useCompactPreview) {
    return (
      <section aria-labelledby="collab-title" className="relative">
        <MemberAvatarStack
          members={stackMembers}
          totalCount={participants.length}
          maxVisible={
            isMobile
              ? LARGE_LIST_THRESHOLDS.previewAvatarsMobile
              : LARGE_LIST_THRESHOLDS.previewAvatarsDesktop
          }
          onOverflowClick={onShowAll}
        />
        {!hideBottomRow && (
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-gray-400">{countLabel}</div>
            <button
              className="text-xs font-medium underline text-gray-200 hover:text-white"
              onClick={onShowAll}
              aria-label="Show all members"
            >
              View all
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="collab-title" className="relative">
      <div className="relative">
        <div className="flex flex-wrap gap-2" role="list" aria-label="Collaborators">
          {participants.map(c => (
            <button
              key={c.id}
              className="group inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 transition w-auto shrink-0 max-w-[200px]"
              role="listitem"
              title={c.role ? `${c.name} • ${c.role}` : c.name}
              onClick={onShowAll}
            >
              {showAvatars && isValidAvatarUrl(c.avatar) ? (
                <img
                  src={c.avatar}
                  alt={c.name}
                  className="h-7 w-7 rounded-full object-cover border border-white/20 shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-white/10 text-white/80 grid place-items-center text-[10px] font-semibold border border-white/20 shrink-0">
                  {getInitials(c.name)}
                </div>
              )}
              <div className="min-w-0 text-left">
                <div className="truncate text-xs font-medium text-white">
                  {formatCollaboratorName(c.name, tripType)}
                </div>
                {c.role && <div className="truncate text-[10px] text-gray-400">{c.role}</div>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {!hideBottomRow && (
        <div className="mt-2 flex items-center justify-between">
          <div className="text-xs text-gray-400">{countLabel}</div>
          <button
            className="text-xs font-medium underline text-gray-200 hover:text-white"
            onClick={onShowAll}
            aria-label="Show all members"
          >
            Show all
          </button>
        </div>
      )}
    </section>
  );
};
