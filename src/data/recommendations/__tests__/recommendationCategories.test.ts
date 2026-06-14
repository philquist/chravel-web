import { describe, expect, it } from 'vitest';
import { getRecommendationsByType, recommendationsData } from '@/data/recommendations';
import { recommendationCategoryFilters } from '@/data/recommendations/categories';

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
        // Images are bundled locally — either a generated inline SVG data URI or
        // an imported asset path (real venue/team/landmark art via
        // realImageOverrides) — never a remote or protocol-relative URL. The
        // curated records intentionally moved from inline-SVG-only to real assets.
        expect(rec.images[0]).toMatch(/^(data:image\/|\/(?!\/))/);
        expect(rec.tags).toContain(
          category === 'landmarks' ? 'Landmark' : category === 'sports' ? 'Sports' : 'Nightlife',
        );
      }
    }
  });

  it('keeps shared category filter metadata in parity with curated categories', () => {
    const categoryIds = recommendationCategoryFilters.map(filter => filter.id);

    expect(categoryIds).toEqual(expect.arrayContaining(['nightlife', 'sports', 'landmarks']));
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
