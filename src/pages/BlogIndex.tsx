import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { JsonLd, SeoHead } from '@/components/seo/SeoHead';
import { SITE_NAME, SITE_URL, breadcrumbJsonLd, siteIdentityJsonLd } from '@/lib/seo';
import { BLOG_PATH, estimateReadingMinutes, formatBlogDate, getSortedBlogPosts } from '@/lib/blog';

const INDEX_TITLE = 'ChravelApp Blog | Guides for Group Travel, Events, and Travel Pros';
const INDEX_DESCRIPTION =
  'Practical guides on coordinating group travel, weddings, sports, touring, and travel-concierge client experiences with ChravelApp.';
const INDEX_H1 = 'The ChravelApp blog';

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
  const posts = getSortedBlogPosts();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SeoHead title={INDEX_TITLE} description={INDEX_DESCRIPTION} path={BLOG_PATH} />
      <JsonLd data={buildJsonLd(posts)} />

      <div className="max-w-4xl mx-auto px-4 py-12 md:py-16 space-y-10">
        {/* Header */}
        <header className="space-y-4">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link to="/" className="hover:text-primary transition-colors">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-foreground">Blog</li>
            </ol>
          </nav>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight">{INDEX_H1}</h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            Practical guides on coordinating group travel, events, and moving teams — from wedding
            weekends to touring runs to travel-concierge client experiences.
          </p>
        </header>

        {/* Posts */}
        <section className="space-y-5">
          <h2 className="sr-only">Latest posts</h2>
          {posts.map(post => (
            <Link
              key={post.slug}
              to={`${BLOG_PATH}/${post.slug}`}
              className="block rounded-2xl border border-border bg-card/50 backdrop-blur-sm p-6 hover:border-primary/50 transition-colors"
            >
              <p className="text-xs text-muted-foreground">
                <time dateTime={post.datePublished}>{formatBlogDate(post.datePublished)}</time>
                <span aria-hidden="true"> · </span>
                <span>{estimateReadingMinutes(post)} min read</span>
              </p>
              <h3 className="mt-2 text-xl md:text-2xl font-bold text-foreground">{post.h1}</h3>
              <p className="mt-2 text-sm md:text-base text-muted-foreground leading-relaxed">
                {post.excerpt}
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                Read article
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-border bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 p-8 md:p-10 text-center space-y-4">
          <h2 className="text-2xl md:text-3xl font-bold">Start your first trip</h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Put the itinerary, tasks, attachments, photos, places, and updates in one shared
            workspace — and invite the group.
          </p>
          <div className="pt-2">
            <Link
              to="/auth"
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Get started free
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
