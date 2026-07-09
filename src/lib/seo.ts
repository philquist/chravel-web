export const SITE_NAME = 'ChravelApp';
export const SITE_URL = 'https://chravel.app';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/chravelapp-social-20251219.png`;

export interface SeoConfig {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
  ogImage?: string;
}
export interface SeoLandingContent {
  h1: string;
  intro: string;
}

export const PUBLIC_SEO_ROUTES: SeoConfig[] = [
  {
    path: '/',
    title: 'ChravelApp | Group Trip Planner & Travel Coordination App',
    description:
      'Plan group trips, events, and touring logistics in one app. Coordinate chat, itinerary, tasks, polls, payments, and shared places with ChravelApp.',
  },
  {
    path: '/trip-planner',
    title: 'Trip Planner | Plan Trips Without Spreadsheet Chaos | ChravelApp',
    description:
      'Use ChravelApp as your trip planner to organize itinerary, tasks, budgets, and group decisions in one place for friends, families, and teams.',
  },
  {
    path: '/group-trip-planner',
    title: 'Group Trip Planner | Coordinate Friends, Family, and Teams | ChravelApp',
    description:
      'Coordinate group travel plans with shared chat, polls, itinerary, and to-dos. ChravelApp helps groups move from ideas to confirmed plans faster.',
  },
  {
    path: '/group-travel',
    title: 'Group Travel Coordination Platform | ChravelApp',
    description:
      'Manage group travel for consumer trips, events, and pro teams. Keep plans, communication, tasks, and expenses aligned in one platform.',
  },
  {
    path: '/how-to-plan-a-trip-with-friends',
    title: 'How to Plan a Trip with Friends (Step-by-Step) | ChravelApp',
    description:
      'Learn how to plan a trip with friends: dates, budget, itinerary, and responsibilities. Use ChravelApp to keep every detail in sync.',
  },
  {
    path: '/group-travel-planning-app',
    title: 'Best Group Travel Planning App: ChravelApp vs Wanderlog vs TripIt',
    description:
      'Compare the top group travel planning apps. See how ChravelApp combines group chat, itinerary, polls, tasks, and payments in one place — unlike Wanderlog or TripIt.',
  },
];

export const SEO_LANDING_CONTENT: Record<string, SeoLandingContent> = {
  '/trip-planner': {
    h1: 'Trip planner for real-world group coordination',
    intro:
      'ChravelApp combines chat, itinerary, tasks, polls, and expenses so your trip plan stays in one source of truth from first idea to checkout day.',
  },
  '/group-trip-planner': {
    h1: 'Group trip planner for friends, families, and travel teams',
    intro:
      'Plan together without fragmented tools by running decisions, schedules, and responsibilities in one coordinated workspace.',
  },
  '/group-travel': {
    h1: 'Group travel coordination built for modern teams',
    intro:
      'From weekend trips to touring operations, ChravelApp keeps people, plans, and updates synchronized across every stage of travel.',
  },
  '/how-to-plan-a-trip-with-friends': {
    h1: 'How to plan a trip with friends (without group-chat chaos)',
    intro:
      'Use a simple, repeatable process to align availability, budget, and itinerary while keeping every decision visible to the whole group.',
  },
  '/group-travel-planning-app': {
    h1: 'The best group travel planning app for friends, families, and teams',
    intro:
      'Most group travel apps make you choose between chat and logistics. ChravelApp pulls itinerary, polls, tasks, places, payments, and a real group chat into one shared workspace — so the plan and the conversation never drift apart.',
  },
};

export const PRIVATE_NOINDEX_PREFIXES = [
  '/trip',
  '/tour',
  '/event',
  '/profile',
  '/settings',
  '/archive',
  '/admin',
  '/organizations',
  '/organization',
  '/auth',
  '/reset-password',
  '/join',
  '/j/',
  '/accept-invite',
];

export const canonicalUrl = (path: string): string => {
  const normalized = path === '/' ? '' : path;
  return `${SITE_URL}${normalized}`;
};

export const shouldNoindex = (path: string): boolean =>
  PRIVATE_NOINDEX_PREFIXES.some(prefix => path.startsWith(prefix));

export const getPublicSeoRoute = (path: string): SeoConfig | undefined =>
  PUBLIC_SEO_ROUTES.find(route => route.path === path);

// --- Shared JSON-LD builders ---------------------------------------------------
// Reused by SEO pages so the schema.org shapes have one source of truth.

type JsonLdObject = Record<string, unknown>;

/** Organization + WebSite + SoftwareApplication identity, common to every public SEO page. */
export const siteIdentityJsonLd = (): JsonLdObject[] => [
  { '@context': 'https://schema.org', '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
  { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'TravelApplication',
    operatingSystem: 'Web, iOS, Android',
    url: SITE_URL,
  },
];

export const faqJsonLd = (faq: Array<{ q: string; a: string }>): JsonLdObject => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map(item => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      // Strip inline markdown (**bold**, *italic*) so search engines don't index raw delimiters.
      text: item.a.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1'),
    },
  })),
});

/** BreadcrumbList from an ordered list of crumbs. Use path '/' for the site root. */
export const breadcrumbJsonLd = (crumbs: Array<{ name: string; path: string }>): JsonLdObject => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((crumb, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: crumb.name,
    item: canonicalUrl(crumb.path),
  })),
});
