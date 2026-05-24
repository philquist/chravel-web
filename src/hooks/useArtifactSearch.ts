import { useState, useCallback } from 'react';
import { useDemoMode } from '@/hooks/useDemoMode';
import type { ArtifactSearchResult, ArtifactSearchQuery } from '@/types/artifacts';
import { searchArtifactsByDomain } from '@/services/dal/artifactSearchService';

interface SearchState {
  isSearching: boolean;
  error: string | null;
  results: ArtifactSearchResult[];
}

export function useArtifactSearch() {
  const [state, setState] = useState<SearchState>({
    isSearching: false,
    error: null,
    results: [],
  });
  const { isDemoMode } = useDemoMode();

  const searchArtifacts = useCallback(
    async (query: ArtifactSearchQuery): Promise<ArtifactSearchResult[]> => {
      if (!query.tripId || !query.query) {
        console.warn('[useArtifactSearch] tripId and query are required');
        return [];
      }

      if (isDemoMode) {
        setState({ isSearching: false, error: null, results: [] });
        return [];
      }

      setState(prev => ({ ...prev, isSearching: true, error: null }));

      try {
        const { results, error } = await searchArtifactsByDomain(query);

        if (error) {
          throw new Error(error);
        }
        setState({ isSearching: false, error: null, results });
        return results;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[useArtifactSearch] Failed:', errorMessage);
        setState({ isSearching: false, error: errorMessage, results: [] });
        return [];
      }
    },
    [isDemoMode],
  );

  const clearResults = useCallback(() => {
    setState({ isSearching: false, error: null, results: [] });
  }, []);

  return {
    ...state,
    searchArtifacts,
    clearResults,
  };
}
