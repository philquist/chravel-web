import React from 'react';
import { getInitials, isValidAvatarUrl } from '@/utils/avatarUtils';
import { cn } from '@/lib/utils';

export interface MemberAvatarStackItem {
  id: string | number;
  name: string;
  avatar?: string;
}

interface MemberAvatarStackProps {
  members: MemberAvatarStackItem[];
  totalCount?: number;
  maxVisible?: number;
  size?: 'sm' | 'md';
  className?: string;
  onOverflowClick?: () => void;
}

const sizeClasses = {
  sm: 'h-7 w-7 text-[10px] border',
  md: 'h-9 w-9 text-xs border-2',
} as const;

export const MemberAvatarStack: React.FC<MemberAvatarStackProps> = ({
  members,
  totalCount,
  maxVisible = 8,
  size = 'md',
  className,
  onOverflowClick,
}) => {
  const resolvedTotal = totalCount ?? members.length;
  const visible = members.slice(0, maxVisible);
  const overflow = Math.max(resolvedTotal - visible.length, 0);
  const dimension = sizeClasses[size];

  if (resolvedTotal === 0) {
    return <span className="text-xs text-muted-foreground">No members yet</span>;
  }

  return (
    <div className={cn('flex items-center', className)} aria-label={`${resolvedTotal} members`}>
      <div className="flex items-center -space-x-2">
        {visible.map((member, index) => (
          <div
            key={member.id}
            className={cn(
              'relative rounded-full border-white/20 bg-white/10 text-white/80 grid place-items-center font-semibold shrink-0 ring-2 ring-black/40',
              dimension,
            )}
            style={{ zIndex: visible.length - index }}
            title={member.name}
          >
            {isValidAvatarUrl(member.avatar) ? (
              <img
                src={member.avatar}
                alt={member.name}
                className="h-full w-full rounded-full object-cover"
                loading="lazy"
              />
            ) : (
              getInitials(member.name)
            )}
          </div>
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={onOverflowClick}
            className={cn(
              'relative rounded-full bg-white/15 text-white text-xs font-semibold shrink-0 ring-2 ring-black/40 grid place-items-center',
              dimension,
              onOverflowClick && 'hover:bg-white/25 transition-colors',
            )}
            aria-label={`View all ${resolvedTotal} members`}
          >
            +{overflow}
          </button>
        )}
      </div>
      <span className="ml-3 text-xs text-gray-400 whitespace-nowrap">
        {resolvedTotal} {resolvedTotal === 1 ? 'member' : 'members'}
      </span>
    </div>
  );
};
