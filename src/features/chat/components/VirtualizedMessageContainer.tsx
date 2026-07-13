import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { LoadMoreIndicator } from './LoadMoreIndicator';
import { DateSeparator } from './DateSeparator';
import { hapticService } from '@/services/hapticService';
import { ArrowDown } from 'lucide-react';

interface ChatMessageLike {
  id: string;
  created_at?: string;
  createdAt?: string;
  sender_id?: string;
  user_id?: string;
  /** Stream view models expose the sender as a nested object, not sender_id. */
  sender?: { id?: string };
}

/** Resolve sender identity across Stream view models and legacy shapes. */
function resolveSenderId(message: ChatMessageLike): string | null {
  return message.sender_id || message.user_id || message.sender?.id || null;
}

function formatStickyDateLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEE, MMM d');
}

interface VirtualizedMessageContainerProps {
  messages: ChatMessageLike[];
  renderMessage: (
    message: ChatMessageLike,
    index: number,
    showSenderInfo: boolean,
    isLastInGroup: boolean,
  ) => React.ReactNode;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  initialVisibleCount?: number;
  loadMoreThreshold?: number;
  className?: string;
  style?: React.CSSProperties;
  autoScroll?: boolean;
  restoreScroll?: boolean;
  scrollKey?: string;
  scrollContainerRef?: React.MutableRefObject<HTMLDivElement | null>;
  /**
   * Captured once per chat open — inserts an iMessage-style "New Messages"
   * divider immediately before this message id. Cleared on unmount by parent.
   */
  firstUnreadMessageId?: string | null;
}

type RowItem =
  | { type: 'date'; date: Date }
  | { type: 'time-gap'; date: Date; key: string }
  | { type: 'unread-divider'; key: string }
  | {
      type: 'message';
      message: ChatMessageLike;
      index: number;
      showSenderInfo: boolean;
      isLastInGroup: boolean;
    };

const ROW_HEIGHT_ESTIMATE = 72;
const DATE_ROW_HEIGHT = 40;
const TIME_GAP_ROW_HEIGHT = 28;
const UNREAD_DIVIDER_HEIGHT = 32;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
/** Plan: collapse consecutive same-sender messages within a 3-minute window. */
const GROUP_WINDOW_MS = 3 * 60 * 1000;

export const VirtualizedMessageContainer: React.FC<VirtualizedMessageContainerProps> = ({
  messages,
  renderMessage,
  onLoadMore,
  hasMore,
  isLoading,
  initialVisibleCount = 10,
  className = '',
  style,
  autoScroll = true,
  restoreScroll = true,
  scrollKey = 'chat-scroll',
  scrollContainerRef,
  firstUnreadMessageId = null,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [userIsScrolledUp, setUserIsScrolledUp] = useState(false);
  const [showNewMessagesBadge, setShowNewMessagesBadge] = useState(false);
  const [stickyDate, setStickyDate] = useState<Date | null>(null);
  const previousMessageCountRef = useRef(messages.length);
  const isLoadingRef = useRef(false);
  const pageSize = 20;
  const [visibleStartIndex, setVisibleStartIndex] = useState(
    Math.max(0, messages.length - initialVisibleCount),
  );
  const localHasMore = visibleStartIndex > 0;
  const visibleMessages = messages.slice(visibleStartIndex);

  // Entrance animation only for messages that arrive after the initial mount.
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const entranceInitializedRef = useRef(false);
  const [enteringMessageIds, setEnteringMessageIds] = useState<Set<string>>(() => new Set());
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!entranceInitializedRef.current) {
      messages.forEach(message => seenMessageIdsRef.current.add(message.id));
      entranceInitializedRef.current = true;
      return;
    }

    const newlyArrived = messages.filter(message => !seenMessageIdsRef.current.has(message.id));
    if (newlyArrived.length === 0) return;

    newlyArrived.forEach(message => seenMessageIdsRef.current.add(message.id));
    if (prefersReducedMotion) return;

    const newIds = newlyArrived.map(message => message.id);
    setEnteringMessageIds(prev => {
      const next = new Set(prev);
      newIds.forEach(id => next.add(id));
      return next;
    });

    const timer = window.setTimeout(() => {
      setEnteringMessageIds(prev => {
        const next = new Set(prev);
        newIds.forEach(id => next.delete(id));
        return next;
      });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [messages, prefersReducedMotion]);

  const setContainerNode = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (scrollContainerRef) {
        scrollContainerRef.current = node;
      }
    },
    [scrollContainerRef],
  );

  const rows = useMemo((): RowItem[] => {
    const result: RowItem[] = [];
    visibleMessages.forEach((message, idx) => {
      const currentDate = new Date(message.created_at || message.createdAt || 0);
      const prevMessage = visibleMessages[idx - 1];
      const prevDate = prevMessage
        ? new Date(prevMessage.created_at || prevMessage.createdAt || 0)
        : null;
      const showDateSeparator = !prevDate || !isSameDay(currentDate, prevDate);
      if (showDateSeparator) {
        result.push({ type: 'date', date: currentDate });
      } else if (prevDate && currentDate.getTime() - prevDate.getTime() >= FIFTEEN_MINUTES_MS) {
        // Inline time-gap pill for long silences within the same day (iMessage-style).
        result.push({
          type: 'time-gap',
          date: currentDate,
          key: `gap-${message.id}`,
        });
      }

      // Unread divider sits just above the first unread message (once per open).
      if (firstUnreadMessageId && message.id === firstUnreadMessageId) {
        result.push({ type: 'unread-divider', key: `unread-${message.id}` });
      }

      const senderId = resolveSenderId(message);
      const prevSenderId = prevMessage ? resolveSenderId(prevMessage) : null;
      const withinWindow = prevDate
        ? currentDate.getTime() - prevDate.getTime() < GROUP_WINDOW_MS
        : false;
      const showSenderInfo =
        showDateSeparator || !senderId || senderId !== prevSenderId || !withinWindow;

      const nextMessage = visibleMessages[idx + 1];
      const nextDate = nextMessage
        ? new Date(nextMessage.created_at || nextMessage.createdAt || 0)
        : null;
      const nextSenderId = nextMessage ? resolveSenderId(nextMessage) : null;
      const nextWithinWindow = nextDate
        ? nextDate.getTime() - currentDate.getTime() < GROUP_WINDOW_MS
        : false;
      const nextSameDay = nextDate ? isSameDay(currentDate, nextDate) : false;
      const isLastInGroup =
        !nextMessage || !senderId || senderId !== nextSenderId || !nextWithinWindow || !nextSameDay;

      result.push({
        type: 'message',
        message,
        index: visibleStartIndex + idx,
        showSenderInfo,
        isLastInGroup,
      });
    });
    return result;
  }, [visibleMessages, visibleStartIndex, firstUnreadMessageId]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: index => {
      const row = rows[index];
      if (row?.type === 'date') return DATE_ROW_HEIGHT;
      if (row?.type === 'time-gap') return TIME_GAP_ROW_HEIGHT;
      if (row?.type === 'unread-divider') return UNREAD_DIVIDER_HEIGHT;
      return ROW_HEIGHT_ESTIMATE;
    },
    overscan: 5,
    getItemKey: index => {
      const row = rows[index];
      if (!row) return index;
      if (row.type === 'date') return `date-${row.date.getTime()}`;
      if (row.type === 'time-gap') return row.key;
      if (row.type === 'unread-divider') return row.key;
      return row.message.id;
    },
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Sticky date pill — mirrors the last date separator above the viewport.
  // Compare by timestamp so we don't setState(new Date) every render (OOM loop).
  useEffect(() => {
    if (virtualItems.length === 0) {
      setStickyDate(prev => (prev === null ? prev : null));
      return;
    }
    const firstVisibleIndex = virtualItems[0]?.index ?? 0;
    let latestDate: Date | null = null;
    for (let i = 0; i <= firstVisibleIndex; i++) {
      const row = rows[i];
      if (row?.type === 'date') latestDate = row.date;
      if (row?.type === 'message') {
        latestDate = new Date(row.message.created_at || row.message.createdAt || 0);
      }
    }
    const nextTs = latestDate && !Number.isNaN(latestDate.getTime()) ? latestDate.getTime() : null;
    setStickyDate(prev => {
      const prevTs = prev ? prev.getTime() : null;
      if (prevTs === nextTs) return prev;
      return nextTs === null ? null : new Date(nextTs);
    });
  }, [virtualItems, rows]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowNewMessagesBadge(false);
    setUserIsScrolledUp(false);
  }, []);

  useEffect(() => {
    if (!autoScroll) return;
    const newMessageCount = messages.length;
    const oldMessageCount = previousMessageCountRef.current;
    if (newMessageCount > oldMessageCount && !userIsScrolledUp) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      });
    }
  }, [messages.length, autoScroll, userIsScrolledUp]);

  useEffect(() => {
    if (!restoreScroll || !containerRef.current) return;
    const savedScroll = localStorage.getItem(scrollKey);
    if (savedScroll) {
      containerRef.current.scrollTop = parseInt(savedScroll, 10);
    } else {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        });
      });
    }
  }, [scrollKey, restoreScroll]);

  useEffect(() => {
    if (!restoreScroll || !containerRef.current) return;
    const container = containerRef.current;
    const saveScrollPosition = () => {
      if (container) {
        localStorage.setItem(scrollKey, container.scrollTop.toString());
      }
    };
    let scrollTimer: ReturnType<typeof setTimeout>;
    const handleScrollSave = () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(saveScrollPosition, 500);
    };
    container.addEventListener('scroll', handleScrollSave, { passive: true });
    return () => {
      clearTimeout(scrollTimer);
      saveScrollPosition();
      container.removeEventListener('scroll', handleScrollSave);
    };
  }, [scrollKey, restoreScroll]);

  useEffect(() => {
    const newMessageCount = messages.length;
    const oldMessageCount = previousMessageCountRef.current;
    if (newMessageCount > oldMessageCount) {
      if (!userIsScrolledUp) {
        setVisibleStartIndex(Math.max(0, newMessageCount - initialVisibleCount));
        setShowNewMessagesBadge(false);
      } else {
        setShowNewMessagesBadge(true);
      }
    } else if (newMessageCount < oldMessageCount) {
      setVisibleStartIndex(Math.max(0, newMessageCount - initialVisibleCount));
    }
    previousMessageCountRef.current = newMessageCount;
  }, [messages.length, userIsScrolledUp, initialVisibleCount]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isScrolledUp = distanceFromBottom > 100;
    setUserIsScrolledUp(isScrolledUp);

    if (!isScrolledUp) {
      setShowNewMessagesBadge(false);
    } else {
      setShowNewMessagesBadge(true);
    }

    if (scrollTop < 200 && !isLoadingRef.current && !isLoading) {
      if (localHasMore) {
        isLoadingRef.current = true;
        const prevScrollHeight = containerRef.current.scrollHeight;
        setVisibleStartIndex(prev => Math.max(0, prev - pageSize));
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (containerRef.current) {
              const newScrollHeight = containerRef.current.scrollHeight;
              containerRef.current.scrollTop = scrollTop + (newScrollHeight - prevScrollHeight);
            }
            isLoadingRef.current = false;
          });
        });
        hapticService.light();
      } else if (hasMore) {
        hapticService.light();
        onLoadMore();
      }
    }
  }, [hasMore, onLoadMore, localHasMore, pageSize, isLoading]);

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      {stickyDate && (
        <div className="pointer-events-none absolute top-1 left-0 right-0 z-20 flex justify-center">
          <div className="px-3 py-1 rounded-full bg-background/85 backdrop-blur-md border border-border/40 shadow-sm">
            <span className="text-[11px] text-muted-foreground font-medium">
              {formatStickyDateLabel(stickyDate)}
            </span>
          </div>
        </div>
      )}

      <div
        ref={setContainerNode}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto scroll-smooth ${className}`}
        style={{ WebkitOverflowScrolling: 'touch', ...style }}
      >
        <LoadMoreIndicator
          isLoading={isLoading}
          hasMore={hasMore}
          localHasMore={localHasMore}
          messageCount={messages.length}
        />

        <div
          className="p-3"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map(virtualRow => {
            const row = rows[virtualRow.index];
            if (!row) return null;
            const wrapperStyle: React.CSSProperties = {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            };
            if (row.type === 'date') {
              return (
                <div
                  key={`date-${row.date.getTime()}`}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={wrapperStyle}
                >
                  <DateSeparator date={row.date} />
                </div>
              );
            }
            if (row.type === 'time-gap') {
              const label = row.date.toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              });
              return (
                <div
                  key={row.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={wrapperStyle}
                >
                  <div className="flex items-center justify-center py-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">
                      {label}
                    </span>
                  </div>
                </div>
              );
            }
            if (row.type === 'unread-divider') {
              return (
                <div
                  key={row.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  data-unread-divider="true"
                  style={wrapperStyle}
                >
                  <div
                    className="flex items-center gap-3 py-2"
                    role="separator"
                    aria-label="New messages"
                  >
                    <div className="flex-1 h-px bg-primary/40" />
                    <span className="text-[10px] uppercase tracking-wider text-primary font-semibold whitespace-nowrap">
                      New Messages
                    </span>
                    <div className="flex-1 h-px bg-primary/40" />
                  </div>
                </div>
              );
            }

            // 2px between grouped bubbles, 12px after a group ends (plan).
            const spacingClass = row.isLastInGroup ? 'pb-3' : 'pb-0.5';
            const shouldAnimateEntrance = enteringMessageIds.has(row.message.id);
            return (
              <div
                key={row.message.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                data-last-in-group={row.isLastInGroup ? 'true' : 'false'}
                data-show-sender-info={row.showSenderInfo ? 'true' : 'false'}
                className={
                  shouldAnimateEntrance
                    ? `${spacingClass} animate-in fade-in slide-in-from-bottom-1 duration-200`
                    : spacingClass
                }
                style={wrapperStyle}
              >
                {renderMessage(row.message, row.index, row.showSenderInfo, row.isLastInGroup)}
              </div>
            );
          })}
        </div>
        <div ref={messagesEndRef} className="h-px" aria-hidden="true" />
      </div>

      {showNewMessagesBadge && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={scrollToBottom}
            className="bg-muted/50 text-muted-foreground px-4 py-1.5 rounded-full text-xs flex items-center justify-center gap-1.5 hover:bg-muted/70 transition-all active:scale-95"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            New messages
          </button>
        </div>
      )}
    </div>
  );
};
