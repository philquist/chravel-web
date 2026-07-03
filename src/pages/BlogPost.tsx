import { Link, useParams } from 'react-router-dom';
// Dual-routed page (MarketingApp AND the authenticated App shell) — the
// marketing fonts + data-marketing scope must travel with the component.
import '@/styles/marketingFonts';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { JsonLd, SeoHead } from '@/components/seo/SeoHead';
import {
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  SITE_URL,
  breadcrumbJsonLd,
  faqJsonLd,
  siteIdentityJsonLd,
} from '@/lib/seo';
import {
  BLOG_PATH,
  estimateReadingMinutes,
  formatBlogDate,
  getBlogPost,
  type BlogPost as BlogPostType,
} from '@/lib/blog';

const postPath = (slug: string) => `${BLOG_PATH}/${slug}`;

/** Structured data: site identity + the article + breadcrumb + optional FAQ. */
const buildJsonLd = (post: BlogPostType) => {
  const url = `${SITE_URL}${postPath(post.slug)}`;
  const data = [
    ...siteIdentityJsonLd(),
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.h1,
      description: post.description,
      datePublished: post.datePublished,
      dateModified: post.dateModified ?? post.datePublished,
      author: { '@type': 'Organization', name: post.author, url: SITE_URL },
      publisher: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: SITE_URL,
        logo: { '@type': 'ImageObject', url: DEFAULT_OG_IMAGE },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      url,
    },
    breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Blog', path: BLOG_PATH },
      { name: post.h1, path: postPath(post.slug) },
    ]),
  ];
  if (post.faq && post.faq.length > 0) data.push(faqJsonLd(post.faq));
  return data;
};

/** Shown for unknown post slugs. Kept out of the index. */
function PostNotFound({ slug }: { slug: string }) {
  return (
    <main data-marketing="true" className="min-h-screen bg-background text-foreground">
      <SeoHead
        title="Article not found | ChravelApp"
        description="Browse the ChravelApp blog for guides on group travel and coordination."
        path={postPath(slug)}
        noindex
      />
      <section className="max-w-3xl mx-auto px-4 py-24 text-center space-y-6">
        <h1 className="text-3xl font-bold">This article isn’t available</h1>
        <p className="text-lg text-muted-foreground">It may have moved. Browse the latest posts.</p>
        <Link
          to={BLOG_PATH}
          className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground"
        >
          Go to the blog
        </Link>
      </section>
    </main>
  );
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = getBlogPost(slug);

  if (!post) return <PostNotFound slug={slug ?? ''} />;

  const seoConfig = { title: post.title, description: post.description, path: postPath(post.slug) };
  const readingMinutes = estimateReadingMinutes(post);

  return (
    <main data-marketing="true" className="min-h-screen bg-background text-foreground">
      <SeoHead {...seoConfig} />
      <JsonLd data={buildJsonLd(post)} />

      <article className="max-w-3xl mx-auto px-4 py-12 md:py-16 space-y-10">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link to="/" className="hover:text-primary transition-colors">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link to={BLOG_PATH} className="hover:text-primary transition-colors">
                Blog
              </Link>
            </li>
          </ol>
        </nav>

        {/* Header */}
        <header className="space-y-4">
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {post.tags.map(tag => (
                <span
                  key={tag}
                  className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <h1 className="text-3xl md:text-4xl font-bold leading-tight">{post.h1}</h1>
          <p className="text-sm text-muted-foreground">
            <span>{post.author}</span>
            <span aria-hidden="true"> · </span>
            <time dateTime={post.datePublished}>{formatBlogDate(post.datePublished)}</time>
            <span aria-hidden="true"> · </span>
            <span>{readingMinutes} min read</span>
          </p>
          <p className="text-lg text-muted-foreground leading-relaxed">{post.excerpt}</p>
        </header>

        {/* Body */}
        <div className="space-y-8">
          {post.sections.map((section, i) => (
            <section key={i} className="space-y-3">
              {section.heading && (
                <h2 className="text-2xl font-bold leading-snug">{section.heading}</h2>
              )}
              {section.paragraphs?.map((paragraph, j) => (
                <p key={j} className="text-base md:text-lg text-foreground leading-relaxed">
                  {paragraph}
                </p>
              ))}
              {section.list && (
                <ul className="list-disc space-y-2 pl-6 text-base md:text-lg text-foreground">
                  {section.list.map((item, j) => (
                    <li key={j} className="leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
              {section.link && (
                <p>
                  <Link
                    to={section.link.to}
                    className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
                  >
                    {section.link.label}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </p>
              )}
            </section>
          ))}
        </div>

        {/* FAQ */}
        {post.faq && post.faq.length > 0 && (
          <section className="space-y-5 border-t border-border pt-8">
            <h2 className="text-2xl font-bold">Frequently asked questions</h2>
            {post.faq.map(item => (
              <div key={item.q}>
                <h3 className="font-semibold text-foreground">{item.q}</h3>
                <p className="mt-1 text-muted-foreground leading-relaxed">{item.a}</p>
              </div>
            ))}
          </section>
        )}

        {/* CTA */}
        <section className="rounded-2xl border border-border bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 p-8 md:p-10 text-center space-y-4">
          <h2 className="text-2xl md:text-3xl font-bold">{post.cta.heading}</h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            {post.cta.subtext}
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              to={post.cta.primaryTo}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {post.cta.primaryLabel}
              <Check className="h-4 w-4" aria-hidden="true" />
            </Link>
            {post.cta.secondaryLabel && post.cta.secondaryTo && (
              <Link
                to={post.cta.secondaryTo}
                className="inline-flex min-h-11 items-center rounded-md border border-border px-6 py-3 font-medium text-foreground hover:border-primary/50 transition-colors"
              >
                {post.cta.secondaryLabel}
              </Link>
            )}
          </div>
        </section>

        {/* Related (cluster linking) */}
        <section className="space-y-4 border-t border-border pt-8">
          <h2 className="text-xl font-semibold">Keep reading</h2>
          <ul className="flex flex-wrap gap-3 text-sm">
            {post.related.map(item => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="inline-flex items-center rounded-full border border-border px-4 py-2 hover:border-primary/50 hover:text-primary transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to={BLOG_PATH}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to the blog
          </Link>
        </section>
      </article>
    </main>
  );
}
