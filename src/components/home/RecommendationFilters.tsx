import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Hotel,
  UtensilsCrossed,
  MapPin,
  Camera,
  Star,
  Car,
  Search,
  X,
  Bookmark,
  Martini,
  Trophy,
  Landmark,
} from 'lucide-react';

interface RecommendationFiltersProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  showInlineSearch?: boolean;
  /** Controlled free-text search value (city / place / tag). */
  searchValue?: string;
  /** When provided, renders the compact search affordance and reports query changes. */
  onSearchChange?: (query: string) => void;
}

const filters = [
  { id: 'all', label: 'All', icon: Star },
  { id: 'saved', label: 'Saved', icon: Bookmark },
  { id: 'hotel', label: 'Hotels', icon: Hotel },
  { id: 'restaurant', label: 'Dining', icon: UtensilsCrossed },
  { id: 'activity', label: 'Activities', icon: MapPin },
  { id: 'tour', label: 'Tours', icon: Camera },
  { id: 'experience', label: 'Experiences', icon: Star },
  { id: 'transportation', label: 'Transportation', icon: Car },
  { id: 'nightlife', label: 'Nightlife', icon: Martini },
  { id: 'sports', label: 'Sports', icon: Trophy },
  { id: 'landmarks', label: 'Landmarks', icon: Landmark },
];

export const RecommendationFilters = ({
  activeFilter,
  onFilterChange,
  showInlineSearch,
  searchValue = '',
  onSearchChange,
}: RecommendationFiltersProps) => {
  const [searchOpen, setSearchOpen] = useState(false);
  // Only treat search as available when a handler is wired — avoids a dead control.
  const searchable = Boolean(showInlineSearch && onSearchChange);

  const closeSearch = () => {
    setSearchOpen(false);
    onSearchChange?.('');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div
          className="flex flex-1 flex-nowrap gap-2 overflow-x-auto scrollbar-hide native-scroll px-1 pb-1"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {filters.map(filter => {
            const Icon = filter.icon;
            const isActive = activeFilter === filter.id;

            return (
              <Button
                key={filter.id}
                variant="outline"
                size="sm"
                aria-pressed={isActive}
                className={`flex items-center gap-2 whitespace-nowrap ${
                  isActive
                    ? // Gold border + translucent gold fill is the selected signal.
                      // Text stays WHITE so the label is always legible on the dark UI.
                      'border-gold-primary bg-gold-primary/15 text-white hover:bg-gold-primary/25 hover:text-white'
                    : 'border-border/50 hover:border-accent/50'
                }`}
                onClick={() => onFilterChange(filter.id)}
              >
                <Icon className="w-4 h-4" />
                {filter.label}
              </Button>
            );
          })}
        </div>

        {searchable && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={searchOpen ? 'Close search' : 'Search recommendations'}
            aria-expanded={searchOpen}
            className="h-9 w-9 shrink-0 rounded-full border-border/50"
            onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
          >
            {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {searchable && searchOpen && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={searchValue}
            onChange={e => onSearchChange?.(e.target.value)}
            placeholder="Search city or place…"
            // Height matches the pill row (h-9) so the row never grows taller than the pills.
            className="h-9 pl-9 pr-9"
          />
          {searchValue && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearchChange?.('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
