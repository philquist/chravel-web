import React from 'react';
import { cn } from '@/lib/utils';

interface BubbleTailProps {
  isOwn: boolean;
  isBroadcast?: boolean;
}

/**
 * iMessage-style bubble tail — only rendered on the last bubble in a sender group.
 * Own = gold-tinted right notch; other = surface-tinted left notch.
 */
export const BubbleTail: React.FC<BubbleTailProps> = ({ isOwn, isBroadcast = false }) => {
  const fillClass = isBroadcast ? 'fill-[#B91C1C]' : isOwn ? 'fill-chat-own' : 'fill-chat-other';

  return (
    <svg
      className={cn(
        'absolute bottom-0 w-[12px] h-[14px] pointer-events-none',
        isOwn ? '-right-[6px]' : '-left-[6px]',
      )}
      viewBox="0 0 12 14"
      aria-hidden="true"
    >
      {isOwn ? (
        <path className={fillClass} d="M0 0 C6 2 10 6 12 14 L0 10 Z" />
      ) : (
        <path className={fillClass} d="M12 0 C6 2 2 6 0 14 L12 10 Z" />
      )}
    </svg>
  );
};
