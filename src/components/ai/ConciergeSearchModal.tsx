import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  X,
  Calendar,
  CheckSquare,
  BarChart2,
  CreditCard,
  MapPin,
  Link,
  Image,
  ChevronDown,
} from 'lucide-react';
import { BodyPortalOverlayShell } from '@/components/overlays/BodyPortalOverlayShell';
import { useUniversalSearch } from '@/hooks/useUniversalSearch';
import { ContentType, UniversalSearchResult } from '@/services/universalSearchService';

/** Initial number of results shown per category before "Show more" */
const INITIAL_RESULTS_LIMIT = 5;

interface ConciergeSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  onNavigate: (result: UniversalSearchResult) => void;
}

export const ConciergeSearchModal = ({
  open,
  onOpenChange,
  tripId,
  onNavigate,
}: ConciergeSearchModalProps) => {
  const [query, setQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<ContentType>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const contentTypes: ContentType[] = useMemo(
    () => [
      'messages',
      'concierge',
      'calendar',
      'task',
      'poll',
      'payment',
      'place',
      'link',
      'media',
    ],
    [],
  );

  const { results, isLoading } = useUniversalSearch(query, {
    contentTypes,
    tripIds: [tripId],
  });

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleDeactivate = useCallback(() => {
    setQuery('');
    setExpandedCategories(new Set());
  }, []);

  const groupedResults = useMemo(() => {
    const groups: Partial<Record<ContentType, UniversalSearchResult[]>> = {};
    results.forEach(result => {
      if (!groups[result.contentType]) {
        groups[result.contentType] = [];
      }
      groups[result.contentType]!.push(result);
    });
    return groups;
  }, [results]);

  const handleSelect = (result: UniversalSearchResult) => {
    let tab = '';
    switch (result.contentType) {
      case 'concierge':
        tab = 'concierge';
        break;
      case 'messages':
        tab = 'chat';
        break;
      case 'calendar':
        tab = 'calendar';
        break;
      case 'task':
        tab = 'tasks';
        break;
      case 'poll':
        tab = 'polls';
        break;
      case 'payment':
        tab = 'payments';
        break;
      case 'place':
        tab = 'places';
        break;
      case 'link':
        tab = 'places';
        break;
      case 'media':
        tab = 'media';
        break;
      default:
        tab = 'chat';
    }

    onNavigate({ ...result, metadata: { ...(result.metadata ?? {}), tab } });
    handleClose();
  };

  /** Memoized highlight with cached regex to avoid recompilation per render */
  const highlight = useCallback((text: string, q: string) => {
    if (!q || q.length < 2) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;

    let display = text;
    if (text.length > 100) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(text.length, idx + q.length + 60);
      display = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
    }

    const parts = display.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark key={i} className="bg-gold-primary/30 text-foreground rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  }, []);

  const getIcon = (type: ContentType) => {
    switch (type) {
      case 'concierge':
        return <Search size={14} className="text-gold-primary" />;
      case 'messages':
        return <Search size={14} className="text-sky-400" />;
      case 'calendar':
        return <Calendar size={14} className="text-blue-400" />;
      case 'task':
        return <CheckSquare size={14} className="text-green-400" />;
      case 'poll':
        return <BarChart2 size={14} className="text-purple-400" />;
      case 'payment':
        return <CreditCard size={14} className="text-amber-400" />;
      case 'place':
        return <MapPin size={14} className="text-red-400" />;
      case 'link':
        return <Link size={14} className="text-cyan-400" />;
      case 'media':
        return <Image size={14} className="text-pink-400" />;
      default:
        return <Search size={14} className="text-neutral-400" />;
    }
  };

  const getLabel = (type: ContentType) => {
    switch (type) {
      case 'concierge':
        return 'Concierge';
      case 'messages':
        return 'Chat Messages';
      case 'calendar':
        return 'Calendar';
      case 'task':
        return 'Tasks';
      case 'poll':
        return 'Polls';
      case 'payment':
        return 'Payments';
      case 'place':
        return 'Chat Links';
      case 'link':
        return 'Explore Links';
      case 'media':
        return 'Media';
      default:
        return 'Other';
    }
  };

  const categoryOrder: ContentType[] = [
    'messages',
    'concierge',
    'calendar',
    'task',
    'poll',
    'payment',
    'place',
    'link',
    'media',
  ];

  const toggleCategory = (type: ContentType) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  return (
    <BodyPortalOverlayShell
      open={open}
      onClose={handleClose}
      onDeactivate={handleDeactivate}
      ariaLabel="Trip Search"
      panelClassName="max-w-lg"
      overlayTestId="concierge-search-overlay"
      panelTestId="concierge-search-modal"
      inputRef={inputRef}
    >
      <div className="flex items-center gap-2 p-3 sm:p-4 border-b border-border">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gold-primary pointer-events-none"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search across trip..."
            aria-label="Search across trip"
            data-testid="concierge-search-input"
            className="w-full min-h-11 bg-muted border border-border rounded-lg pl-9 pr-11 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gold-primary/50 transition-all"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80"
              aria-label="Clear search"
              data-testid="concierge-search-clear"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          aria-label="Close trip search"
          data-testid="concierge-search-close"
        >
          <X className="h-5 w-5" />
          <span className="hidden sm:inline">Close</span>
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-0 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent bg-background">
        {isLoading && results.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm animate-pulse flex flex-col items-center gap-2">
            <div className="w-6 h-6 gold-gradient-spinner animate-spin" />
            <span>Searching trip...</span>
          </div>
        )}

        {!isLoading && query.trim().length >= 2 && results.length === 0 && (
          <div className="py-12 text-center text-sm">
            <p className="text-foreground font-medium">No results found for &quot;{query}&quot;</p>
            <p className="text-xs mt-2 text-muted-foreground">
              Try searching tasks, events, places...
            </p>
          </div>
        )}

        {results.length > 0 && (
          <div className="py-2 space-y-4">
            {categoryOrder.map(type => {
              const items = groupedResults[type];
              if (!items || items.length === 0) return null;

              const isExpanded = expandedCategories.has(type);
              const visibleItems = isExpanded ? items : items.slice(0, INITIAL_RESULTS_LIMIT);
              const hasMore = items.length > INITIAL_RESULTS_LIMIT;

              return (
                <div key={type} className="space-y-1">
                  <div className="px-4 py-1 flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/60 backdrop-blur-sm sticky top-0 z-10 border-y border-border">
                    {getIcon(type)}
                    <span>{getLabel(type)}</span>
                    <span className="ml-auto bg-muted text-muted-foreground px-1.5 rounded-sm">
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-0.5 px-2">
                    {visibleItems.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className="w-full text-left px-3 py-3 rounded-lg hover:bg-muted transition-all group flex items-start gap-3 active:scale-[0.99]"
                      >
                        <div className="mt-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity bg-muted p-1.5 rounded-md">
                          {getIcon(type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <p className="text-sm font-medium text-foreground truncate transition-colors">
                              {highlight(item.title, query)}
                            </p>
                            {item.timestamp && (
                              <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                                {new Date(item.timestamp).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {highlight(item.snippet, query)}
                          </p>
                        </div>
                      </button>
                    ))}
                    {hasMore && !isExpanded && (
                      <button
                        type="button"
                        onClick={() => toggleCategory(type)}
                        className="w-full text-center py-2 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
                      >
                        <ChevronDown size={12} />
                        Show {items.length - INITIAL_RESULTS_LIMIT} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!query && (
          <div className="py-16 text-center px-6">
            <div className="w-16 h-16 bg-gold-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-gold-primary/30">
              <Search className="text-gold-primary" size={24} />
            </div>
            <h3 className="text-foreground font-medium mb-1">Trip Search</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
              Search across Concierge, Calendar, Tasks, Places, and more.
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-xs mx-auto">
              {['Events', 'Tasks', 'Concierge', 'Places', 'Payments'].map(tag => (
                <span
                  key={tag}
                  className="text-xs bg-muted border border-border text-muted-foreground px-2.5 py-1 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </BodyPortalOverlayShell>
  );
};
