import React, { useMemo } from 'react';
import { MessageCircle, Megaphone, Pin, Hash, Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TripChannel } from '@/types/roleChannels';
import { SidebarSectionButton } from './SidebarSectionButton';

type ChatFilter = 'all' | 'broadcasts' | 'pinned' | 'channels';

interface ChatSidebarProps {
  activeFilter: ChatFilter;
  onFilterChange: (filter: ChatFilter) => void;
  channels: TripChannel[];
  activeChannelId: string | null;
  onChannelSelect: (channel: TripChannel | null) => void;
  /** Per-channel unread counts keyed by Supabase channel id. */
  channelUnreadCounts: Record<string, number>;
  messageUnreadCount: number;
  broadcastBadgeCount: number;
  pinnedCount: number;
  onSearchClick: () => void;
  /** Admins see a CTA into the Team tab when no channels exist yet. */
  canManageChannels: boolean;
  onNavigateToTeam?: () => void;
}

const formatChannelLabel = (name?: string) =>
  (name || 'channel').toLowerCase().replace(/\s+/g, '-');

/**
 * Persistent left rail for desktop pro-trip chat — Slack/Teams-style sections
 * (Messages / Broadcasts / Pinned) above an always-visible channel list with
 * per-channel unread badges. Replaces the popover channel switcher on desktop;
 * mobile keeps the pill bar + bottom sheet.
 */
export const ChatSidebar = ({
  activeFilter,
  onFilterChange,
  channels,
  activeChannelId,
  onChannelSelect,
  channelUnreadCounts,
  messageUnreadCount,
  broadcastBadgeCount,
  pinnedCount,
  onSearchClick,
  canManageChannels,
  onNavigateToTeam,
}: ChatSidebarProps) => {
  const sortedChannels = useMemo(
    () => [...channels].sort((a, b) => a.channelName.localeCompare(b.channelName)),
    [channels],
  );

  const selectSection = (filter: Exclude<ChatFilter, 'channels'>) => {
    onChannelSelect(null);
    onFilterChange(filter);
  };

  return (
    <nav
      aria-label="Chat sections"
      className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-black/20"
    >
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Chat
        </span>
        <button
          onClick={onSearchClick}
          aria-label="Search messages"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Search size={15} />
        </button>
      </div>

      <div className="flex flex-col gap-0.5 pb-2">
        <SidebarSectionButton
          icon={MessageCircle}
          label="Messages"
          active={activeFilter === 'all'}
          onClick={() => selectSection('all')}
          badgeCount={messageUnreadCount}
        />
        <SidebarSectionButton
          icon={Megaphone}
          label="Broadcasts"
          active={activeFilter === 'broadcasts'}
          onClick={() => selectSection('broadcasts')}
          badgeCount={broadcastBadgeCount}
          badgeVariant="destructive"
        />
        <SidebarSectionButton
          icon={Pin}
          label="Pinned"
          active={activeFilter === 'pinned'}
          onClick={() => selectSection('pinned')}
          badgeCount={pinnedCount}
        />
      </div>

      <div className="px-4 pb-1 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Channels
        </span>
      </div>

      {sortedChannels.length === 0 ? (
        <div className="px-4 py-3">
          <p className="text-xs leading-relaxed text-white/40">
            Channels are created from roles in the Team tab.
          </p>
          {canManageChannels && onNavigateToTeam && (
            <button
              onClick={onNavigateToTeam}
              className="mt-3 flex min-h-[36px] items-center gap-1.5 rounded-full border border-gold-primary/40 px-3 py-1.5 text-xs font-medium text-gold-primary transition-colors hover:bg-gold-primary/10"
            >
              <Users size={13} aria-hidden="true" />
              Open Team
            </button>
          )}
        </div>
      ) : (
        // Rows stay real <button>s — an explicit list role would override
        // their button semantics for assistive tech.
        <div className="flex flex-col gap-0.5 pb-3" aria-label="Channels">
          {sortedChannels.map(channel => {
            const isActive = activeFilter === 'channels' && channel.id === activeChannelId;
            const unread = channelUnreadCounts[channel.id] ?? 0;
            return (
              <button
                key={channel.id}
                onClick={() => onChannelSelect(channel)}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'mx-2 flex min-h-[36px] items-center gap-2 rounded-lg border-l-2 px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'border-gold-primary bg-gold-primary/15 font-medium text-gold-primary'
                    : 'border-transparent text-white/70 hover:bg-white/5 hover:text-white',
                )}
              >
                <Hash size={14} className="shrink-0 opacity-60" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-left">
                  {formatChannelLabel(channel.channelName)}
                </span>
                {unread > 0 && !isActive && (
                  <span
                    className="shrink-0 rounded-full bg-gold-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-black"
                    aria-label={`${unread} unread`}
                  >
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
};
