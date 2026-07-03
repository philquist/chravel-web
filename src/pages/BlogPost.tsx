import { Link, useParams } from 'react-router-dom';
// Dual-routed page (MarketingApp AND the authenticated App shell) — the
// marketing fonts + data-marketing scope must travel with the component.
import '@/styles/marketingFonts';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { JsonLd, SeoHead } from '@/components/seo/SeoHead';
import { EditorialKicker, GoldRule } from '@/components/landing/Editorial';
import { useForceDarkTheme } from '@/hooks/useForceDarkTheme';
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
  useForceDarkTheme();
  return (
    <main data-marketing="true" className="min-h-screen bg-background text-foreground">
      <SeoHead
        title="Article not found | ChravelApp"
        description="Browse the ChravelApp blog for guides on group travel and coordination."
        path={postPath(slug)}
        noindex
      />
      <section className="max-w-3xl mx-auto px-4 py-24 text-center space-y-6">
        <h1 className="text-3xl text-white">This article isn’t available</h1>
        <p className="text-lg text-white/60">It may have moved. Browse the latest posts.</p>
        <Link
          to={BLOG_PATH}
          className="accent-fill-gold inline-flex min-h-11 items-center rounded-xl px-6 py-3 font-semibold"
        >
          Go to the blog
        </Link>
      </section>
    </main>
  );
}

export default function BlogPost() {
  useForceDarkTheme();
  const { slug } = useParams<{ slug: string }>();
  const post = getBlogPost(slug);

  if (!post) return <PostNotFound slug={slug ?? ''} />;

  const seoConfig = { title: post.title, description: post.description, path: postPath(post.slug) };
  const readingMinutes = estimateReadingMinutes(post);

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

      <SeoHead {...seoConfig} />
      <JsonLd data={buildJsonLd(post)} />

      <article className="relative max-w-3xl mx-auto px-4 py-12 md:py-16 space-y-12">
        {/* Header */}
        <header className="space-y-5">
          <nav aria-label="Breadcrumb" className="text-sm text-white/45">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link to="/" className="hover:text-gold-light transition-colors">
                  Home
                </Link>
              </li>
              <li aria-hidden="true" className="text-gold-primary/50">
                /
              </li>
              <li>
                <Link to={BLOG_PATH} className="hover:text-gold-light transition-colors">
                  Blog
                </Link>
              </li>
            </ol>
          </nav>

          {post.tags && post.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <EditorialKicker>{post.tags[0]}</EditorialKicker>
              {post.tags.slice(1).map(tag => (
                <span
                  key={tag}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/55"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <EditorialKicker>The Journal</EditorialKicker>
          )}

          <h1 className="text-3xl md:text-5xl leading-[1.08] text-white">{post.h1}</h1>
          <p className="text-lg md:text-xl leading-relaxed text-white/70">{post.excerpt}</p>

          <div className="flex flex-wrap items-center gap-2 border-y border-white/10 py-3 text-sm text-white/55">
            <span className="font-medium text-white/75">{post.author}</span>
            <span className="text-gold-primary/70" aria-hidden="true">
              ·
            </span>
            <time dateTime={post.datePublished}>{formatBlogDate(post.datePublished)}</time>
            <span className="text-gold-primary/70" aria-hidden="true">
              ·
            </span>
            <span>{readingMinutes} min read</span>
          </div>
        </header>

        {/* Body */}
        <div className="space-y-10">
          {post.sections.map((section, i) => (
            <section key={i} className="space-y-3">
              {section.heading && (
                <h2 className="text-2xl md:text-3xl leading-snug text-white">{section.heading}</h2>
              )}
              {section.paragraphs?.map((paragraph, j) => (
                <p key={j} className="text-base md:text-lg leading-relaxed text-white/75">
                  {paragraph}
                </p>
              ))}
              {section.list && (
                <ul className="space-y-2.5 pl-1 text-base md:text-lg text-white/75">
                  {section.list.map((item, j) => (
                    <li key={j} className="flex items-start gap-3 leading-relaxed">
                      <span
                        className="mt-[0.7em] h-px w-4 shrink-0 bg-gold-primary/70"
                        aria-hidden="true"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
              {section.link && (
                <p>
                  <Link
                    to={section.link.to}
                    className="inline-flex items-center gap-1.5 font-semibold text-gold-light hover:underline"
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
          <section className="space-y-5 pt-2">
            <h2 className="text-2xl md:text-3xl text-white">Frequently asked questions</h2>
            <div className="divide-y divide-white/10 border-y border-white/10">
              {post.faq.map(item => (
                <div key={item.q} className="py-5">
                  <h3 className="font-semibold text-white/90">{item.q}</h3>
                  <p className="mt-1.5 leading-relaxed text-white/60">{item.a}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 md:p-10 text-center space-y-4">
          <GoldRule className="mx-auto w-24" />
          <h2 className="text-2xl md:text-3xl text-white">{post.cta.heading}</h2>
          <p className="mx-auto max-w-2xl text-base md:text-lg text-white/65">{post.cta.subtext}</p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              to={post.cta.primaryTo}
              className="accent-fill-gold inline-flex min-h-11 items-center gap-2 rounded-xl px-6 py-3 font-semibold"
            >
              {post.cta.primaryLabel}
              <Check className="h-4 w-4" aria-hidden="true" />
            </Link>
            {post.cta.secondaryLabel && post.cta.secondaryTo && (
              <Link
                to={post.cta.secondaryTo}
                className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-6 py-3 font-medium text-white/85 transition-colors hover:border-gold-primary/50 hover:text-gold-light"
              >
                {post.cta.secondaryLabel}
              </Link>
            )}
          </div>
        </section>

        {/* Related (cluster linking) */}
        <section className="space-y-4 border-t border-white/10 pt-8">
          <h2 className="text-xl font-semibold text-white/90">Keep reading</h2>
          <ul className="flex flex-wrap gap-3 text-sm">
            {post.related.map(item => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="inline-flex items-center rounded-full border border-white/15 px-4 py-2 text-white/75 transition-colors hover:border-gold-primary/50 hover:text-gold-light"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to={BLOG_PATH}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/55 transition-colors hover:text-gold-light"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to the blog
          </Link>
        </section>
      </article>
    </main>
  );
}
