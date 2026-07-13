import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, MessageCircle, Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  searchChatContentWithFilters,
  MessageSearchResult,
  BroadcastSearchResult,
} from '@/services/chatSearchService';
import { parseMessageSearchQuery } from '@/lib/parseMessageSearchQuery';
import { format } from 'date-fns';

interface MockMessage {
  id: string;
  text: string;
  sender: { id: string; name: string; avatar?: string };
  createdAt: string;
  isBroadcast?: boolean;
  tags?: string[];
}

interface ChatSearchOverlayProps {
  tripId: string;
  onClose: () => void;
  onResultSelect: (params: {
    id: string;
    type: 'message' | 'broadcast';
    openThread?: boolean;
  }) => void;
  isDemoMode?: boolean;
  demoMessages?: MockMessage[];
}

// Stable default — inline `= []` creates a new array every render and, combined with
// the search effect's demoMessages dependency + setState on empty query, infinite-loops
// (hangs Vitest / freezes the search overlay).
const EMPTY_DEMO_MESSAGES: MockMessage[] = [];

export const ChatSearchOverlay = ({
  tripId,
  onClose,
  onResultSelect,
  isDemoMode = false,
  demoMessages = EMPTY_DEMO_MESSAGES,
}: ChatSearchOverlayProps) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [messages, setMessages] = useState<MessageSearchResult[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const totalResults = messages.length + broadcasts.length;

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      // Avoid setState([]) on every effect run — new [] !== previous [] and would
      // re-render forever when demoMessages (or other deps) are unstable.
      setMessages(prev => (prev.length === 0 ? prev : []));
      setBroadcasts(prev => (prev.length === 0 ? prev : []));
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        if (isDemoMode && demoMessages.length > 0) {
          // Local search through demo messages
          const lowerQuery = query.toLowerCase();

          // Filter regular messages
          const matchedMessages = demoMessages
            .filter(msg => !msg.isBroadcast && msg.text.toLowerCase().includes(lowerQuery))
            .map(msg => ({
              id: msg.id,
              content: msg.text,
              author_name: msg.sender.name,
              user_id: msg.sender.id,
              created_at: msg.createdAt,
              type: 'message' as const,
            }));

          // Filter broadcasts
          const matchedBroadcasts = demoMessages
            .filter(msg => msg.isBroadcast && msg.text.toLowerCase().includes(lowerQuery))
            .map(msg => ({
              id: msg.id,
              message: msg.text,
              created_by: msg.sender.id,
              created_by_name: msg.sender.name,
              priority: msg.tags?.includes('urgent')
                ? 'urgent'
                : msg.tags?.includes('logistics')
                  ? 'high'
                  : 'normal',
              created_at: msg.createdAt,
              type: 'broadcast' as const,
            }));

          setMessages(matchedMessages);
          setBroadcasts(matchedBroadcasts);
        } else {
          // Query Supabase for authenticated mode (supports filters: from:, broadcast, day:, etc.)
          const parsed = parseMessageSearchQuery(query);
          const results = await searchChatContentWithFilters(tripId, parsed);
          setMessages(results.messages);
          setBroadcasts(results.broadcasts);
        }
      } catch (error) {
        console.error('Chat search failed:', error);
      } finally {
        setIsSearching(false);
        setSelectedIndex(0);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, tripId, isDemoMode, demoMessages]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, totalResults - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && totalResults > 0) {
        e.preventDefault();
        handleResultClick(selectedIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyboard handler; deps would cause excessive re-registration
  }, [selectedIndex, totalResults]);

  // Auto-scroll to selected result
  useEffect(() => {
    if (resultsRef.current && totalResults > 0) {
      const selectedElement = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      // jsdom does not implement scrollIntoView; guard so search UI stays mounted in tests.
      selectedElement?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedIndex, totalResults]);

  const handleResultClick = (index: number) => {
    if (index < messages.length) {
      const message = messages[index];
      if (message.parent_message_id) {
        onResultSelect({
          id: message.parent_message_id,
          type: 'message',
          openThread: true,
        });
        return;
      }

      onResultSelect({ id: message.id, type: 'message' });
    } else {
      const broadcast = broadcasts[index - messages.length];
      onResultSelect({ id: broadcast.id, type: 'broadcast' });
    }
  };

  const getPriorityBadge = (priority: string | null) => {
    if (!priority || priority === 'normal') return null;

    const config =
      {
        urgent: { bg: 'bg-red-500', text: 'Urgent' },
        high: { bg: 'bg-orange-500', text: 'High' },
        reminder: { bg: 'bg-blue-500', text: 'Reminder' },
      }[priority] || null;

    if (!config) return null;

    return (
      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium text-white', config.bg)}>
        {config.text}
      </span>
    );
  };

  const getSnippet = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  /**
   * Portal to document.body so the overlay is not under TripTabs' overflow-y-auto.
   * iOS WKWebView treats fixed descendants of scroll containers incorrectly (layout + focus).
   */
  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 bg-black/80 backdrop-blur-md animate-fade-in"
      style={{
        paddingTop: 'max(5rem, calc(env(safe-area-inset-top, 0px) + 1.5rem))',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search messages"
        className="w-full max-w-2xl bg-card text-card-foreground rounded-2xl shadow-2xl border border-border overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 p-3 sm:p-4 border-b border-border">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden />
          <div className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search messages"
              className="w-full min-w-0 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-base pr-11 chat-search-input"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear message search"
                onClick={() => setQuery('')}
                className="absolute right-0 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Back to chat"
            onClick={onClose}
            className="ml-1 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <X className="w-5 h-5" />
            <span className="hidden sm:inline">Back</span>
          </button>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="max-h-[60vh] overflow-y-auto scrollbar-hide">
          {isSearching && <div className="p-8 text-center text-muted-foreground">Searching...</div>}

          {!isSearching && totalResults === 0 && query && (
            <div className="p-8 text-center text-muted-foreground">
              No results found for "{query}"
            </div>
          )}

          {!isSearching && totalResults === 0 && !query && (
            <div className="p-8 text-center text-muted-foreground space-y-2">
              <p>Search messages</p>
              <p className="text-xs text-muted-foreground/80">Filters: from:Name · broadcast</p>
            </div>
          )}

          {/* Messages Section */}
          {messages.length > 0 && (
            <div className="border-b border-border">
              <div className="px-4 py-2 bg-muted/60 flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-foreground/80">Messages</span>
                <span className="text-xs text-muted-foreground">({messages.length})</span>
              </div>
              {messages.map((message, index) => (
                <button
                  key={message.id}
                  data-index={index}
                  onClick={() => handleResultClick(index)}
                  className={cn(
                    'w-full text-left px-4 py-3 hover:bg-muted/60 transition-colors border-b border-border',
                    selectedIndex === index && 'bg-blue-500/20',
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">
                      {message.author_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(message.created_at), 'MMM d, h:mm a')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {getSnippet(message.content, 120)}
                  </p>
                  {message.parent_message_id && (
                    <p className="text-[11px] text-blue-300/80 mt-1">↳ In thread reply</p>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Broadcasts Section */}
          {broadcasts.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-muted/60 flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-[#B91C1C]" />
                <span className="text-sm font-medium text-foreground/80">Broadcasts</span>
                <span className="text-xs text-muted-foreground">({broadcasts.length})</span>
              </div>
              {broadcasts.map((broadcast, index) => {
                const globalIndex = messages.length + index;
                return (
                  <button
                    key={broadcast.id}
                    data-index={globalIndex}
                    onClick={() => handleResultClick(globalIndex)}
                    className={cn(
                      'w-full text-left px-4 py-3 hover:bg-muted/60 transition-colors border-b border-border',
                      selectedIndex === globalIndex && 'bg-[#B91C1C]/20',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {broadcast.created_by_name}
                        </span>
                        {getPriorityBadge(broadcast.priority)}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(broadcast.created_at), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {getSnippet(broadcast.message, 120)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        {totalResults > 0 && (
          <div className="px-4 py-2 bg-muted/60 border-t border-border flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(overlay, document.body);
};
