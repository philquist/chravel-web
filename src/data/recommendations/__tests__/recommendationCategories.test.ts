import { describe, expect, it } from 'vitest';
import { getRecommendationsByType, recommendationsData } from '@/data/recommendations';

const newCategories = ['nightlife', 'sports', 'landmarks'] as const;

describe('recommendation category seed data', () => {
  it('includes Nightlife, Sports, and Landmarks records with unique IDs', () => {
    const ids = new Set(recommendationsData.map(rec => rec.id));

    expect(ids.size).toBe(recommendationsData.length);
    for (const category of newCategories) {
      expect(getRecommendationsByType(category).length).toBeGreaterThan(0);
    }
  });

  it('keeps new curated records organic with safe outbound links and CTAs', () => {
    for (const category of newCategories) {
      for (const rec of getRecommendationsByType(category)) {
        expect(rec.isSponsored).toBe(false);
        expect(rec.sponsorBadge).toBeUndefined();
        expect(rec.promoText).toBeUndefined();
        expect(rec.ctaButton.action).toBe('view');
        expect(rec.externalLink).toMatch(/^https:\/\//);
        expect(rec.images).toHaveLength(1);
        expect(rec.images[0]).not.toMatch(/^https?:\/\//);
        expect(rec.images[0]).toMatch(/(?:\.svg(?:\?|$)|^data:image\/svg\+xml)/);
        expect(rec.tags).toContain(
          category === 'landmarks' ? 'Landmark' : category === 'sports' ? 'Sports' : 'Nightlife',
        );
      }
    }
  });

  it('includes the requested LA teams and global landmarks', () => {
    const titles = recommendationsData.map(rec => rec.title);

    expect(titles).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Los Angeles Lakers'),
        expect.stringContaining('Los Angeles Clippers'),
        expect.stringContaining('Los Angeles Rams'),
        expect.stringContaining('Los Angeles Chargers'),
        expect.stringContaining('Los Angeles Dodgers'),
        expect.stringContaining('Los Angeles Angels'),
        expect.stringContaining('Los Angeles Kings'),
        expect.stringContaining('Los Angeles Football Club'),
        expect.stringContaining('LA Galaxy'),
        expect.stringContaining('USC Trojans'),
        expect.stringContaining('UCLA Bruins'),
        expect.stringContaining('Hollywood Sign'),
        expect.stringContaining('Pyramids of Giza'),
        expect.stringContaining('Templo Mayor'),
        expect.stringContaining('Eiffel Tower'),
        expect.stringContaining('Sydney Opera House'),
      ]),
    );
  });
});
