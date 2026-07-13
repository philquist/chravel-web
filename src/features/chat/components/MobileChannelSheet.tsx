import React from 'react';
import { Hash, MessageCircle } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { hapticService } from '@/services/hapticService';
import { cn } from '@/lib/utils';
import type { TripChannel } from '@/types/roleChannels';

interface MobileChannelSheetProps {
  isOpen: boolean;
  onClose: () => void;
  channels: TripChannel[];
  activeChannelId: string | null;
  /** null = back to all messages. */
  onSelect: (channel: TripChannel | null) => void;
  channelUnreadCounts: Record<string, number>;
}

const formatChannelLabel = (name?: string) =>
  (name || 'channel').toLowerCase().replace(/\s+/g, '-');

/**
 * Bottom-sheet channel picker for mobile pro trips — replaces the cramped
 * popover with full-width, thumb-reachable rows (same Drawer pattern as
 * MobileHeaderOptionsSheet).
 */
export const MobileChannelSheet: React.FC<MobileChannelSheetProps> = ({
  isOpen,
  onClose,
  channels,
  activeChannelId,
  onSelect,
  channelUnreadCounts,
}) => {
  const sortedChannels = [...channels].sort((a, b) => a.channelName.localeCompare(b.channelName));

  const handleSelect = (channel: TripChannel | null) => {
    hapticService.light();
    onClose();
    onSelect(channel);
  };

  return (
    <Drawer open={isOpen} onOpenChange={open => !open && onClose()}>
      <DrawerContent className="bg-gray-900 border-gray-800">
        <DrawerHeader className="border-b border-gray-800 pb-4">
          <DrawerTitle className="text-white text-center">Channels</DrawerTitle>
        </DrawerHeader>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <button
            onClick={() => handleSelect(null)}
            className="flex w-full items-center gap-4 rounded-xl bg-gray-800/50 p-4 text-left transition-all hover:bg-gray-800 active:scale-[0.98]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-primary/20">
              <MessageCircle size={20} className="text-gold-mid" />
            </div>
            <p className="font-medium text-white">All Messages</p>
          </button>

          {sortedChannels.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-gray-400">
              Channels are created from roles in the Team tab.
            </p>
          )}

          {sortedChannels.map(channel => {
            const unread = channelUnreadCounts[channel.id] ?? 0;
            const isActive = channel.id === activeChannelId;
            return (
              <button
                key={channel.id}
                onClick={() => handleSelect(channel)}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all active:scale-[0.98]',
                  isActive
                    ? 'bg-gold-primary/15 ring-1 ring-gold-primary/40'
                    : 'bg-gray-800/50 hover:bg-gray-800',
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                  <Hash size={20} className={isActive ? 'text-gold-mid' : 'text-white/60'} />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'truncate font-medium',
                      isActive ? 'text-gold-mid' : 'text-white',
                    )}
                  >
                    {formatChannelLabel(channel.channelName)}
                  </p>
                  <p className="text-sm text-gray-400">
                    {channel.memberCount ?? 0}{' '}
                    {(channel.memberCount ?? 0) === 1 ? 'member' : 'members'}
                  </p>
                </div>
                {unread > 0 && !isActive && (
                  <span className="shrink-0 rounded-full bg-gold-primary px-2 py-1 text-xs font-semibold leading-none text-black">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
};
