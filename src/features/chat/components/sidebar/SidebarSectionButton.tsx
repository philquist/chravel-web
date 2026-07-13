import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarSectionButtonProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  /** Right-aligned count badge; hidden when 0. */
  badgeCount?: number;
  /** Badge treatment: gold for standard unread, destructive for broadcasts. */
  badgeVariant?: 'gold' | 'destructive';
}

/**
 * One row in the chat sidebar rail (Messages / Broadcasts / Pinned — and
 * reusable for future sections like DMs). Active row carries the gold accent
 * bar; badges right-align.
 */
export const SidebarSectionButton = ({
  icon: Icon,
  label,
  active,
  onClick,
  badgeCount = 0,
  badgeVariant = 'gold',
}: SidebarSectionButtonProps) => (
  <button
    onClick={onClick}
    aria-current={active ? 'true' : undefined}
    className={cn(
      'mx-2 flex min-h-[40px] items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-sm transition-colors',
      active
        ? 'border-gold-primary bg-gold-primary/15 font-medium text-gold-primary'
        : 'border-transparent text-white/70 hover:bg-white/5 hover:text-white',
    )}
  >
    <Icon size={16} className="shrink-0" aria-hidden="true" />
    <span className="min-w-0 flex-1 truncate text-left">{label}</span>
    {badgeCount > 0 && (
      <span
        className={cn(
          'shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none',
          badgeVariant === 'destructive'
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-gold-primary text-black',
        )}
        aria-label={`${badgeCount} unread`}
      >
        {badgeCount > 99 ? '99+' : badgeCount}
      </span>
    )}
  </button>
);
