import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { JsonLd, SeoHead } from '@/components/seo/SeoHead';
import { SITE_URL, breadcrumbJsonLd, faqJsonLd, siteIdentityJsonLd } from '@/lib/seo';
import { USE_CASES, USE_CASES_PATH, USE_CASE_FEATURES, getUseCaseHref } from '@/lib/useCases';

const HUB_FAQ = [
  {
    q: 'What is Chravel?',
    a: 'Chravel is a group travel and coordination app that puts chat, calendar, tasks, attachments, places, broadcasts, payments, and shared media into one trip workspace.',
  },
  {
    q: 'Who uses Chravel?',
    a: 'Travel concierges and advisors, couples and wedding parties, sports teams, touring crews, and friends and families planning trips together.',
  },
  {
    q: 'Is there a free plan?',
    a: 'Yes — Chravel is free for small groups, with paid tiers for larger trips, pro teams, and events.',
  },
  {
    q: 'Does it work on iPhone, Android, and web?',
    a: 'Yes — Chravel runs on the web and as an installable app on iOS and Android.',
  },
];

const HUB_TITLE = 'Chravel Use Cases | One App for Every Group Trip and Travel Team';
const HUB_DESCRIPTION =
  'See how travel concierges, couples, sports teams, touring crews, and groups use Chravel to coordinate calendars, tasks, attachments, places, broadcasts, payments, and shared photos in one workspace.';
const HUB_H1 = 'One app for every group trip, event, and travel team';

const buildJsonLd = () => [
  ...siteIdentityJsonLd(),
  breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Use Cases', path: USE_CASES_PATH },
  ]),
  {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: USE_CASES.map((uc, i) => {
      const href = getUseCaseHref(uc);
      return {
        '@type': 'ListItem',
        position: i + 1,
        name: uc.cardTitle,
        ...(href ? { url: `${SITE_URL}${href}` } : {}),
      };
    }),
  },
  faqJsonLd(HUB_FAQ),
];

export default function UseCasesHub() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SeoHead title={HUB_TITLE} description={HUB_DESCRIPTION} path={USE_CASES_PATH} />
      <JsonLd data={buildJsonLd()} />

      <div className="max-w-6xl mx-auto px-4 py-12 md:py-16 space-y-16">
        {/* Header */}
        <header className="max-w-3xl space-y-4">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link to="/" className="hover:text-primary transition-colors">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-foreground">Use Cases</li>
            </ol>
          </nav>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight">{HUB_H1}</h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            Every group trip has too many people, too many details, and too many group chats.
            Chravel pulls the itinerary, tasks, attachments, places, photos, payments, and updates
            into one shared workspace — so nobody has to dig through texts, emails, screenshots, or
            old PDFs.
          </p>
        </header>

        {/* Use case cards */}
        <section className="space-y-6">
          <h2 className="sr-only">Browse use cases</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map(uc => {
              const href = getUseCaseHref(uc);
              const cardBody = (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-xl text-foreground">{uc.cardTitle}</h3>
                      {uc.status === 'coming-soon' && (
                        <span className="shrink-0 rounded-full border border-border/60 px-2.5 py-0.5 text-xs text-muted-foreground">
                          Soon
                        </span>
                      )}
                    </div>
                    <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                      {uc.cardTagline}
                    </p>
                  </div>
                  {href && (
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                      {uc.cardCtaLabel}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                </>
              );

              return href ? (
                <Link
                  key={uc.slug}
                  to={href}
                  className="flex flex-col bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-6 hover:border-primary/50 transition-colors"
                >
                  {cardBody}
                </Link>
              ) : (
                <div
                  key={uc.slug}
                  className="flex flex-col bg-card/30 backdrop-blur-sm border border-border/60 rounded-2xl p-6"
                >
                  {cardBody}
                </div>
              );
            })}
          </div>
        </section>

        {/* Features across every use case */}
        <section className="space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold">Features across every use case</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASE_FEATURES.map(feature => (
              <div key={feature.name} className="rounded-2xl border border-border p-5">
                <h3 className="font-semibold text-foreground">{feature.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold">Frequently asked questions</h2>
          <div className="space-y-5 max-w-3xl">
            {HUB_FAQ.map(item => (
              <div key={item.q}>
                <h3 className="font-semibold text-foreground">{item.q}</h3>
                <p className="mt-1 text-muted-foreground leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-border bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 p-8 md:p-10 text-center space-y-4">
          <h2 className="text-2xl md:text-3xl font-bold">Create your first trip</h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Start one shared workspace for the itinerary, tasks, attachments, photos, places, and
            updates — and invite the group.
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
