import { useEffect, useMemo, useRef, useState } from 'react';
import type { Event } from 'stream-chat';
import {
  getStreamClient,
  onStreamClientConnected,
  onStreamClientConnectionStatusChange,
} from '@/services/stream/streamClient';
import { CHANNEL_TYPE_CHANNEL, proChannelId } from '@/services/stream/streamChannelFactory';

interface UseChannelUnreadCountsOptions {
  /** Supabase trip_channels ids for the channels visible to this user. */
  channelIds: string[];
  /** Master switch — pass isPro && !demoMode && !!user. */
  enabled: boolean;
  /**
   * The channel currently open in the view, if any. Its count is pinned to 0
   * (the open view marks it read; pinning avoids a badge flash in between).
   */
  activeChannelId?: string | null;
}

export interface ChannelUnreadCounts {
  /** Unread message count per Supabase channel id. */
  counts: Record<string, number>;
  /** Sum across all channels (for a rolled-up "Channels" badge). */
  totalUnread: number;
}

const EMPTY_COUNTS: Record<string, number> = {};
const RESEED_DEBOUNCE_MS = 500;

/**
 * Per-channel unread counts for pro role channels, sourced from Stream.
 *
 * Seeding: one queryChannels call (watch: false, state: true) mapping each
 * channel's countUnread() back to its Supabase id.
 *
 * Live updates: a client-level event ledger. `notification.message_new` fires
 * for member-but-not-watched channels — every rail channel except the open one
 * — and `message.new` covers the watched channel. `notification.mark_read` /
 * `message.read` (own user) zero a channel on cross-device reads.
 *
 * Deliberately NEVER calls watch()/stopWatching(): useStreamProChannel owns
 * the watched-channel lifecycle and calls stopWatching() on unmount — a second
 * watcher here would either fight that teardown or be killed by it. The ledger
 * needs no watchers because Stream keeps sending notification events for
 * channels the user is a member of.
 */
export function useChannelUnreadCounts({
  channelIds,
  enabled,
  activeChannelId,
}: UseChannelUnreadCountsOptions): ChannelUnreadCounts {
  const [counts, setCounts] = useState<Record<string, number>>(EMPTY_COUNTS);

  // Stable key so effects re-run only when the SET of channels changes.
  const channelIdsKey = useMemo(() => [...channelIds].sort().join(','), [channelIds]);

  const cidToChannelId = useMemo(() => {
    const map = new Map<string, string>();
    channelIds.forEach(id => {
      map.set(`${CHANNEL_TYPE_CHANNEL}:${proChannelId(id)}`, id);
    });
    return map;
  }, [channelIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps -- channelIdsKey is the memo key for channelIds

  const activeChannelIdRef = useRef<string | null | undefined>(activeChannelId);
  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
    // Opening a channel zeroes its badge immediately; the real markRead is
    // debounced in the channel view.
    if (activeChannelId) {
      setCounts(prev => (prev[activeChannelId] ? { ...prev, [activeChannelId]: 0 } : prev));
    }
  }, [activeChannelId]);

  useEffect(() => {
    if (!enabled || channelIds.length === 0) {
      setCounts(EMPTY_COUNTS);
      return;
    }

    let disposed = false;
    let seedTimer: ReturnType<typeof setTimeout> | null = null;
    let clientUnsubscribe: { unsubscribe: () => void } | null = null;
    let offConnected: (() => void) | null = null;
    let offStatusChange: (() => void) | null = null;

    const seed = async () => {
      const client = getStreamClient();
      if (!client?.userID || disposed) return;

      const cids = Array.from(cidToChannelId.keys());
      try {
        const channels = await client.queryChannels(
          { type: CHANNEL_TYPE_CHANNEL, cid: { $in: cids } },
          { last_message_at: -1 },
          { watch: false, state: true, presence: false, limit: 30 },
        );
        if (disposed) return;

        const next: Record<string, number> = {};
        channels.forEach(channel => {
          const supabaseId = channel.cid ? cidToChannelId.get(channel.cid) : undefined;
          if (!supabaseId) return;
          const userId = client.userID as string;
          const unread =
            channel.countUnread?.() ?? channel.state?.read?.[userId]?.unread_messages ?? 0;
          next[supabaseId] = supabaseId === activeChannelIdRef.current ? 0 : Math.max(0, unread);
        });
        setCounts(next);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[useChannelUnreadCounts] seed failed:', error);
        }
      }
    };

    const debouncedSeed = () => {
      if (seedTimer) clearTimeout(seedTimer);
      seedTimer = setTimeout(seed, RESEED_DEBOUNCE_MS);
    };

    const resolveEventChannelId = (event: Event): string | undefined => {
      const cid =
        event.cid ??
        (event.channel_type && event.channel_id
          ? `${event.channel_type}:${event.channel_id}`
          : undefined);
      return cid ? cidToChannelId.get(cid) : undefined;
    };

    const handleEvent = (event: Event) => {
      const client = getStreamClient();
      if (!client?.userID) return;

      if (event.type === 'notification.message_new' || event.type === 'message.new') {
        const supabaseId = resolveEventChannelId(event);
        if (!supabaseId) return;
        // Own messages and the open channel never accrue unread.
        const senderId = event.user?.id ?? event.message?.user?.id;
        if (senderId === client.userID) return;
        if (supabaseId === activeChannelIdRef.current) return;
        setCounts(prev => ({ ...prev, [supabaseId]: (prev[supabaseId] ?? 0) + 1 }));
        return;
      }

      if (event.type === 'notification.mark_read' || event.type === 'message.read') {
        // Only the user's own read state zeroes a badge (message.read fires
        // for other members' reads too).
        if (event.user?.id && event.user.id !== client.userID) return;
        const supabaseId = resolveEventChannelId(event);
        if (!supabaseId) return;
        setCounts(prev => (prev[supabaseId] ? { ...prev, [supabaseId]: 0 } : prev));
      }
    };

    const attach = () => {
      const client = getStreamClient();
      // typeof guard: a client mid-initialization (or a test double) may not
      // expose the event emitter yet — badges then rely on seed/re-seed only.
      if (!client || disposed || typeof client.on !== 'function') return false;
      clientUnsubscribe = client.on(handleEvent);
      return true;
    };

    if (getStreamClient()?.userID) {
      attach();
      void seed();
    } else {
      // Client not connected yet — attach + seed once it is.
      offConnected = onStreamClientConnected(() => {
        if (disposed || clientUnsubscribe) return;
        attach();
        void seed();
      });
    }

    // Reconnects can drop events — re-seed from server state.
    offStatusChange = onStreamClientConnectionStatusChange(isConnected => {
      if (isConnected) debouncedSeed();
    });

    return () => {
      disposed = true;
      if (seedTimer) clearTimeout(seedTimer);
      clientUnsubscribe?.unsubscribe();
      offConnected?.();
      offStatusChange?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- channelIdsKey stands in for channelIds
  }, [enabled, channelIdsKey, cidToChannelId]);

  const totalUnread = useMemo(
    () => Object.values(counts).reduce((sum, count) => sum + count, 0),
    [counts],
  );

  return { counts, totalUnread };
}
