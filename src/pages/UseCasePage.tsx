import { Link, useParams } from 'react-router-dom';
// Dual-routed page (MarketingApp AND the authenticated App shell) — the
// marketing fonts + data-marketing scope must travel with the component.
import '@/styles/marketingFonts';
import { ArrowRight, Check } from 'lucide-react';
import { JsonLd, SeoHead } from '@/components/seo/SeoHead';
import { breadcrumbJsonLd, faqJsonLd, siteIdentityJsonLd } from '@/lib/seo';
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
  return (
    <main data-marketing="true" className="min-h-screen bg-background text-foreground">
      <SeoHead
        title="Use case not found | ChravelApp"
        description="Browse how groups, teams, and travel pros use ChravelApp."
        path={pagePath(slug)}
        noindex
      />
      <section className="max-w-3xl mx-auto px-4 py-24 text-center space-y-6">
        <h1 className="text-3xl font-bold">This use case isn’t available yet</h1>
        <p className="text-lg text-muted-foreground">
          It may be on the way. In the meantime, explore how others use ChravelApp.
        </p>
        <Link
          to={USE_CASES_PATH}
          className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground"
        >
          Browse all use cases
        </Link>
      </section>
    </main>
  );
}

export default function UseCasePage() {
  const { slug } = useParams<{ slug: string }>();
  const uc = getUseCaseDetail(slug);

  if (!uc) return <UseCaseNotFound slug={slug ?? ''} />;

  const related = USE_CASES.filter(item => item.slug !== uc.slug);

  return (
    <main data-marketing="true" className="min-h-screen bg-background text-foreground">
      <SeoHead title={uc.seo.title} description={uc.seo.description} path={pagePath(uc.slug)} />
      <JsonLd data={buildJsonLd(uc)} />

      <article className="max-w-4xl mx-auto px-4 py-12 md:py-16 space-y-12">
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
              <Link to={USE_CASES_PATH} className="hover:text-primary transition-colors">
                Use Cases
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-foreground">{uc.cardTitle}</li>
          </ol>
        </nav>

        {/* Header */}
        <header className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight">{uc.h1}</h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">{uc.intro}</p>
        </header>

        {/* Article body */}
        <div className="space-y-5">
          {uc.body.map((paragraph, i) => (
            <p key={i} className="text-base md:text-lg text-foreground leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>

        {/* Feature map: pain → ChravelApp solution */}
        <section className="space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold">From scattered to coordinated</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {uc.featureMap.map(row => (
              <div
                key={row.pain}
                className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-5 hover:border-primary/40 transition-colors"
              >
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {row.pain}
                </p>
                <p className="mt-2 flex items-start gap-2 text-base md:text-lg font-semibold text-foreground">
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {row.solution}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Workflow steps */}
        {uc.workflow && (
          <section className="space-y-6">
            <h2 className="text-2xl md:text-3xl font-bold">{uc.workflow.heading}</h2>
            <ol className="space-y-4">
              {uc.workflow.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <p className="text-base md:text-lg text-foreground leading-relaxed">{step}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* FAQ */}
        <section className="space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold">Frequently asked questions</h2>
          <div className="space-y-5">
            {uc.faq.map(item => (
              <div key={item.q}>
                <h3 className="font-semibold text-foreground">{item.q}</h3>
                <p className="mt-1 text-muted-foreground leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-border bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 p-8 md:p-10 text-center space-y-4">
          <h2 className="text-2xl md:text-3xl font-bold">{uc.cta.heading}</h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            {uc.cta.subtext}
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              to={uc.cta.primaryTo}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {uc.cta.primaryLabel}
              <Check className="h-4 w-4" aria-hidden="true" />
            </Link>
            {uc.cta.secondaryLabel && uc.cta.secondaryTo && (
              <Link
                to={uc.cta.secondaryTo}
                className="inline-flex min-h-11 items-center rounded-md border border-border px-6 py-3 font-medium text-foreground hover:border-primary/50 transition-colors"
              >
                {uc.cta.secondaryLabel}
              </Link>
            )}
          </div>
        </section>

        {/* Related use cases (cluster linking) */}
        <section className="space-y-4 border-t border-border pt-8">
          <h2 className="text-xl font-semibold">More ways teams use ChravelApp</h2>
          <ul className="flex flex-wrap gap-3 text-sm">
            {related.map(item => {
              const href = getUseCaseHref(item);
              return (
                <li key={item.slug}>
                  {href ? (
                    <Link
                      to={href}
                      className="inline-flex items-center rounded-full border border-border px-4 py-2 hover:border-primary/50 hover:text-primary transition-colors"
                    >
                      {item.cardTitle}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-border/60 px-4 py-2 text-muted-foreground">
                      {item.cardTitle} · soon
                    </span>
                  )}
                </li>
              );
            })}
            <li>
              <Link
                to={USE_CASES_PATH}
                className="inline-flex items-center rounded-full border border-border px-4 py-2 hover:border-primary/50 hover:text-primary transition-colors"
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
