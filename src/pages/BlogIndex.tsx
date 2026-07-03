import { Link } from 'react-router-dom';
// Dual-routed page (MarketingApp AND the authenticated App shell) — the
// marketing fonts + data-marketing scope must travel with the component.
import '@/styles/marketingFonts';
import { ArrowRight } from 'lucide-react';
import { JsonLd, SeoHead } from '@/components/seo/SeoHead';
import { ArticleHeader, EditorialKicker, GoldRule } from '@/components/landing/Editorial';
import { useForceDarkTheme } from '@/hooks/useForceDarkTheme';
import { SITE_NAME, SITE_URL, breadcrumbJsonLd, siteIdentityJsonLd } from '@/lib/seo';
import { BLOG_PATH, estimateReadingMinutes, formatBlogDate, getSortedBlogPosts } from '@/lib/blog';

const INDEX_TITLE = 'ChravelApp Blog | Guides for Group Travel, Events, and Travel Pros';
const INDEX_DESCRIPTION =
  'Practical guides on coordinating group travel, weddings, sports, touring, and travel-concierge client experiences with ChravelApp.';
const INDEX_H1 = 'The ChravelApp blog';
const INDEX_DEK =
  'Practical guides on coordinating group travel, events, and moving teams — from wedding weekends to touring runs to travel-concierge client experiences.';

const buildJsonLd = (posts: ReturnType<typeof getSortedBlogPosts>) => [
  ...siteIdentityJsonLd(),
  breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Blog', path: BLOG_PATH },
  ]),
  {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `${SITE_NAME} Blog`,
    url: `${SITE_URL}${BLOG_PATH}`,
    blogPost: posts.map(post => ({
      '@type': 'BlogPosting',
      headline: post.h1,
      description: post.description,
      datePublished: post.datePublished,
      url: `${SITE_URL}${BLOG_PATH}/${post.slug}`,
    })),
  },
];

export default function BlogIndex() {
  useForceDarkTheme();
  const posts = getSortedBlogPosts();
  const [lead, ...restPosts] = posts;

  return (
    <main data-marketing="true" className="relative min-h-screen bg-background text-foreground">
      {/* Ambient masthead tint */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            'radial-gradient(110% 100% at 50% 0%, rgba(196,151,70,0.09) 0%, rgba(196,151,70,0.03) 45%, transparent 75%)',
        }}
        aria-hidden="true"
      />

      <SeoHead title={INDEX_TITLE} description={INDEX_DESCRIPTION} path={BLOG_PATH} />
      <JsonLd data={buildJsonLd(posts)} />

      <div className="relative max-w-4xl mx-auto px-4 py-12 md:py-16 space-y-12">
        <ArticleHeader
          kicker="The Journal"
          title={INDEX_H1}
          dek={INDEX_DEK}
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Blog' }]}
        />

        {/* Lead story */}
        {lead && (
          <section aria-label="Latest post">
            <Link
              to={`${BLOG_PATH}/${lead.slug}`}
              className="group block rounded-2xl border border-white/10 bg-white/[0.03] p-7 md:p-9 transition-colors hover:border-gold-primary/40"
            >
              <EditorialKicker>Latest</EditorialKicker>
              <h2 className="mt-3 text-2xl md:text-4xl leading-snug text-white">{lead.h1}</h2>
              <p className="mt-3 text-base md:text-lg leading-relaxed text-white/65">
                {lead.excerpt}
              </p>
              <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-white/50">
                <time dateTime={lead.datePublished}>{formatBlogDate(lead.datePublished)}</time>
                <span className="text-gold-primary/70" aria-hidden="true">
                  ·
                </span>
                <span>{estimateReadingMinutes(lead)} min read</span>
                <span className="ml-auto inline-flex items-center gap-1.5 font-semibold text-gold-light">
                  Read article
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </p>
            </Link>
          </section>
        )}

        {/* Post rail — clean reporting rows */}
        <section>
          <h2 className="sr-only">Latest posts</h2>
          <div className="divide-y divide-white/10 border-y border-white/10">
            {restPosts.map(post => (
              <Link
                key={post.slug}
                to={`${BLOG_PATH}/${post.slug}`}
                className="group block py-6 transition-colors hover:bg-white/[0.02] md:px-4 md:-mx-4"
              >
                <p className="flex items-center gap-2 text-xs text-white/45">
                  <time dateTime={post.datePublished}>{formatBlogDate(post.datePublished)}</time>
                  <span className="text-gold-primary/70" aria-hidden="true">
                    ·
                  </span>
                  <span>{estimateReadingMinutes(post)} min read</span>
                </p>
                <h3 className="mt-2 text-xl md:text-2xl leading-snug text-white transition-colors group-hover:text-gold-light">
                  {post.h1}
                </h3>
                <p className="mt-2 text-sm md:text-base leading-relaxed text-white/60">
                  {post.excerpt}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 md:p-10 text-center space-y-4">
          <GoldRule className="mx-auto w-24" />
          <h2 className="text-2xl md:text-3xl text-white">Start your first trip</h2>
          <p className="mx-auto max-w-2xl text-base md:text-lg text-white/65">
            Put the itinerary, tasks, attachments, photos, places, and updates in one shared
            workspace — and invite the group.
          </p>
          <div className="pt-2">
            <Link
              to="/auth"
              className="accent-fill-gold inline-flex min-h-11 items-center rounded-xl px-6 py-3 font-semibold"
            >
              Get started free
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
