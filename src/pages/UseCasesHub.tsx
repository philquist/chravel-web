import { Link } from 'react-router-dom';
// Dual-routed page (MarketingApp AND the authenticated App shell) — the
// marketing fonts + data-marketing scope must travel with the component.
import '@/styles/marketingFonts';
import { ArrowRight } from 'lucide-react';
import { JsonLd, SeoHead } from '@/components/seo/SeoHead';
import { ArticleHeader, EditorialKicker, GoldRule } from '@/components/landing/Editorial';
import { useForceDarkTheme } from '@/hooks/useForceDarkTheme';
import { SITE_URL, breadcrumbJsonLd, faqJsonLd, siteIdentityJsonLd } from '@/lib/seo';
import { getUseCaseImage } from '@/lib/useCaseImages';
import { renderInlineMarkdown } from '@/lib/inlineMarkdown';
import { USE_CASES, USE_CASES_PATH, USE_CASE_FEATURES, getUseCaseHref } from '@/lib/useCases';

const HUB_FAQ = [
  {
    q: 'What is ChravelApp?',
    a: 'ChravelApp is a group travel and coordination app that puts chat, calendar, tasks, attachments, places, broadcasts, payments, and shared media into one trip workspace.',
  },
  {
    q: 'Who uses ChravelApp?',
    a: 'Travel concierges and advisors, wedding planners, couples and wedding parties, tour managers, sports coordinators, corporate assistants, family-office staff, and friends and families planning trips together.',
  },
  {
    q: 'Can an outside organizer help run our trip without seeing our private conversations?',
    a: 'Yes. On a Pro Trip you can invite an outside planner, travel concierge, tour manager, or assistant as a **Coordinator**. Coordinators manage the shared calendar, tasks, places, files, and links — but they cannot read private chats, view private media, or see the AI Concierge activity of other members. The boundary is enforced by Postgres row-level security in the database, not just hidden in the UI.',
  },
  {
    q: 'Is there a free plan?',
    a: 'Yes — ChravelApp is free for small groups, with paid tiers for larger trips, pro teams, and events.',
  },
  {
    q: 'Does it work on iPhone, Android, and web?',
    a: 'Yes — ChravelApp runs on the web and as an installable app on iOS and Android.',
  },

];

const HUB_TITLE = 'ChravelApp Use Cases | One App for Every Group Trip and Travel Team';
const HUB_DESCRIPTION =
  'See how travel concierges, couples, sports teams, touring crews, and groups use ChravelApp to coordinate calendars, tasks, attachments, places, broadcasts, payments, and shared photos in one workspace.';
const HUB_H1 = 'One app for every group trip, event, and travel team';
const HUB_DEK =
  'Every group trip has too many people, too many details, and too many group chats. ChravelApp pulls the itinerary, tasks, attachments, places, photos, payments, and updates into one shared workspace — so nobody has to dig through texts, emails, screenshots, or old PDFs.';

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
  useForceDarkTheme();

  // Featured lead story: the first linkable use case with art.
  const featured = USE_CASES.find(uc => getUseCaseHref(uc) && getUseCaseImage(uc.slug));
  const rest = USE_CASES.filter(uc => uc !== featured);

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

      <SeoHead title={HUB_TITLE} description={HUB_DESCRIPTION} path={USE_CASES_PATH} />
      <JsonLd data={buildJsonLd()} />

      <div className="relative max-w-6xl mx-auto px-4 py-12 md:py-16 space-y-16">
        <ArticleHeader
          kicker="Use Cases"
          title={HUB_H1}
          dek={HUB_DEK}
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Use Cases' }]}
        />

        {/* Featured lead story */}
        {featured && (
          <section aria-label="Featured use case">
            <Link
              to={getUseCaseHref(featured)!}
              className="group grid overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-gold-primary/40 lg:grid-cols-5"
            >
              <div className="relative overflow-hidden lg:col-span-3">
                <img
                  src={getUseCaseImage(featured.slug)!.src}
                  alt={getUseCaseImage(featured.slug)!.alt}
                  loading="eager"
                  decoding="async"
                  className="aspect-[16/9] h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.02] lg:aspect-auto"
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"
                  aria-hidden="true"
                />
              </div>
              <div className="flex flex-col justify-center gap-4 p-6 md:p-8 lg:col-span-2">
                <EditorialKicker>Featured</EditorialKicker>
                <h2 className="text-2xl md:text-3xl leading-snug text-white">
                  {featured.cardTitle}
                </h2>
                <p className="text-base md:text-lg leading-relaxed text-white/65">
                  {featured.cardTagline}
                </p>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-light">
                  {featured.cardCtaLabel}
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </div>
            </Link>
          </section>
        )}

        {/* Story grid */}
        <section className="space-y-6">
          <h2 className="sr-only">Browse use cases</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map(uc => {
              const href = getUseCaseHref(uc);
              const image = getUseCaseImage(uc.slug);
              const cardBody = (
                <>
                  {image && (
                    <div className="relative -mx-6 -mt-6 mb-5 overflow-hidden">
                      <img
                        src={image.src}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="aspect-[16/10] w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
                      />
                      <div
                        className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent"
                        aria-hidden="true"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-xl font-normal text-white">
                        {uc.cardTitle}
                      </h3>
                      {uc.status === 'coming-soon' && (
                        <span className="shrink-0 rounded-full border border-white/15 px-2.5 py-0.5 text-xs text-white/45">
                          Soon
                        </span>
                      )}
                    </div>
                    <p className="text-sm md:text-base leading-relaxed text-white/60">
                      {uc.cardTagline}
                    </p>
                  </div>
                  {href && (
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-light">
                      {uc.cardCtaLabel}
                      <ArrowRight
                        className="h-4 w-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </span>
                  )}
                </>
              );

              return href ? (
                <Link
                  key={uc.slug}
                  to={href}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-gold-primary/40"
                >
                  {cardBody}
                </Link>
              ) : (
                <div
                  key={uc.slug}
                  className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6"
                >
                  {cardBody}
                </div>
              );
            })}
          </div>
        </section>

        {/* Features across every use case */}
        <section className="space-y-6">
          <EditorialKicker>The System</EditorialKicker>
          <h2 className="text-2xl md:text-3xl text-white">Features across every use case</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASE_FEATURES.map(feature => (
              <div
                key={feature.name}
                className="rounded-2xl border border-white/10 border-l-2 border-l-gold-primary/60 bg-white/[0.02] p-5"
              >
                <h3 className="font-semibold text-white/90">{feature.name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-white/60">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="space-y-6">
          <EditorialKicker>Good to Know</EditorialKicker>
          <h2 className="text-2xl md:text-3xl text-white">Frequently asked questions</h2>
          <div className="max-w-3xl divide-y divide-white/10 border-y border-white/10">
            {HUB_FAQ.map(item => (
              <div key={item.q} className="py-5">
                <h3 className="font-semibold text-white/90">{item.q}</h3>
                <p className="mt-1.5 leading-relaxed text-white/60">{renderInlineMarkdown(item.a)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 md:p-10 text-center space-y-4">
          <GoldRule className="mx-auto w-24" />
          <h2 className="text-2xl md:text-3xl text-white">Create your first trip</h2>
          <p className="mx-auto max-w-2xl text-base md:text-lg text-white/65">
            Start one shared workspace for the itinerary, tasks, attachments, photos, places, and
            updates — and invite the group.
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
