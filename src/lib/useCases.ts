// Use-case marketing cluster content.
//
// Source of truth for the /use-cases hub and each /use-cases/:slug page. Pages are
// data-driven: add a fully-authored `UseCaseDetail` here to publish a new page (then
// add its path to public/sitemap.xml). Card-only `UseCaseSummary` entries render on
// the hub as part of the cluster without their own page yet ("coming soon"), or link
// out to an existing page via `href` (avoids duplicate URLs).
//
// Copy claims only real Chravel features. Authoritative feature vocabulary (see
// TripExportModal + trip tabs): Chat, Calendar (+ Google Calendar sync), Tasks,
// Attachments (files/receipts), Media (shared photos), Explorer (Places & Explore
// Links), Base Camps, Broadcasts, Payments, Polls, Members/roles, AI Concierge,
// Smart Import.

export type UseCaseStatus = 'published' | 'coming-soon';

export interface UseCaseFaq {
  q: string;
  a: string;
}

/** A pain → Chravel solution pairing rendered in the feature map. */
export interface UseCaseFeatureRow {
  pain: string;
  solution: string;
}

export interface UseCaseWorkflow {
  heading: string;
  steps: string[];
}

export interface UseCaseCta {
  heading: string;
  subtext: string;
  primaryLabel: string;
  primaryTo: string;
  secondaryLabel?: string;
  secondaryTo?: string;
}

/** Card-level fields. Every entry (published page or coming-soon) has these. */
export interface UseCaseSummary {
  slug: string;
  status: UseCaseStatus;
  cardTitle: string;
  cardTagline: string;
  cardCtaLabel: string;
  /**
   * Optional link override for the hub card. When set, the card links here instead of
   * to /use-cases/{slug} — used to point at an existing page (e.g. group travel) so we
   * don't ship a duplicate URL.
   */
  href?: string;
}

/** A fully-authored use case that gets its own /use-cases/{slug} page. */
export interface UseCaseDetail extends UseCaseSummary {
  seo: { title: string; description: string };
  h1: string;
  intro: string;
  body: string[];
  featureMap: UseCaseFeatureRow[];
  workflow?: UseCaseWorkflow;
  faq: UseCaseFaq[];
  cta: UseCaseCta;
}

export const USE_CASES_PATH = '/use-cases';

/**
 * Ordered by go-to-market priority: travel concierge is the highest-intent B2B wedge,
 * then weddings, group travel, sports, touring.
 */
export const USE_CASES: Array<UseCaseSummary | UseCaseDetail> = [
  {
    slug: 'travel-concierge-client-portal',
    status: 'published',
    cardTitle: 'Travel Concierge & Advisors',
    cardTagline:
      'Give every client a polished trip portal after they book — itinerary, attachments, reservations, base camps, and tasks, all preloaded.',
    cardCtaLabel: 'See Chravel for travel concierge',
    seo: {
      title: 'Travel Concierge Client Portal | Organize Client Trips with Chravel',
      description:
        'Chravel gives travel concierges and advisors a client-ready trip portal — preload the itinerary, attachments, reservations, base camps, tasks, and recommendations, then invite the client into one organized workspace.',
    },
    h1: 'A client-ready trip portal for travel concierge companies',
    intro:
      'Travel concierges and advisors sell peace of mind. Chravel lets you deliver it after the booking — one organized trip workspace your clients open instead of digging through email, WhatsApp, and Google Drive.',
    body: [
      'A travel concierge sells peace of mind. The client pays precisely so they do not have to manage logistics, chase details, organize links, or remember every moving piece of the trip. But once the booking is confirmed, many concierge teams still deliver the experience through a messy stack of WhatsApp messages, iMessage threads, PDFs, Google Drive folders, email chains, and screenshots. That leaves a gap between the premium service the client bought and the fragmented way the trip actually arrives.',
      'Chravel closes that gap with one place to organize the entire client experience after purchase. Create a trip, add the family or client group, and preload the itinerary onto the Calendar — or let Smart Import pull flights and reservations straight from confirmation emails and PDFs. Upload vouchers and receipts as Attachments, pin the hotel and meeting points as Base Camps, save vetted restaurants and activities in Explorer, and assign Tasks for passports, payments, or arrival details. When the client joins, they are not staring at a blank app. They enter a trip that already feels planned.',
      'This matters because you are really selling confidence. When a client opens Chravel and sees their flights, hotels, reservations, documents, and reminders in one place, your company instantly looks more buttoned-up. Instead of asking "where was that confirmation?" or "which hotel are we meeting at?", they check the trip. And instead of sending the same update five different ways, you send one Broadcast to the whole group.',
      'Chravel also helps you standardize operations. Build a repeatable shape for honeymoons, family vacations, ski weeks, milestone birthdays, retreats, and VIP travel — every trip carrying the same Calendar, Tasks, Attachments, Base Camp, Explorer, and shared Media. With Chravel Pro, admin-controlled seats and role-based access let multiple planners run client trips with the right permissions, so the experience stays consistent across your whole team instead of living in one person’s inbox.',
      'The pitch is simple: after your client pays, do not send them another messy folder — send them a private trip command center. Chravel lets a travel concierge look more professional, cut client confusion, and deliver a more premium post-booking experience without building a custom app or standing up a white-label portal.',
    ],
    featureMap: [
      {
        pain: 'Trip details scattered across email, texts, PDFs, and Drive',
        solution: 'One shared trip workspace',
      },
      {
        pain: 'Confirmations arrive as forwarded emails and PDFs',
        solution: 'Smart Import + Attachments',
      },
      {
        pain: 'Clients forget reservation times or where to meet',
        solution: 'Calendar + Base Camps',
      },
      {
        pain: 'Families ask the same questions over and over',
        solution: 'Broadcasts + centralized details',
      },
      {
        pain: 'Clients need to complete items before they travel',
        solution: 'Tasks',
      },
      {
        pain: 'Clients want vetted recommendations on the ground',
        solution: 'Explorer (Places & Explore Links)',
      },
      {
        pain: 'Splitting costs or collecting balances',
        solution: 'Payments',
      },
      {
        pain: 'Families want to keep the memories afterward',
        solution: 'Shared Media album',
      },
    ],
    workflow: {
      heading: 'Set up a client trip in minutes',
      steps: [
        'Create the trip and add the client or family.',
        'Preload the itinerary on the Calendar — or use Smart Import to pull flights and reservations from confirmation emails, PDFs, and links.',
        'Upload receipts, vouchers, and reservations as Attachments, then pin the hotel and key meeting points as Base Camps.',
        'Drop vetted restaurants, tours, and activities into Explorer and assign any pre-trip Tasks.',
        'Invite the client — they open a trip that is already planned, and you Broadcast updates as plans change.',
      ],
    },
    faq: [
      {
        q: 'Do I need to build a custom app or white-label Chravel?',
        a: 'No. You create a client-ready trip in minutes inside Chravel — no custom development and no white-label setup required.',
      },
      {
        q: 'Can my whole team manage client trips?',
        a: 'Yes. Chravel Pro adds admin-controlled seats and role-based access, so multiple planners can run client trips with the right permissions.',
      },
      {
        q: 'Can I control what clients see?',
        a: 'You control membership and roles on each trip, so clients see their trip while internal notes and team channels stay separate.',
      },
      {
        q: 'How do clients get their itinerary if it lives in my email?',
        a: 'Use Smart Import to pull schedules and reservations from confirmation emails, PDFs, and links into the trip Calendar and Attachments.',
      },
      {
        q: 'Does it work on iPhone and Android?',
        a: 'Yes — Chravel runs on the web and as an installable app on iOS and Android, so every client is covered regardless of device.',
      },
    ],
    cta: {
      heading: 'Deliver a more premium trip after every booking',
      subtext:
        'Create a client-ready Chravel trip, preload the details, and invite the family into one organized workspace.',
      primaryLabel: 'Create a client trip',
      primaryTo: '/auth',
      secondaryLabel: 'Chravel for teams',
      secondaryTo: '/teams',
    },
  },
  {
    slug: 'wedding-guest-coordination-app',
    status: 'coming-soon',
    cardTitle: 'Weddings',
    cardTagline:
      'Keep guests, the wedding party, photos, dress codes, and weekend events in one shared hub.',
    cardCtaLabel: 'Coming soon',
  },
  {
    slug: 'group-travel-planning-app',
    status: 'published',
    cardTitle: 'Group Trips',
    cardTagline:
      'Plan bachelor parties, birthdays, family trips, and destination weekends without the chaos.',
    cardCtaLabel: 'See group travel planning',
    // Links to the existing standalone page so we don't ship a duplicate URL.
    href: '/group-travel-planning-app',
  },
  {
    slug: 'sports-team-travel-coordination',
    status: 'coming-soon',
    cardTitle: 'Sports Teams',
    cardTagline:
      'Coordinate players, parents, coaches, hotels, games, and travel updates without chasing group chats.',
    cardCtaLabel: 'Coming soon',
  },
  {
    slug: 'music-tour-coordination',
    status: 'coming-soon',
    cardTitle: 'Touring Artists & Crews',
    cardTagline:
      'Keep artists, crew, security, content teams, and management aligned city by city.',
    cardCtaLabel: 'Coming soon',
  },
];

/** Cross-cutting features highlighted on the hub. Names match the real product surfaces. */
export const USE_CASE_FEATURES: Array<{ name: string; description: string }> = [
  {
    name: 'Shared calendar',
    description: 'Itinerary everyone can see, with Google Calendar sync.',
  },
  { name: 'Tasks', description: 'Assign what needs doing before and during the trip.' },
  { name: 'Attachments', description: 'Files, receipts, and reservations in one place.' },
  { name: 'Shared media', description: 'One album for everyone’s photos, on any device.' },
  { name: 'Base Camps', description: 'Pin the hotel or HQ so nobody asks where to meet.' },
  { name: 'Explorer', description: 'Save vetted places and recommendations to the trip.' },
  { name: 'Broadcasts', description: 'Send one update to the whole group at once.' },
  { name: 'Payments', description: 'Split costs and settle balances without spreadsheets.' },
  { name: 'AI Concierge', description: 'Plan, answer questions, and pull details together.' },
];

export const hasDetail = (uc: UseCaseSummary | UseCaseDetail): uc is UseCaseDetail =>
  'body' in uc && Array.isArray((uc as UseCaseDetail).body);

/** The card's link target: an explicit override, the page route, or undefined when not yet live. */
export const getUseCaseHref = (uc: UseCaseSummary | UseCaseDetail): string | undefined => {
  if (uc.href) return uc.href;
  if (uc.status === 'published') return `${USE_CASES_PATH}/${uc.slug}`;
  return undefined;
};

/** Resolve a published, fully-authored page by slug. Returns undefined for unknown/unpublished slugs. */
export const getUseCaseDetail = (slug: string | undefined): UseCaseDetail | undefined => {
  if (!slug) return undefined;
  const match = USE_CASES.find(uc => uc.slug === slug);
  if (match && match.status === 'published' && hasDetail(match)) return match;
  return undefined;
};
