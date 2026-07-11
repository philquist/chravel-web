import { Link, useParams } from 'react-router-dom';
// Dual-routed page (MarketingApp AND the authenticated App shell) — the
// marketing fonts + data-marketing scope must travel with the component.
import '@/styles/marketingFonts';
import { ArrowRight, Check } from 'lucide-react';
import { JsonLd, SeoHead } from '@/components/seo/SeoHead';
import {
  ArticleHeader,
  ClosingFigure,
  GoldRule,
  SectionHeading,
  readingTimeFor,
} from '@/components/landing/Editorial';
import { useForceDarkTheme } from '@/hooks/useForceDarkTheme';
import { breadcrumbJsonLd, faqJsonLd, siteIdentityJsonLd } from '@/lib/seo';
import { getUseCaseImage } from '@/lib/useCaseImages';
import { renderInlineMarkdown } from '@/lib/inlineMarkdown';
import {
  USE_CASES,
  USE_CASES_PATH,
  getUseCaseDetail,
  getUseCaseHref,
  type UseCaseDetail,
} from '@/lib/useCases';

const pagePath = (slug: string) => `${USE_CASES_PATH}/${slug}`;

/** Structured data: site identity + FAQ + breadcrumb trail for the use-case page. */
const buildJsonLd = (uc: UseCaseDetail) => [
  ...siteIdentityJsonLd(),
  faqJsonLd(uc.faq),
  breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Use Cases', path: USE_CASES_PATH },
    { name: uc.cardTitle, path: pagePath(uc.slug) },
  ]),
];

/** Shown for unknown or not-yet-published slugs. Kept out of the index. */
function UseCaseNotFound({ slug }: { slug: string }) {
  useForceDarkTheme();
  return (
    <main data-marketing="true" className="min-h-screen bg-background text-foreground">
      <SeoHead
        title="Use case not found | ChravelApp"
        description="Browse how groups, teams, and travel pros use ChravelApp."
        path={pagePath(slug)}
        noindex
      />
      <section className="max-w-3xl mx-auto px-4 py-24 text-center space-y-6">
        <h1 className="text-3xl text-white">This use case isn’t available yet</h1>
        <p className="text-lg text-white/60">
          It may be on the way. In the meantime, explore how others use ChravelApp.
        </p>
        <Link
          to={USE_CASES_PATH}
          className="accent-fill-gold inline-flex min-h-11 items-center rounded-xl px-6 py-3 font-semibold"
        >
          Browse all use cases
        </Link>
      </section>
    </main>
  );
}

export default function UseCasePage() {
  useForceDarkTheme();
  const { slug } = useParams<{ slug: string }>();
  const uc = getUseCaseDetail(slug);

  if (!uc) return <UseCaseNotFound slug={slug ?? ''} />;

  const related = USE_CASES.filter(item => item.slug !== uc.slug);
  const image = getUseCaseImage(uc.slug);
  const [lede, ...bodyRest] = uc.body;

  return (
    <main data-marketing="true" className="relative min-h-screen bg-background text-foreground">
      {/* Ambient masthead tint — ties the article surface to the homepage's
          black/gold grammar without a full pattern overlay. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            'radial-gradient(110% 100% at 50% 0%, rgba(196,151,70,0.09) 0%, rgba(196,151,70,0.03) 45%, transparent 75%)',
        }}
        aria-hidden="true"
      />

      <SeoHead title={uc.seo.title} description={uc.seo.description} path={pagePath(uc.slug)} />
      <JsonLd data={buildJsonLd(uc)} />

      <article className="relative max-w-4xl mx-auto px-4 py-12 md:py-16 space-y-14">
        <ArticleHeader
          kicker="Use Case"
          title={uc.h1}
          dek={uc.intro}
          byline="The ChravelApp Team"
          readingTime={readingTimeFor([uc.intro, ...uc.body])}
          breadcrumb={[
            { label: 'Home', to: '/' },
            { label: 'Use Cases', to: USE_CASES_PATH },
            { label: uc.cardTitle },
          ]}
        />

        {/* Article body — lede paragraph runs larger, reporting style */}
        <div className="space-y-5">
          {lede && (
            <p className="text-lg md:text-xl leading-relaxed text-white/85">
              {renderInlineMarkdown(lede)}
            </p>
          )}
          {bodyRest.map((paragraph, i) => (
            <p key={i} className="text-base md:text-lg leading-relaxed text-white/75">
              {renderInlineMarkdown(paragraph)}
            </p>
          ))}
        </div>

        {/* Feature map: pain → ChravelApp solution */}
        <section className="space-y-6">
          <SectionHeading index={1}>From scattered to coordinated</SectionHeading>
          <div className="grid gap-4 md:grid-cols-2">
            {uc.featureMap.map(row => (
              <div
                key={row.pain}
                className="rounded-2xl border border-white/10 border-l-2 border-l-gold-primary/60 bg-white/[0.03] p-5 transition-colors hover:border-l-gold-primary hover:bg-white/[0.05]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                  {row.pain}
                </p>
                <p className="mt-2 flex items-start gap-2 text-base md:text-lg font-medium text-white/90">
                  <ArrowRight
                    className="mt-1 h-4 w-4 shrink-0 text-gold-primary"
                    aria-hidden="true"
                  />
                  {row.solution}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Workflow steps */}
        {uc.workflow && (
          <section className="space-y-6">
            <SectionHeading index={0}>{uc.workflow.heading}</SectionHeading>
            <ol className="space-y-4">
              {uc.workflow.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span
                    className="font-display mt-0.5 text-lg italic tabular-nums text-gold-primary/80"
                    aria-hidden="true"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <p className="text-base md:text-lg leading-relaxed text-white/80">
                    {renderInlineMarkdown(step)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* FAQ */}
        <section className="space-y-6">
          <SectionHeading index={uc.workflow ? 6 : 0}>Frequently asked questions</SectionHeading>
          <div className="divide-y divide-white/10 border-y border-white/10">
            {uc.faq.map(item => (
              <div key={item.q} className="py-5">
                <h3 className="font-semibold text-white/90">{item.q}</h3>
                <p className="mt-1.5 leading-relaxed text-white/60">
                  {renderInlineMarkdown(item.a)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Closing photograph — every story signs off on a real image */}
        {image && <ClosingFigure src={image.src} alt={image.alt} caption={image.caption} />}

        {/* CTA */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 md:p-10 text-center space-y-4">
          <GoldRule className="mx-auto w-24" />
          <h2 className="text-2xl md:text-3xl text-white">{uc.cta.heading}</h2>
          <p className="mx-auto max-w-2xl text-base md:text-lg text-white/65">{uc.cta.subtext}</p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              to={uc.cta.primaryTo}
              className="accent-fill-gold inline-flex min-h-11 items-center gap-2 rounded-xl px-6 py-3 font-semibold"
            >
              {uc.cta.primaryLabel}
              <Check className="h-4 w-4" aria-hidden="true" />
            </Link>
            {uc.cta.secondaryLabel && uc.cta.secondaryTo && (
              <Link
                to={uc.cta.secondaryTo}
                className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-6 py-3 font-medium text-white/85 transition-colors hover:border-gold-primary/50 hover:text-gold-light"
              >
                {uc.cta.secondaryLabel}
              </Link>
            )}
          </div>
        </section>

        {/* Related use cases (cluster linking) */}
        <section className="space-y-4 border-t border-white/10 pt-8">
          <h2 className="text-xl font-semibold text-white/90">More ways teams use ChravelApp</h2>
          <ul className="flex flex-wrap gap-3 text-sm">
            {related.map(item => {
              const href = getUseCaseHref(item);
              return (
                <li key={item.slug}>
                  {href ? (
                    <Link
                      to={href}
                      className="inline-flex items-center rounded-full border border-white/15 px-4 py-2 text-white/75 transition-colors hover:border-gold-primary/50 hover:text-gold-light"
                    >
                      {item.cardTitle}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-white/40">
                      {item.cardTitle} · soon
                    </span>
                  )}
                </li>
              );
            })}
            <li>
              <Link
                to={USE_CASES_PATH}
                className="inline-flex items-center rounded-full border border-white/15 px-4 py-2 text-white/75 transition-colors hover:border-gold-primary/50 hover:text-gold-light"
              >
                All use cases
              </Link>
            </li>
          </ul>
        </section>
      </article>
    </main>
  );
}
