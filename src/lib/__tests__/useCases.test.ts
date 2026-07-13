import { describe, expect, it } from 'vitest';
import {
  USE_CASES,
  USE_CASES_PATH,
  getUseCaseDetail,
  getUseCaseHref,
  hasDetail,
  type UseCaseSummary,
} from '@/lib/useCases';

describe('useCases registry', () => {
  it('resolves the travel concierge page by slug', () => {
    const uc = getUseCaseDetail('travel-concierge-client-portal');
    expect(uc).toBeDefined();
    expect(uc?.h1).toMatch(/client-ready trip portal/i);
    expect(uc?.body.length).toBeGreaterThan(0);
    expect(uc?.featureMap.length).toBeGreaterThan(0);
    expect(uc?.faq.length).toBeGreaterThan(0);
  });

  it('returns undefined for unknown slugs', () => {
    expect(getUseCaseDetail('does-not-exist')).toBeUndefined();
    expect(getUseCaseDetail(undefined)).toBeUndefined();
  });

  it('resolves the weddings, sports, touring, families, and conferences pages', () => {
    for (const slug of [
      'wedding-guest-coordination-app',
      'sports-team-travel-coordination',
      'music-tour-coordination',
      'family-organization-app',
      'conference-event-management-app',
      'business-travel-coordination',
    ]) {
      const uc = getUseCaseDetail(slug);
      expect(uc, `${slug} should resolve`).toBeDefined();
      expect(uc?.body.length).toBeGreaterThan(0);
      expect(uc?.featureMap.length).toBeGreaterThan(0);
      expect(uc?.faq.length).toBeGreaterThan(0);
      expect(uc?.cta.primaryTo).toBeTruthy();
    }
  });

  it('links published internal pages to /use-cases/{slug}', () => {
    const concierge = USE_CASES.find(uc => uc.slug === 'travel-concierge-client-portal');
    expect(getUseCaseHref(concierge!)).toBe(`${USE_CASES_PATH}/travel-concierge-client-portal`);
  });

  it('honors href overrides instead of generating a duplicate URL', () => {
    const groupTrips = USE_CASES.find(uc => uc.slug === 'group-travel-planning-app');
    expect(groupTrips?.status).toBe('published');
    expect(getUseCaseHref(groupTrips!)).toBe('/group-travel-planning-app');
  });

  it('gives a coming-soon card no link (mechanism)', () => {
    const comingSoon: UseCaseSummary = {
      slug: 'future-use-case',
      status: 'coming-soon',
      cardTitle: 'Future',
      cardTagline: 'Not live yet',
      cardCtaLabel: 'Coming soon',
    };
    expect(getUseCaseHref(comingSoon)).toBeUndefined();
  });

  // Invariant: a published page served at /use-cases/{slug} (no href override) MUST carry
  // full detail content, or the route would render a 404 for an advertised card.
  it('every internally-published entry has authored detail', () => {
    for (const uc of USE_CASES) {
      if (uc.status === 'published' && !uc.href) {
        expect(hasDetail(uc), `${uc.slug} is published internally but has no detail`).toBe(true);
      }
    }
  });

  it('every authored detail has a CTA target and unique slug', () => {
    const slugs = USE_CASES.map(uc => uc.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const uc of USE_CASES) {
      if (hasDetail(uc)) {
        expect(uc.cta.primaryTo, `${uc.slug} missing CTA target`).toBeTruthy();
        expect(uc.seo.title).toBeTruthy();
        expect(uc.seo.description).toBeTruthy();
      }
    }
  });
});
