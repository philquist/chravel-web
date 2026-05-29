import { useQuery } from '@tanstack/react-query';
import {
  RecommendationService,
  RecommendationFilters,
  SponsoredFilters,
} from '@/services/recommendationService';
import { getRecommendationsByType } from '@/data/recommendations';
import type { Recommendation } from '@/data/recommendations/types';

interface UseRecommendationsOptions {
  city?: string;
  type?: Recommendation['type'] | 'all';
  limit?: number;
  sponsoredRatio?: number;
  location?: string;
  tripType?: string;
  /**
   * Serve the bundled mock feed (src/data/recommendations) instead of querying
   * live Supabase. Used by the admin/demo-only Recs preview, which is mock-based
   * during MVP. City filtering is applied by the caller.
   */
  useMockData?: boolean;
}

export const useRecommendations = (options: UseRecommendationsOptions | string = 'all') => {
  // Backwards compatibility for when we pass just the activeFilter string
  const opts: UseRecommendationsOptions =
    typeof options === 'string' ? { type: options as Recommendation['type'] | 'all' } : options;
  const activeFilter = opts.type;

  const typeFilter = activeFilter === 'all' ? undefined : (activeFilter as Recommendation['type']);
  const cityFilter = opts.city;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'recommendations',
      opts.useMockData ? 'mock' : 'live',
      activeFilter,
      cityFilter,
      opts.location,
      opts.tripType,
      opts.limit,
      opts.sponsoredRatio,
    ],
    queryFn: async () => {
      // Mock-data path: return the bundled feed (sponsored items are already
      // interleaved). No network/RLS dependency, so it works for unauthenticated
      // app-preview sessions too.
      if (opts.useMockData) {
        const items = getRecommendationsByType(activeFilter ?? 'all');
        return opts.limit ? items.slice(0, opts.limit) : items;
      }

      const organicFilters: RecommendationFilters = {
        city: cityFilter,
        type: typeFilter,
        limit: opts.limit,
      };

      const sponsoredFilters: SponsoredFilters = {
        location: opts.location || cityFilter, // Use city as fallback for location targeting
        tripType: opts.tripType,
      };

      try {
        const [organic, sponsored] = await Promise.all([
          RecommendationService.getOrganicItems(organicFilters),
          RecommendationService.getSponsoredItems(sponsoredFilters),
        ]);

        return RecommendationService.blendFeed(organic, sponsored, opts.sponsoredRatio);
      } catch (err) {
        console.error('Failed to fetch recommendations:', err);
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    recommendations: data || [],
    hasRecommendations: (data?.length ?? 0) > 0,
    isLoading,
    error,
    refetch,
  };
};
