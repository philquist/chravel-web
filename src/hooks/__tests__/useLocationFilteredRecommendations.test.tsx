import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getRecommendationsByType } from '@/data/recommendations';
import { useLocationFilteredRecommendations } from '@/hooks/useLocationFilteredRecommendations';

describe('useLocationFilteredRecommendations', () => {
  it('surfaces organic curated categories in the primary Travel Recs feed', () => {
    const { result } = renderHook(() => useLocationFilteredRecommendations('nightlife'));

    expect(result.current.hasRecommendations).toBe(true);
    expect(result.current.recommendations).toEqual(getRecommendationsByType('nightlife'));
    expect(result.current.recommendations.every(rec => rec.type === 'nightlife')).toBe(true);
  });

  it('keeps All inclusive of sponsored and organic mock recommendations', () => {
    const { result } = renderHook(() => useLocationFilteredRecommendations('all'));

    expect(result.current.recommendations.some(rec => rec.isSponsored)).toBe(true);
    expect(result.current.recommendations.some(rec => !rec.isSponsored)).toBe(true);
    expect(result.current.recommendations.some(rec => rec.type === 'sports')).toBe(true);
    expect(result.current.recommendations.some(rec => rec.type === 'landmarks')).toBe(true);
  });
});
