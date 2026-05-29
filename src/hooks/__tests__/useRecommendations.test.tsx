import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/services/recommendationService', () => ({
  RecommendationService: {
    getOrganicItems: vi.fn(),
    getSponsoredItems: vi.fn(),
    blendFeed: vi.fn(),
  },
}));

import { RecommendationService } from '@/services/recommendationService';
import { recommendationsData, getRecommendationsByType } from '@/data/recommendations';
import { useRecommendations } from '@/hooks/useRecommendations';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useRecommendations — mock-data mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves the bundled mock feed without hitting the live service', async () => {
    const { result } = renderHook(() => useRecommendations({ type: 'all', useMockData: true }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.recommendations).toHaveLength(recommendationsData.length);
    expect(result.current.error).toBeNull();
    // Mock mode must not query Supabase (avoids RLS error state for app-preview).
    expect(RecommendationService.getOrganicItems).not.toHaveBeenCalled();
    expect(RecommendationService.getSponsoredItems).not.toHaveBeenCalled();
  });

  it('filters the mock feed by type', async () => {
    const { result } = renderHook(() => useRecommendations({ type: 'hotel', useMockData: true }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.recommendations).toEqual(getRecommendationsByType('hotel'));
    expect(result.current.recommendations.every(r => r.type === 'hotel')).toBe(true);
  });
});
