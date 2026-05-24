import React, { useState, useEffect } from 'react';
import { Search, MapPin, X } from 'lucide-react';
import { Button } from '../ui/button';
import { useBasecamp } from '../../contexts/BasecampContext';
import { useQuery } from '@tanstack/react-query';
import { autocomplete, generateSessionToken } from '@/services/googlePlacesNew';
import type { ConvertedPrediction } from '@/types/places';
import { getPermissionStatus } from '@/lib/webPermissions';

interface LocationSearchBarProps {
  onLocationSelect: (location: string) => void;
  currentLocation?: string;
  autoFromBasecamp?: boolean;
}

type NormalizedSuggestion = {
  id: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

const normalizePrediction = (prediction: ConvertedPrediction): NormalizedSuggestion => ({
  id: prediction.place_id,
  description: prediction.description,
  mainText: prediction.structured_formatting?.main_text ?? prediction.description,
  secondaryText: prediction.structured_formatting?.secondary_text ?? '',
});

export const LocationSearchBar = ({
  onLocationSelect,
  currentLocation,
  autoFromBasecamp = false,
}: LocationSearchBarProps) => {
  const [searchValue, setSearchValue] = useState(currentLocation || '');
  const [debouncedValue, setDebouncedValue] = useState(searchValue);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [locationPermissionState, setLocationPermissionState] = useState('unknown');
  const { basecamp } = useBasecamp();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(searchValue.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchValue]);

  useEffect(() => {
    let active = true;
    getPermissionStatus('location')
      .then(status => {
        if (!active) return;
        setLocationPermissionState(status.state);
      })
      .catch(() => {
        if (active) setLocationPermissionState('unknown');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (autoFromBasecamp && basecamp && !currentLocation) {
      const city = extractCityFromAddress(basecamp.address);
      setSearchValue(city);
      onLocationSelect(city);
    }
  }, [autoFromBasecamp, basecamp, currentLocation, onLocationSelect]);

  const extractCityFromAddress = (address: string) => {
    const parts = address.split(',');
    return parts[parts.length - 2]?.trim() || address;
  };

  const { data: suggestions = [], isFetching: isLoading } = useQuery({
    queryKey: ['location-autocomplete', debouncedValue.toLowerCase(), locationPermissionState],
    enabled: debouncedValue.length >= 2,
    queryFn: async () => {
      const predictions = await autocomplete(debouncedValue, generateSessionToken(), undefined);
      return predictions.slice(0, 5).map(normalizePrediction);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const handleSearch = (value: string) => {
    setSearchValue(value);
    setShowSuggestions(value.length >= 2);
  };

  const handleLocationSelect = (location: string) => {
    setSearchValue(location);
    setShowSuggestions(false);
    onLocationSelect(location);
  };

  const handleClear = () => {
    setSearchValue('');
    setDebouncedValue('');
    setShowSuggestions(false);
    onLocationSelect('');
  };

  return (
    <div className="relative w-full max-w-md mx-auto mb-4">
      <div className="relative">
        <Search
          size={18}
          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={searchValue}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search city or location..."
          className="w-full bg-background border border-border rounded-xl pl-10 pr-10 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
        />
        {searchValue && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-auto p-1"
          >
            <X size={16} />
          </Button>
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map(suggestion => (
            <button
              key={suggestion.id}
              onClick={() => handleLocationSelect(suggestion.description)}
              className="w-full text-left px-4 py-3 hover:bg-muted transition-colors flex items-center gap-3 border-b border-border/50 last:border-b-0"
            >
              <MapPin size={16} className="text-muted-foreground flex-shrink-0" />
              <div>
                <div className="font-medium text-foreground">{suggestion.mainText}</div>
                <div className="text-sm text-muted-foreground">{suggestion.secondaryText}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-xl shadow-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="animate-spin h-4 w-4 gold-gradient-spinner"></div>
            <span className="text-sm">Searching locations...</span>
          </div>
        </div>
      )}
    </div>
  );
};
