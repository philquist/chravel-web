import React, { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search } from 'lucide-react';
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
}: SearchableVirtualMemberListProps<T>) {
  const [query, setQuery] = useState('');
  const parentRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter(item => item.searchText.toLowerCase().includes(normalized));
  }, [items, query]);

  const shouldVirtualize = filteredItems.length > LARGE_LIST_THRESHOLDS.virtualizeMinCount;
  const showSearch = items.length >= LARGE_LIST_THRESHOLDS.searchMinCount;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? filteredItems.length : 0,
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
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
            aria-label="Search members"
          />
        </div>
      )}

      {filteredItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          {items.length === 0 ? emptyLabel : noResultsLabel}
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
              const item = filteredItems[virtualRow.index];
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
          {filteredItems.map(item => (
            <div key={item.id} role="listitem">
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}

      {showSearch && query.trim() && (
        <p className="text-xs text-muted-foreground">
          Showing {filteredItems.length} of {items.length}
        </p>
      )}
    </div>
  );
}
