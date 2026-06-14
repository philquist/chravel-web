import { useMemo } from 'react';
import { getRecommendationsByType } from '../data/recommendations';

export const useLocationFilteredRecommendations = (
  activeFilter: string = 'all',
  manualLocation?: string,
) => {
  const recommendations = useMemo(() => {
    return getRecommendationsByType(activeFilter);
  }, [activeFilter]);

  const filteredRecommendations = useMemo(() => {
    // Mock-mode recommendations include both sponsored partner-style cards and
    // organic curated cards. Keep all records here so organic categories such as
    // Nightlife/Sports/Landmarks render on the primary Travel Recs surface.
    let filtered = recommendations;

    // Only apply location filtering when manualLocation is explicitly provided
    if (manualLocation && manualLocation.trim()) {
      filtered = filtered.filter(
        rec =>
          rec.city.toLowerCase().includes(manualLocation.toLowerCase()) ||
          rec.location.toLowerCase().includes(manualLocation.toLowerCase()) ||
          // For transportation, also show global/multi-city services
          (rec.type === 'transportation' &&
            (rec.location.includes('Multiple Cities') ||
              rec.location.includes('All Major Airports') ||
              rec.location.includes('Business Travel Worldwide') ||
              rec.location.includes('Multi-City Business Travel') ||
              rec.distance === 'Available citywide' ||
              rec.distance === 'Worldwide availability' ||
              rec.distance === 'All locations' ||
              rec.distance === 'Global coverage' ||
              rec.distance === 'Available for teams')),
      );
    }

    return filtered;
  }, [recommendations, manualLocation]);

  const activeLocation = manualLocation || '';
  const isBasecampLocation = false;

  return {
    recommendations: filteredRecommendations,
    hasRecommendations: filteredRecommendations.length > 0,
    activeLocation,
    isBasecampLocation,
  };
};
