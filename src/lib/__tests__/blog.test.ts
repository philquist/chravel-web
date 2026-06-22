import { describe, expect, it } from 'vitest';
import {
  BLOG_POSTS,
  estimateReadingMinutes,
  formatBlogDate,
  getBlogPost,
  getSortedBlogPosts,
  type BlogPost,
} from '@/lib/blog';
import { USE_CASES, getUseCaseHref } from '@/lib/useCases';

const postLinks = (post: BlogPost): string[] => [
  ...post.related.map(r => r.to),
  ...post.sections.flatMap(s => (s.link ? [s.link.to] : [])),
  post.cta.secondaryTo ?? '',
];

describe('blog registry', () => {
  it('publishes the travel-concierge post and links to its use-case page', () => {
    const post = getBlogPost('travel-concierge-better-client-experience-after-booking');
    expect(post).toBeDefined();
    expect(post?.sections.length).toBeGreaterThan(0);

    // The post must internally link to the concierge use-case page somewhere
    // (in-content link, related links, or CTA) for cluster SEO.
    const links = [
      ...post!.related.map(r => r.to),
      ...post!.sections.flatMap(s => (s.link ? [s.link.to] : [])),
      post!.cta.secondaryTo ?? '',
    ];
    expect(links).toContain('/use-cases/travel-concierge-client-portal');
  });

  it('every concierge post resolves and links to the use-case page', () => {
    for (const slug of [
      'travel-concierge-better-client-experience-after-booking',
      'how-to-share-itineraries-files-receipts-with-travel-clients',
      'why-whatsapp-google-drive-not-enough-luxury-travel-planning',
      'how-to-create-client-trip-portal-without-custom-app',
    ]) {
      const post = getBlogPost(slug);
      expect(post, `${slug} should resolve`).toBeDefined();
      const links = [
        ...post!.related.map(r => r.to),
        ...post!.sections.flatMap(s => (s.link ? [s.link.to] : [])),
        post!.cta.secondaryTo ?? '',
      ];
      expect(links, `${slug} should link to the concierge page`).toContain(
        '/use-cases/travel-concierge-client-portal',
      );
    }
  });

  it('the wedding-photos post resolves and links to the weddings use-case page', () => {
    const post = getBlogPost('collect-wedding-guest-photos-iphone-android');
    expect(post).toBeDefined();
    const links = [
      ...post!.related.map(r => r.to),
      ...post!.sections.flatMap(s => (s.link ? [s.link.to] : [])),
      post!.cta.secondaryTo ?? '',
    ];
    expect(links).toContain('/use-cases/wedding-guest-coordination-app');
  });

  it('the family-hub post resolves and links to the families use-case page', () => {
    const post = getBlogPost('family-hub-app-for-parents');
    expect(post).toBeDefined();
    const links = [
      ...post!.related.map(r => r.to),
      ...post!.sections.flatMap(s => (s.link ? [s.link.to] : [])),
      post!.cta.secondaryTo ?? '',
    ];
    expect(links).toContain('/use-cases/family-organization-app');
  });

  it('returns undefined for unknown slugs', () => {
    expect(getBlogPost('does-not-exist')).toBeUndefined();
    expect(getBlogPost(undefined)).toBeUndefined();
  });

  it('every post has a unique slug, title, description, CTA target, and ISO date', () => {
    const slugs = BLOG_POSTS.map(p => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const post of BLOG_POSTS) {
      expect(post.title, `${post.slug} title`).toBeTruthy();
      expect(post.description, `${post.slug} description`).toBeTruthy();
      expect(post.cta.primaryTo, `${post.slug} CTA target`).toBeTruthy();
      expect(post.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('every post internally links to a real use-case destination', () => {
    const useCaseDestinations = new Set(
      USE_CASES.map(getUseCaseHref).filter((href): href is string => Boolean(href)),
    );
    for (const post of BLOG_POSTS) {
      const links = postLinks(post);
      expect(
        links.some(link => useCaseDestinations.has(link)),
        `${post.slug} should link to a use-case page`,
      ).toBe(true);
    }
  });

  it('estimates a positive reading time', () => {
    const post = getBlogPost('travel-concierge-better-client-experience-after-booking')!;
    expect(estimateReadingMinutes(post)).toBeGreaterThan(0);
  });

  it('formats ISO dates without timezone drift', () => {
    expect(formatBlogDate('2026-06-21')).toBe('June 21, 2026');
  });

  it('sorts posts newest first', () => {
    const sorted = getSortedBlogPosts();
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].datePublished >= sorted[i].datePublished).toBe(true);
    }
  });
});
