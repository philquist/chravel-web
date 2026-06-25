import React, { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { LARGE_LIST_THRESHOLDS } from '@/lib/largeListThresholds';

export interface SearchableMemberListItem {
  id: string;
  searchText: string;
}

interface SearchableVirtualMemberListProps<T extends SearchableMemberListItem> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  emptyLabel?: string;
  noResultsLabel?: string;
  searchPlaceholder?: string;
  listAriaLabel?: string;
  maxHeightClassName?: string;
  rowHeight?: number;
  /** When true, search is server-driven via onSearchQueryChange (no client-side filter). */
  serverSearch?: boolean;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  totalCount?: number;
  isSearchLoading?: boolean;
}

export function SearchableVirtualMemberList<T extends SearchableMemberListItem>({
  items,
  renderItem,
  emptyLabel = 'No members found',
  noResultsLabel = 'No members match your search',
  searchPlaceholder = 'Search members…',
  listAriaLabel = 'Member list',
  maxHeightClassName = 'max-h-[50vh]',
  rowHeight = 56,
  serverSearch = false,
  searchQuery = '',
  onSearchQueryChange,
  totalCount,
  isSearchLoading = false,
}: SearchableVirtualMemberListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [internalQuery, setInternalQuery] = useState('');
  const isControlledSearch = onSearchQueryChange !== undefined;
  const effectiveQuery = isControlledSearch ? searchQuery : internalQuery;

  const handleSearchChange = (nextQuery: string) => {
    if (isControlledSearch) {
      onSearchQueryChange?.(nextQuery);
      return;
    }
    setInternalQuery(nextQuery);
  };

  const displayedItems = useMemo(() => {
    if (serverSearch) return items;
    const normalized = effectiveQuery.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter(item => item.searchText.toLowerCase().includes(normalized));
  }, [items, effectiveQuery, serverSearch]);

  const shouldVirtualize = displayedItems.length > LARGE_LIST_THRESHOLDS.virtualizeMinCount;
  const showSearch = serverSearch || items.length >= LARGE_LIST_THRESHOLDS.searchMinCount;
  const resolvedTotalCount = totalCount ?? items.length;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? displayedItems.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 5,
  });

  return (
    <div className="space-y-3">
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={effectiveQuery}
            onChange={event => handleSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9 pr-9"
            aria-label="Search members"
          />
          {isSearchLoading && (
            <Loader2
              className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground"
              aria-hidden
            />
          )}
        </div>
      )}

      {displayedItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          {items.length === 0 && !isSearchLoading ? emptyLabel : noResultsLabel}
        </p>
      ) : shouldVirtualize ? (
        <div
          ref={parentRef}
          className={`overflow-auto pr-1 ${maxHeightClassName}`}
          role="list"
          aria-label={listAriaLabel}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map(virtualRow => {
              const item = displayedItems[virtualRow.index];
              return (
                <div
                  key={item.id}
                  role="listitem"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {renderItem(item)}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className={`overflow-auto pr-1 ${maxHeightClassName}`}
          role="list"
          aria-label={listAriaLabel}
        >
          {displayedItems.map(item => (
            <div key={item.id} role="listitem">
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}

      {showSearch && effectiveQuery.trim() && (
        <p className="text-xs text-muted-foreground">
          Showing {displayedItems.length} of {resolvedTotalCount}
        </p>
      )}
    </div>
  );
}
