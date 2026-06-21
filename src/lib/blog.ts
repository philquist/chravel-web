// Blog content registry.
//
// Source of truth for the /blog index and each /blog/:slug post. Posts are data-driven:
// add a `BlogPost` here to publish (then add its path to public/sitemap.xml). Body is a
// list of sections (optional heading + paragraphs + list + one optional inline link) so
// posts stay structured for SEO without raw HTML.

export interface BlogSection {
  heading?: string;
  paragraphs?: string[];
  list?: string[];
  /** Optional in-content internal link rendered after the section text. */
  link?: { label: string; to: string };
}

export interface BlogFaq {
  q: string;
  a: string;
}

export interface BlogCta {
  heading: string;
  subtext: string;
  primaryLabel: string;
  primaryTo: string;
  secondaryLabel?: string;
  secondaryTo?: string;
}

export interface BlogPost {
  slug: string;
  /** SEO <title>. */
  title: string;
  /** Meta description. */
  description: string;
  h1: string;
  /** Short summary for the index card and JSON-LD. */
  excerpt: string;
  /** ISO date, YYYY-MM-DD. */
  datePublished: string;
  dateModified?: string;
  author: string;
  tags?: string[];
  sections: BlogSection[];
  faq?: BlogFaq[];
  /** Internal links surfaced at the end of the post (cluster linking). */
  related: { label: string; to: string }[];
  cta: BlogCta;
}

export const BLOG_PATH = '/blog';
export const BLOG_AUTHOR = 'The Chravel Team';

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'travel-concierge-better-client-experience-after-booking',
    title: 'How Travel Concierge Companies Can Deliver a Better Client Experience After Booking',
    description:
      'Travel concierge companies win on the post-booking experience. Learn how to replace scattered WhatsApp threads, PDFs, and Drive folders with one client trip portal — and look more premium after the sale.',
    h1: 'How travel concierge companies can deliver a better client experience after booking',
    excerpt:
      'The booking confirmation is where client expectations peak — and where most concierge teams fall back on scattered WhatsApp threads, PDFs, and Drive folders. Here is how to deliver a premium, organized experience after the client pays.',
    datePublished: '2026-06-21',
    author: BLOG_AUTHOR,
    tags: ['Travel Concierge', 'Client Experience'],
    sections: [
      {
        paragraphs: [
          'For a travel concierge company, the sale is not the finish line — it is the moment a client’s expectations are highest. They just paid a premium for someone to take the logistics off their plate. What happens next, in the days and weeks before they travel, is what they actually remember.',
          'Yet this is exactly where many concierge teams quietly regress. The proposal was polished. The booking was smooth. Then the trip gets delivered through a scramble of WhatsApp messages, forwarded PDFs, a shared Google Drive folder, a long email thread, and a handful of screenshots. The service was premium; the delivery feels improvised.',
        ],
      },
      {
        heading: 'The booking is the start of the experience, not the end',
        paragraphs: [
          'Clients do not buy a concierge service for the booking itself — they can book a hotel on their own. They buy the feeling of being taken care of: not having to chase details, not having to wonder whether something was handled, not having to assemble the trip in their own head. That feeling is created — or broken — in the post-booking window, when the trip is real but has not happened yet.',
          'If a client has to dig through their inbox to find a confirmation, ask which hotel everyone is meeting at, or piece together the day-by-day plan from three different messages, the premium feeling evaporates — even if every booking underneath it is flawless.',
        ],
      },
      {
        heading: 'Where the post-booking experience breaks down',
        paragraphs: ['The failure points are consistent across concierge teams of every size:'],
        list: [
          'Trip details are scattered across email, text, WhatsApp, PDFs, and Drive, so there is no single place to look.',
          'Clients ask the same questions repeatedly — what time, which hotel, what is included — because the answers live in different threads.',
          'Confirmations and vouchers get buried, then re-sent on the day they are needed.',
          'Updates go out five different ways, and someone always misses one.',
          'Every planner on the team delivers a little differently, so quality depends on who is handling the account.',
        ],
      },
      {
        heading: 'What clients actually want after they pay',
        paragraphs: [
          'Strip it back and the post-booking want is simple: one place that holds everything, kept current, that they can open without thinking. They want to see the itinerary, know where to be, have their documents on hand, and trust that if something changes, they will be told — once, clearly.',
          'Delivering that consistently is less about working harder and more about moving the experience out of scattered tools and into one shared, client-ready space.',
        ],
      },
      {
        heading: 'Give every client one trip portal',
        paragraphs: [
          'The most effective change a concierge team can make is to stop sending clients a folder and start giving them a workspace. Create one trip per client or family and preload everything before they ever open it: the itinerary on a shared calendar, flight and hotel confirmations and receipts as attachments, the hotel and key meeting points pinned as base camps, vetted restaurants and activities saved as recommendations, and any pre-trip to-dos assigned as tasks.',
          'When the client joins, they do not see a blank app or an empty inbox — they step into a trip that already feels planned. As plans change, one update reaches everyone instead of being retyped across threads. And because the structure is the same for every trip, the experience stops depending on which planner is on the account.',
        ],
        link: {
          label: 'See how Chravel works as a travel concierge client portal',
          to: '/use-cases/travel-concierge-client-portal',
        },
      },
      {
        heading: 'A simple after-booking workflow',
        paragraphs: [
          'You do not need an operations overhaul to do this — just a repeatable shape for every trip:',
        ],
        list: [
          'Create the trip and add the client or family.',
          'Preload the itinerary on the calendar, or import it from confirmation emails and PDFs.',
          'Upload receipts, vouchers, and reservations so nothing has to be re-sent later.',
          'Pin the hotel and meeting points, and add vetted local recommendations.',
          'Assign any pre-trip tasks — passports, payments, packing notes, arrival details.',
          'Invite the client, then send updates as a single broadcast when something changes.',
        ],
      },
      {
        heading: 'Why this makes you look more premium',
        paragraphs: [
          'A concierge company is selling confidence, and confidence is communicated through how organized the experience feels. A client who opens one tidy trip and sees their flights, hotels, reservations, documents, and reminders in a single place reads that as competence — the same way a smooth check-in or a thoughtful welcome note does.',
          'It also compounds internally. A standard trip shape means less repetitive hand-holding, fewer “where was that confirmation?” messages, and a consistent client experience across your whole team. New planners inherit a system instead of a habit. And after the trip, a shared photo album gives clients a reason to return to the experience — and to you.',
        ],
      },
      {
        heading: 'Getting started',
        paragraphs: [
          'You can deliver this without building a custom app or standing up a white-label portal. Create one client-ready trip, preload the details, and invite the client into a single organized space. The booking got them in the door; the post-booking experience is what earns the next referral.',
        ],
      },
    ],
    faq: [
      {
        q: 'Do I need custom software to give clients a trip portal?',
        a: 'No. You can create a client-ready trip in minutes and preload the itinerary, documents, and recommendations — no custom development or white-label setup required.',
      },
      {
        q: 'How is this different from sending a shared Drive folder?',
        a: 'A folder stores files; a trip portal organizes the whole experience — itinerary, locations, tasks, updates, and documents in one place — and lets you push a single update when plans change.',
      },
      {
        q: 'Can my whole team deliver the same experience?',
        a: 'Yes. A repeatable trip structure with role-based access means every planner delivers a consistent, premium experience instead of improvising per account.',
      },
      {
        q: 'What do clients need to use it?',
        a: 'Just a phone or browser. It runs on the web and as an installable app on iOS and Android, so every client is covered regardless of device.',
      },
    ],
    related: [
      {
        label: 'Chravel for travel concierge companies',
        to: '/use-cases/travel-concierge-client-portal',
      },
      { label: 'All Chravel use cases', to: '/use-cases' },
      { label: 'Chravel for teams', to: '/teams' },
    ],
    cta: {
      heading: 'Deliver a more premium trip after every booking',
      subtext:
        'Create a client-ready trip, preload the details, and invite your client into one organized workspace.',
      primaryLabel: 'Create a client trip',
      primaryTo: '/auth',
      secondaryLabel: 'See Chravel for travel concierge',
      secondaryTo: '/use-cases/travel-concierge-client-portal',
    },
  },
  {
    slug: 'how-to-share-itineraries-files-receipts-with-travel-clients',
    title:
      'The Best Way to Share Itineraries, Files, Receipts, and Reservations with Travel Clients',
    description:
      'Stop offloading PDFs and Drive links. Learn the best way to share itineraries, files, receipts, and reservations with travel clients — organized, current, and easy to find.',
    h1: 'The best way to share itineraries, files, receipts, and reservations with travel clients',
    excerpt:
      'Emailing a PDF and dropping files in a Drive folder isn’t sharing — it’s offloading. Here’s how to give travel clients itineraries, documents, receipts, and reservations they can actually find and trust.',
    datePublished: '2026-06-19',
    author: BLOG_AUTHOR,
    tags: ['Travel Concierge', 'Client Experience'],
    sections: [
      {
        paragraphs: [
          'You assemble a beautiful trip — flights, transfers, a hard-to-get dinner, a private guide — and then you “share” it as a PDF attachment, a Google Drive link, and a few follow-up texts. The information is technically delivered. But the client now has to assemble the actual experience out of the pieces you sent, which is the exact work they paid you to do for them.',
          'Sharing is where a premium service quietly leaks. The trip can be flawless and still feel disorganized if the client cannot find what they need, when they need it.',
        ],
      },
      {
        heading: 'Sending files is not the same as sharing a trip',
        paragraphs: [
          'A PDF is a snapshot — accurate the moment you export it and stale the moment a reservation moves. A Drive folder is a filing cabinet — everything is in there somewhere, but the client has to know what they are looking for. Neither is organized around the trip itself: the day, the place, the time, the next thing to do.',
          'What you want is a single, living version of the trip that updates in place — not a trail of attachments the client has to reconcile.',
        ],
      },
      {
        heading: 'What clients actually need to find, fast',
        paragraphs: [
          'When a client opens anything you send, they are usually trying to answer one of these:',
        ],
        list: [
          'What is the plan today, and where do I need to be?',
          'What time is the reservation, and where is it?',
          'Can I pull up the confirmation or receipt at the desk right now?',
          'Who do I contact if something goes wrong?',
          'What is already paid for, and what is still outstanding?',
        ],
      },
      {
        heading: 'Put everything in one trip, organized by purpose',
        paragraphs: [
          'Instead of sharing files, share a workspace. Build the itinerary on a shared calendar so it is live, not a static export. Attach each confirmation, voucher, and receipt to the day or reservation it belongs to, so it is one tap away at a check-in desk. Pin the hotel and meeting points as base camps, save vetted recommendations as places, and keep payment status visible. The client stops hunting because everything sits where they would expect to look for it.',
        ],
        link: {
          label: 'See how Chravel works as a travel concierge client portal',
          to: '/use-cases/travel-concierge-client-portal',
        },
      },
      {
        heading: 'Keep it current without re-sending',
        paragraphs: [
          'The biggest advantage of sharing a trip instead of files is what happens when something changes. When a reservation moves, you update the calendar entry and send one broadcast — not a new PDF with a note to “ignore the last one.” There is always exactly one current version, and the client never has to figure out which message has the right time.',
        ],
      },
      {
        heading: 'A quick checklist for sharing a client trip',
        list: [
          'Itinerary built on the calendar, day by day.',
          'Every confirmation, voucher, and receipt attached to its day or reservation.',
          'Hotel and key meeting points pinned as base camps.',
          'Vetted recommendations saved as places.',
          'Payment status visible — paid vs outstanding.',
          'Client invited, with one welcome broadcast that explains where to look.',
        ],
      },
      {
        heading: 'Why this protects your brand',
        paragraphs: [
          'Clients judge your competence by how easy it is to find what they need. A trip where the plan, the documents, and the locations are one tap away reads as buttoned-up; a scavenger hunt across email, chat, and Drive reads as improvised. Sharing a trip the right way also cuts the steady drip of “can you resend that confirmation?” messages — which is better for the client and for you.',
        ],
      },
    ],
    faq: [
      {
        q: 'Should I still send a PDF itinerary?',
        a: 'You can export one if a client wants it, but treat the live trip as the source of truth so nobody acts on a stale snapshot.',
      },
      {
        q: 'Where should receipts and confirmations go?',
        a: 'Attach them to the trip — ideally on the relevant day or reservation — so they are one tap away when a client is standing at a desk.',
      },
      {
        q: 'How do clients know what changed?',
        a: 'Update the item in place and send a single broadcast; everyone sees the current plan instead of reconciling versions.',
      },
      {
        q: 'Is a shared Drive folder enough on its own?',
        a: 'A folder stores files; it does not organize the trip, surface the right document at the right time, or notify anyone when something changes.',
      },
    ],
    related: [
      {
        label: 'Why WhatsApp and Google Drive aren’t enough for luxury travel planning',
        to: '/blog/why-whatsapp-google-drive-not-enough-luxury-travel-planning',
      },
      {
        label: 'Chravel for travel concierge companies',
        to: '/use-cases/travel-concierge-client-portal',
      },
      { label: 'All Chravel use cases', to: '/use-cases' },
    ],
    cta: {
      heading: 'Share a trip, not a folder',
      subtext:
        'Give every client one organized, always-current place for the itinerary, documents, receipts, and reservations.',
      primaryLabel: 'Create a client trip',
      primaryTo: '/auth',
      secondaryLabel: 'See Chravel for travel concierge',
      secondaryTo: '/use-cases/travel-concierge-client-portal',
    },
  },
  {
    slug: 'why-whatsapp-google-drive-not-enough-luxury-travel-planning',
    title: 'Why WhatsApp and Google Drive Aren’t Enough for Luxury Travel Planning',
    description:
      'WhatsApp and Google Drive are where luxury trips quietly fall apart. See why they fall short for travel planning — and the client-ready alternative that looks more premium.',
    h1: 'Why WhatsApp and Google Drive aren’t enough for luxury travel planning',
    excerpt:
      'WhatsApp and Google Drive are familiar, free, and everywhere — which is exactly why luxury travel clients end up doing your organizing for you. Here’s where they fall short, and what to use instead.',
    datePublished: '2026-06-17',
    author: BLOG_AUTHOR,
    tags: ['Travel Concierge', 'Luxury Travel'],
    sections: [
      {
        paragraphs: [
          'Most travel planners run on WhatsApp and Google Drive because they are frictionless to start: everyone already has them, they are free, and you can send something in seconds. But “easy to start” and “right for a premium service” are not the same thing. For luxury travel, the gaps show up exactly where the client is paying you to remove friction.',
        ],
      },
      {
        heading: 'Why these tools feel good enough — until they aren’t',
        paragraphs: [
          'For a quick question, a WhatsApp message is perfect. For dropping a single document, Drive is fine. The trouble starts when they become the system of record for a multi-day, multi-reservation trip delivered to a discerning client. The tools were built for messaging and file storage — not for organizing an experience around time and place.',
        ],
      },
      {
        heading: 'Where WhatsApp falls short',
        list: [
          'The plan scrolls away — the itinerary is buried above 200 messages by the time the trip starts.',
          'There is no structure: schedule, tasks, locations, and small talk all blur into one thread.',
          'Attachments get compressed, expire, or get lost, so confirmations are hard to retrieve later.',
          'There is no single “where to be, and when” view a client can rely on.',
          'Real updates get missed because they look like every other message.',
          'Client and personal conversations mix in the same place.',
        ],
      },
      {
        heading: 'Where Google Drive falls short',
        list: [
          'It is a filing cabinet, not an itinerary — clients have to know what they are hunting for.',
          'Nothing is time-aware: there is no “today you have…” and no reminders.',
          'No one is notified when a file changes, so the client never knows there is a new version.',
          'Permissions and folder structures are clunky for a non-technical traveler.',
          'It is generic storage, not a guided, branded experience.',
        ],
      },
      {
        heading: 'What luxury clients are really paying for',
        paragraphs: [
          'A luxury client is paying to not manage logistics. A stack that makes them scroll to find the plan, hunt for a document, and work out which message has the right time pushes the work back onto them — the opposite of what they bought. These tools are invisible when they work and very visible when they do not, and at the top of the market the second kind of moment is the one clients remember.',
        ],
      },
      {
        heading: 'The alternative: one client-ready trip',
        paragraphs: [
          'The fix is not another app for its own sake — it is consolidating the trip into one place built around it. The itinerary lives on a calendar, documents and receipts are attached to the day or reservation they belong to, hotels and meeting points are pinned, recommendations are saved, and changes go out as a single broadcast. The client opens one organized trip instead of assembling it from a chat thread and a folder.',
        ],
        link: {
          label: 'See how Chravel works as a travel concierge client portal',
          to: '/use-cases/travel-concierge-client-portal',
        },
      },
      {
        heading: 'You don’t have to abandon what works',
        paragraphs: [
          'Keep WhatsApp for quick back-and-forth — that is what it is good at. The shift is to stop using it, and Drive, as the system of record. Let the trip be the single source of truth, and let chat be chat. The result is a more premium experience that also means fewer “can you resend that?” messages for you.',
        ],
      },
    ],
    faq: [
      {
        q: 'Do my clients have to stop using WhatsApp?',
        a: 'No. Keep it for quick questions, but move the itinerary, documents, and updates into one trip so nothing important lives only in a chat thread.',
      },
      {
        q: 'Isn’t Google Drive fine for documents?',
        a: 'It stores files, but it does not organize the trip or surface the right document at the right time. Attachments inside the trip are tied to the day or reservation they belong to.',
      },
      {
        q: 'Will clients have to download another app?',
        a: 'It runs on the web and as an installable app on iOS and Android, so clients can use it without committing to anything new.',
      },
      {
        q: 'What actually makes this feel more luxury?',
        a: 'A guided, organized, always-current experience signals competence. Scattered tools signal improvisation — and clients notice the difference.',
      },
    ],
    related: [
      {
        label: 'The best way to share itineraries, files, and receipts with clients',
        to: '/blog/how-to-share-itineraries-files-receipts-with-travel-clients',
      },
      {
        label: 'Chravel for travel concierge companies',
        to: '/use-cases/travel-concierge-client-portal',
      },
      { label: 'All Chravel use cases', to: '/use-cases' },
    ],
    cta: {
      heading: 'Give clients something better than a chat thread',
      subtext:
        'Move the itinerary, documents, and updates into one client-ready trip that always shows the current plan.',
      primaryLabel: 'Create a client trip',
      primaryTo: '/auth',
      secondaryLabel: 'See Chravel for travel concierge',
      secondaryTo: '/use-cases/travel-concierge-client-portal',
    },
  },
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Format an ISO date (YYYY-MM-DD) deterministically, avoiding timezone drift. */
export const formatBlogDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

/** Rough reading time at ~200 words/min over the post's text. */
export const estimateReadingMinutes = (post: BlogPost): number => {
  const words = post.sections.reduce((n, section) => {
    const text = [
      section.heading ?? '',
      ...(section.paragraphs ?? []),
      ...(section.list ?? []),
    ].join(' ');
    return n + text.trim().split(/\s+/).filter(Boolean).length;
  }, 0);
  return Math.max(1, Math.round(words / 200));
};

export const getBlogPost = (slug: string | undefined): BlogPost | undefined =>
  slug ? BLOG_POSTS.find(post => post.slug === slug) : undefined;

/** Posts newest-first for the index. */
export const getSortedBlogPosts = (): BlogPost[] =>
  [...BLOG_POSTS].sort((a, b) => b.datePublished.localeCompare(a.datePublished));
