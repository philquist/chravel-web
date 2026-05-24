import { invokeFunctionWithRetry } from './supabaseFunctionClient';
import type { ArtifactSearchResult, ArtifactSearchQuery } from '@/types/artifacts';

interface ArtifactSearchResponse {
  success: boolean;
  error?: string;
  results?: ArtifactSearchResult[];
}

export async function searchArtifactsByDomain(
  query: ArtifactSearchQuery,
): Promise<{ results: ArtifactSearchResult[]; error: string | null }> {
  const { data, error } = await invokeFunctionWithRetry<ArtifactSearchResponse>(
    'artifact-search',
    {
      tripId: query.tripId,
      query: query.query,
      artifactTypes: query.artifactTypes,
      sourceTypes: query.sourceTypes,
      createdAfter: query.createdAfter,
      createdBefore: query.createdBefore,
      creatorId: query.creatorId,
      limit: query.limit || 10,
      threshold: query.threshold || 0.5,
    },
    { retries: 1 },
  );

  if (error) {
    return { results: [], error: error.message };
  }

  if (!data?.success) {
    return { results: [], error: data?.error || 'Artifact search failed' };
  }

  return { results: data.results || [], error: null };
}
