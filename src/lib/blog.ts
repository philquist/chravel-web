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
export const BLOG_AUTHOR = 'The ChravelApp Team';

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'travel-concierge-better-client-experience-after-booking',
    title: 'How Travel Concierge Companies Can Deliver a Better Client Experience After Booking',
    description:
      'Travel concierge companies win on the post-booking experience. Learn how to replace scattered WhatsApp threads, PDFs, and Drive folders with one client trip portal — and look more premium after the sale.',
    h1: 'How travel concierge companies can deliver a better client experience after booking',
    excerpt:
      'The booking confirmation is where client expectations peak — and where most concierge teams fall back on scattered WhatsApp threads, PDFs, and Drive folders. Here is how to deliver a premium, organized experience after the client pays.',
    datePublished: '2026-05-20',
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
          label: 'See how ChravelApp works as a travel concierge client portal',
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
        label: 'ChravelApp for travel concierge companies',
        to: '/use-cases/travel-concierge-client-portal',
      },
      { label: 'All ChravelApp use cases', to: '/use-cases' },
      { label: 'ChravelApp for teams', to: '/teams' },
    ],
    cta: {
      heading: 'Deliver a more premium trip after every booking',
      subtext:
        'Create a client-ready trip, preload the details, and invite your client into one organized workspace.',
      primaryLabel: 'Create a client trip',
      primaryTo: '/auth',
      secondaryLabel: 'See ChravelApp for travel concierge',
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
    datePublished: '2026-04-19',
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
          label: 'See how ChravelApp works as a travel concierge client portal',
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
        label: 'ChravelApp for travel concierge companies',
        to: '/use-cases/travel-concierge-client-portal',
      },
      { label: 'All ChravelApp use cases', to: '/use-cases' },
    ],
    cta: {
      heading: 'Share a trip, not a folder',
      subtext:
        'Give every client one organized, always-current place for the itinerary, documents, receipts, and reservations.',
      primaryLabel: 'Create a client trip',
      primaryTo: '/auth',
      secondaryLabel: 'See ChravelApp for travel concierge',
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
    datePublished: '2026-03-17',
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
          label: 'See how ChravelApp works as a travel concierge client portal',
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
        label: 'ChravelApp for travel concierge companies',
        to: '/use-cases/travel-concierge-client-portal',
      },
      { label: 'All ChravelApp use cases', to: '/use-cases' },
    ],
    cta: {
      heading: 'Give clients something better than a chat thread',
      subtext:
        'Move the itinerary, documents, and updates into one client-ready trip that always shows the current plan.',
      primaryLabel: 'Create a client trip',
      primaryTo: '/auth',
      secondaryLabel: 'See ChravelApp for travel concierge',
      secondaryTo: '/use-cases/travel-concierge-client-portal',
    },
  },
  {
    slug: 'how-to-create-client-trip-portal-without-custom-app',
    title: 'How to Create a Client Trip Portal Without Building a Custom App',
    description:
      'You don’t need a custom app or a white-label build to give travel clients a premium trip portal. Here’s how to stand one up today — and what a portal actually needs to deliver.',
    h1: 'How to create a client trip portal without building a custom app',
    excerpt:
      'A polished client portal sounds like a six-figure software project. It isn’t. Here’s what a trip portal actually needs — and how to create one for your next client without writing a line of code.',
    datePublished: '2026-06-20',
    author: BLOG_AUTHOR,
    tags: ['Travel Concierge', 'Client Experience'],
    sections: [
      {
        paragraphs: [
          'Ask a travel concierge what would make their post-booking experience feel more premium and many will say the same thing: “a client portal.” Then they picture what that takes — a developer, a design budget, months of build time, ongoing maintenance — and the idea dies on the spot.',
          'It does not have to. You can give clients a genuine trip portal today, without commissioning a custom app or paying for a white-label platform. The trick is to be clear about what a portal actually needs to do, and then use a tool that already does it.',
        ],
      },
      {
        heading: 'What a client trip portal actually needs',
        paragraphs: [
          'Strip away the branding fantasy and a useful client portal comes down to a short list:',
        ],
        list: [
          'One place that holds the whole trip — itinerary, documents, locations, and to-dos.',
          'A live itinerary, not a PDF that goes stale the moment a reservation moves.',
          'Documents and receipts the client can pull up on the spot.',
          'A way to push an update once and have everyone see it.',
          'Access from any phone or browser, with no setup friction for the client.',
        ],
      },
      {
        heading: 'Why a custom build is the wrong first move',
        paragraphs: [
          'Building your own portal means paying for development, waiting months, and then owning the maintenance, security, and support forever. You would be rebuilding calendars, file storage, notifications, and access control that already exist — and doing it as a side project to your actual business, which is planning travel. For all but the largest agencies, a custom build is cost and risk in exchange for a feature set you can get off the shelf.',
        ],
      },
      {
        heading: 'Create the portal from a trip workspace instead',
        paragraphs: [
          'Instead of building software, assemble the portal out of a trip. Create one trip per client, put the itinerary on the calendar, attach confirmations and receipts, pin the hotel and meeting points as base camps, save recommendations as places, and add any pre-trip tasks. Then invite the client. They open one organized space that already feels planned — which is exactly what a portal is supposed to feel like — and you did it in minutes, not months.',
        ],
        link: {
          label: 'See how ChravelApp works as a travel concierge client portal',
          to: '/use-cases/travel-concierge-client-portal',
        },
      },
      {
        heading: 'Stand up your first client portal in minutes',
        list: [
          'Create a trip for the client or family.',
          'Add the itinerary to the calendar — or import it from confirmation emails and PDFs.',
          'Attach receipts, vouchers, and reservations.',
          'Pin the hotel and meeting points, and save your recommendations.',
          'Assign any pre-trip tasks, then invite the client and send one welcome broadcast.',
        ],
      },
      {
        heading: 'When does a custom build make sense?',
        paragraphs: [
          'Eventually, a large agency with very specific workflows and the budget to maintain software might want something bespoke or white-labeled. But that is a later optimization, not a starting point. The fastest way to look more premium today is to stop sending folders and start sharing a trip — and you can do that for your very next client.',
        ],
      },
    ],
    faq: [
      {
        q: 'Isn’t a “portal” supposed to be branded with my company?',
        a: 'Clients care far more about whether the trip is organized and current than about a custom logo. You can deliver a premium, branded-feeling experience without a white-label build; bespoke branding can come later if you ever need it.',
      },
      {
        q: 'How long does it take to set up?',
        a: 'Minutes per client. You create a trip, preload the details (or import them), and invite the client — no development or onboarding project required.',
      },
      {
        q: 'What does the client have to install?',
        a: 'Nothing mandatory. It runs on the web and as an installable app on iOS and Android, so clients can open their trip from a link on any device.',
      },
      {
        q: 'Can my team run portals for many clients at once?',
        a: 'Yes. With role-based access, multiple planners can each run client trips with the right permissions, using the same repeatable structure.',
      },
    ],
    related: [
      {
        label: 'ChravelApp for travel concierge companies',
        to: '/use-cases/travel-concierge-client-portal',
      },
      {
        label: 'How to share itineraries, files, and receipts with clients',
        to: '/blog/how-to-share-itineraries-files-receipts-with-travel-clients',
      },
      { label: 'All ChravelApp use cases', to: '/use-cases' },
    ],
    cta: {
      heading: 'Give your next client a portal, not a folder',
      subtext:
        'Create a client-ready trip in minutes — no custom app, no white-label build — and invite the client into one organized space.',
      primaryLabel: 'Create a client trip',
      primaryTo: '/auth',
      secondaryLabel: 'See ChravelApp for travel concierge',
      secondaryTo: '/use-cases/travel-concierge-client-portal',
    },
  },
  {
    slug: 'collect-wedding-guest-photos-iphone-android',
    title: 'The Best Way to Collect Wedding Guest Photos from iPhone and Android',
    description:
      'iCloud Shared Albums leave Android guests out and AirDrop is iPhone-only. Here’s the best way to collect wedding guest photos from every device — in one shared album everyone can use.',
    h1: 'The best way to collect wedding guest photos from iPhone and Android',
    excerpt:
      'Your guests are shooting hundreds of photos on a mix of iPhones and Androids — and most of them never reach the couple. Here’s how to collect every guest’s photos in one album, regardless of device.',
    datePublished: '2026-06-16',
    author: BLOG_AUTHOR,
    tags: ['Weddings', 'Photo Sharing'],
    sections: [
      {
        paragraphs: [
          'Across a wedding weekend, guests capture the moments the photographer cannot — the table laughing, the dance floor at midnight, the quiet aside during cocktail hour. The problem is that those photos almost never make it back to the couple. They stay trapped on individual phones, scattered across a mix of iPhones and Androids.',
          'Most of the “solutions” people reach for quietly exclude half the guests. There is a better way, and it starts with not assuming everyone is on the same kind of phone.',
        ],
      },
      {
        heading: 'Why the usual methods fall short',
        list: [
          'iCloud Shared Albums are Apple-only — every Android guest is locked out.',
          'AirDrop is iPhone-to-iPhone, so it cannot collect from the whole party.',
          'Texting photos compresses them and buries them in dozens of separate threads.',
          'A wedding group chat turns photos into endless scrollback no one can sort later.',
          'Asking guests to “email me your pics” almost guarantees you will never see most of them.',
        ],
      },
      {
        heading: 'What actually works: one shared album for every device',
        paragraphs: [
          'The reliable approach is a single shared album any guest can upload to from any phone — iPhone or Android — without a clumsy sign-up. When the album lives on the wedding trip everyone is already using for the schedule and locations, uploading photos becomes a natural part of the weekend instead of a chore you have to chase afterward.',
          'Because it is one place, the couple sees candid moments roll in during the weekend — not weeks later — and nobody has to text their best shots one at a time.',
        ],
        link: {
          label: 'See how ChravelApp works as a wedding guest coordination app',
          to: '/use-cases/wedding-guest-coordination-app',
        },
      },
      {
        heading: 'Set up a shared wedding album guests will actually use',
        list: [
          'Create the wedding trip and invite guests (a link or QR code at the tables works well).',
          'Turn on the shared media album so anyone can upload from iPhone or Android.',
          'Add a quick note in the schedule asking guests to upload each night.',
          'Keep the album as the single home for photos — not the group chat.',
          'After the weekend, the couple has every guest’s photos in one place to download and keep.',
        ],
      },
      {
        heading: 'Make it effortless for guests',
        paragraphs: [
          'The fewer steps between a guest and the upload button, the more photos you get. Share the album with a link or QR code, make sure it works on any device, and remind guests once or twice during the weekend. Pair it with the rest of the trip — schedule, dress code, locations — and guests have one place for everything, which is exactly why they will actually use it.',
        ],
      },
    ],
    faq: [
      {
        q: 'Do Android and iPhone guests really use the same album?',
        a: 'Yes. The shared media album works on the web and on iOS and Android, so every guest uploads to the same place regardless of device.',
      },
      {
        q: 'Do guests need to create an account?',
        a: 'Guests join the wedding trip and can upload to the shared album — there is no clumsy, photographer-style gallery sign-up to slow them down.',
      },
      {
        q: 'When should we share the album?',
        a: 'Before the weekend, so early arrivals and welcome events are captured too. A link or QR code at the tables makes it easy for everyone to join.',
      },
      {
        q: 'Can the couple download everything afterward?',
        a: 'Yes — because all the photos land in one album, the couple has a single place to view and save every guest’s shots after the wedding.',
      },
    ],
    related: [
      {
        label: 'ChravelApp for wedding guest coordination',
        to: '/use-cases/wedding-guest-coordination-app',
      },
      { label: 'All ChravelApp use cases', to: '/use-cases' },
    ],
    cta: {
      heading: 'Collect every guest’s photos in one place',
      subtext:
        'Set up a shared wedding album that works on iPhone and Android — and keep the schedule, locations, and dress code in the same trip.',
      primaryLabel: 'Create a wedding trip',
      primaryTo: '/auth',
      secondaryLabel: 'See ChravelApp for weddings',
      secondaryTo: '/use-cases/wedding-guest-coordination-app',
    },
  },
  {
    slug: 'family-hub-app-for-parents',
    title: 'ChravelApp as a Family Hub: Keep Kids, Schedules, Photos, and Chores in One Place',
    description:
      'Practices, pickups, forms, chores, dinner, and team carpools — ChravelApp turns the chaos of family logistics into one shared hub for parents and kids. Here’s how to set it up.',
    h1: 'ChravelApp as a family hub: keep kids, schedules, photos, and chores in one place',
    excerpt:
      'A family runs on logistics — practices, pickups, forms, chores, and “what’s for dinner?” Here’s how to turn the group-text chaos into one shared family hub, and how a whole team’s parents can run carpools from the same place.',
    datePublished: '2026-06-22',
    author: BLOG_AUTHOR,
    tags: ['Families', 'Family Organization'],
    sections: [
      {
        paragraphs: [
          'A modern family runs on logistics. There is a practice on Tuesday, a game two towns over on Saturday, a permission slip due Friday, a birthday gift to coordinate, and a nightly debate about dinner. The information lives everywhere — one parent’s text thread, a paper flyer on the fridge, two different calendars, a coach’s group chat, and a dozen screenshots — and the moment it is that scattered, somebody misses a pickup or forgets the form.',
          'It does not have to be that way. The same shared workspace that keeps a trip organized works just as well for the everyday — and for a whole team of families. Here is how to use ChravelApp as a family hub.',
        ],
      },
      {
        heading: 'Why family logistics fall apart',
        paragraphs: ['The breakdowns are familiar to every parent:'],
        list: [
          'The schedule lives in three places — your calendar, your partner’s, and the team chat — and they never quite agree.',
          'Permission slips, tickets, and rosters get lost between backpack, fridge, and inbox.',
          'Game photos stay stuck on one kid’s phone and never reach grandma.',
          'Nobody remembers who paid for what — tickets, gas, gear, the team gift.',
          'Carpool and snack duty turn into a forty-message group text no one can follow.',
        ],
      },
      {
        heading: 'Put the whole family on one shared calendar',
        paragraphs: [
          'Start with a single shared Calendar the whole household can see: practices, games, recitals, appointments, and who is responsible for each pickup. Instead of reconciling two phones and a flyer, everyone — including the kids and a grandparent helping with rides — opens the same plan and sees what is happening today and who has it covered.',
        ],
        link: {
          label: 'See how ChravelApp works as a family hub',
          to: '/use-cases/family-organization-app',
        },
      },
      {
        heading: 'Let kids share game photos to the family — instantly',
        paragraphs: [
          'Some of the best moments happen when a parent cannot be there. With a shared Media album, a kid can post photos straight from the soccer game into the family chat, so the parent stuck at work and the grandparents across the country see them in real time — not weeks later, buried in someone’s camera roll. Because it works on iPhone and Android, no one is left out for having the “wrong” phone.',
        ],
      },
      {
        heading: 'Keep tickets, forms, and money in one place',
        paragraphs: [
          'Drop tickets, permission slips, rosters, and school forms into Attachments so they are one tap away when you are standing at the gate or the front office — no frantic inbox search. And when the small debts pile up — who covered the tickets, the gas, the new cleats — Payments lets the family settle who owes who without a side spreadsheet or an awkward Venmo memo thread.',
        ],
      },
      {
        heading: 'Chores and dinner without the nagging',
        paragraphs: [
          'A shared Tasks list turns chores from a nightly argument into something everyone can see and check off — trash, dishes, homework, packing the bag for tomorrow. And for the eternal “what’s for dinner?”, a quick Poll settles it: a parent drops “pizza, sushi, or Chinese?” and the family votes instead of spiraling through twenty texts.',
        ],
      },
      {
        heading: 'You don’t need a trip',
        paragraphs: [
          'Here is the part people miss: nothing about this requires going anywhere. A “trip” in ChravelApp can simply be your family, or this season. It works exactly the same for a Saturday of local games as it does for a week away — the hub is about keeping the people you care about on the same page, whether or not a flight is involved.',
        ],
      },
      {
        heading: 'For team parents: the carpool that runs itself',
        paragraphs: [
          'The family hub scales past one household, and this is where it gets powerful. Put all the parents of a kids’ football, soccer, or basketball team in one ChravelApp trip and the season’s logistics finally have a home. The shared Calendar holds every practice and game; Tasks track who is bringing snacks, water, and the canopy each week; and a single Broadcast handles “practice moved to 5pm” or “meet at the north lot” without the forty-message thread nobody can follow.',
          'Carpools stop being a daily scramble. Parents can see who is driving, who needs a ride, and who is covering pickup, and they can coordinate with each other directly — “I’ve got the east side, can someone grab the twins?” — all in one place that does not vanish up the scrollback. For a group of busy families trying to get a dozen kids to the same field on time, that is the difference between a calm Saturday and a chaotic one.',
        ],
      },
      {
        heading: 'Getting started',
        paragraphs: [
          'Create a trip for your family — or for this season’s team — add the recurring schedule to the Calendar, drop in the forms and tickets, start a Tasks list, and turn on the shared album. Invite whoever should be in the loop, from your partner and kids to a grandparent or the other team parents. The logistics that used to live in five places now live in one, and everyone spends less time chasing details and more time actually together.',
        ],
      },
    ],
    faq: [
      {
        q: 'Do we need to be taking a trip to use ChravelApp as a family hub?',
        a: 'No. A “trip” can simply be your family or your team’s season. It works the same for a local Saturday of games as it does for travel.',
      },
      {
        q: 'Can kids and grandparents be included?',
        a: 'Yes. You invite whoever should be in the loop and control their access, so kids can post game photos and grandparents can follow along on any device.',
      },
      {
        q: 'How do all the team parents coordinate carpools?',
        a: 'Put every parent in one trip and use the shared Calendar, Tasks, and a single Broadcast for pickups, snacks, and gear — instead of a group text that buries the important details.',
      },
      {
        q: 'Can we settle money between family members or parents?',
        a: 'Yes. Payments lets you track who owes who for tickets, gas, gear, and team costs without a separate spreadsheet.',
      },
      {
        q: 'Does it work on both iPhone and Android?',
        a: 'Yes — ChravelApp runs on the web and as an installable app on iOS and Android, so every parent and kid is covered regardless of device.',
      },
    ],
    related: [
      { label: 'ChravelApp for families and parents', to: '/use-cases/family-organization-app' },
      {
        label: 'ChravelApp for sports teams',
        to: '/use-cases/sports-team-travel-coordination',
      },
      { label: 'All ChravelApp use cases', to: '/use-cases' },
    ],
    cta: {
      heading: 'Turn family chaos into one shared hub',
      subtext:
        'Put the calendar, photos, forms, chores, dinner polls, and team carpools in one place — and invite everyone who needs to be in the loop.',
      primaryLabel: 'Create a family hub',
      primaryTo: '/auth',
      secondaryLabel: 'See ChravelApp for families',
      secondaryTo: '/use-cases/family-organization-app',
    },
  },
  {
    slug: 'fraternity-spring-break-trip-chravelapp',
    title: 'How a Fraternity Pulled Off a Seamless Spring Break Trip with ChravelApp',
    description:
      'Forty brothers, one beach house, and a hundred ways for spring break to go sideways. Here’s how one fraternity used ChravelApp’s shared calendar, photos, and tasks to keep the whole week seamless.',
    h1: 'How a fraternity pulled off a seamless spring break trip with ChravelApp',
    excerpt:
      'Forty brothers, one beach house, and a hundred ways for a spring break trip to fall apart. Here’s how one chapter used ChravelApp’s shared calendar, photos, and tasks to make the whole week run itself.',
    datePublished: '2026-03-12',
    author: BLOG_AUTHOR,
    tags: ['Group Travel', 'Students'],
    sections: [
      {
        paragraphs: [
          'Spring break with a fraternity is the ultimate stress test for group planning. Forty guys, one beach house, a patchwork of flights and drives, a boat day someone swears they booked, and a group chat that hit three hundred unread messages before anyone had paid a deposit. One chapter decided to run the whole trip in ChravelApp instead — and it changed how the week went.',
        ],
      },
      {
        heading: 'Planning a trip for forty people breaks a group chat',
        paragraphs: [
          'A group text is fine for five friends. At forty, it collapses: the house address scrolls away, nobody knows who has paid, half the chat is memes, and the one message that mattered — the boat leaves at 9, not 10 — is buried under two hundred replies. The brothers organizing the trip were spending more time answering the same questions than actually planning.',
        ],
      },
      {
        heading: 'One shared calendar everyone actually checked',
        paragraphs: [
          'The first fix was a single shared Calendar: arrival waves, the boat day, the group dinner reservation, the foam party, and checkout. Instead of re-answering “what time is the thing?” forty times, the organizers pointed everyone to one place. When the boat company moved the time, they changed it once and the whole house saw it.',
        ],
        link: {
          label: 'See how ChravelApp works for group trips',
          to: '/group-travel-planning-app',
        },
      },
      {
        heading: 'Photos that didn’t vanish into forty camera rolls',
        paragraphs: [
          'By the end of the week, the best photos and videos usually live on forty different phones and never get shared. With one shared Media album, everyone dumped their photos into the same place — iPhone or Android — so the whole chapter walked away with the full set instead of begging people to AirDrop later.',
        ],
      },
      {
        heading: 'Tasks and payments kept the deposit and the runs on track',
        paragraphs: [
          'A shared Tasks list tracked who was booking the house, who had the boat, who was on the grocery and ice runs, and who still owed for their share. Payments handled the “who owes who” math so the two guys fronting the deposit were not chasing thirty-eight Venmos by memory. The logistics that usually fall on one stressed-out social chair were finally visible to everyone.',
        ],
      },
      {
        paragraphs: [
          'The trip still had all the chaos you want from spring break — just none of the chaos you do not. One shared place for the schedule, the money, the tasks, and the photos turned a forty-person trip from a logistical nightmare into a week that mostly ran itself.',
        ],
      },
    ],
    faq: [
      {
        q: 'Do you have to be in a fraternity for this to work?',
        a: 'No. Any large group trip — friends, a birthday, a bachelor party, a club — runs into the same forty-people-one-group-chat problem, and the same shared calendar, tasks, photos, and payments fix it.',
      },
      {
        q: 'How do you handle who owes who?',
        a: 'Payments lets the group track and settle shares for the house, the boat, and group meals without one person chasing everyone’s Venmo.',
      },
      {
        q: 'Does everyone need an iPhone?',
        a: 'No — ChravelApp runs on the web and as an installable app on iOS and Android, so the whole group is covered, including the shared photo album.',
      },
    ],
    related: [
      { label: 'ChravelApp for group trips', to: '/group-travel-planning-app' },
      { label: 'All ChravelApp use cases', to: '/use-cases' },
    ],
    cta: {
      heading: 'Plan your group’s next trip in one place',
      subtext:
        'Put the schedule, tasks, payments, and a shared photo album in one trip — and invite the whole crew.',
      primaryLabel: 'Start a group trip',
      primaryTo: '/auth',
      secondaryLabel: 'See ChravelApp for group trips',
      secondaryTo: '/group-travel-planning-app',
    },
  },
  {
    slug: 'parents-coordinating-youth-football-team-chravelapp',
    title: 'How a Group of Parents Ran Their Kids’ Football Season with ChravelApp',
    description:
      'Carpools, snack duty, game times, and forty texts a day. Here’s how the parents of one youth football team swapped the group-chat chaos for one shared ChravelApp hub.',
    h1: 'How a group of parents ran their kids’ football season with ChravelApp',
    excerpt:
      'Carpools, snack duty, last-minute field changes, and a group text nobody can keep up with. Here’s how the parents of one youth football team ran the whole season from one shared ChravelApp hub.',
    datePublished: '2026-02-18',
    author: BLOG_AUTHOR,
    tags: ['Families', 'Sports'],
    sections: [
      {
        paragraphs: [
          'Every youth sports team has one parent who quietly becomes the coordinator — the one tracking who is driving, who is bringing snacks, and where the field moved to this week. For one youth football team, that role had turned into a second job lived entirely inside an exhausting group text. So the parents moved the whole season into ChravelApp instead.',
        ],
      },
      {
        heading: 'A group text can’t hold a season',
        paragraphs: [
          'Practices, games, tournaments, snack rotations, carpools, and the occasional rained-out reschedule do not fit in a single scrolling thread. The important message — practice moved to 5pm, meet at the north field — always gets buried under reply-all chatter, and somebody always shows up at the wrong place at the wrong time.',
        ],
      },
      {
        heading: 'One shared calendar for every practice and game',
        paragraphs: [
          'The parents built a shared Calendar with every practice, game, and tournament, plus who was responsible for each carpool and pickup. Instead of reconstructing the week from memory and screenshots, every family opened the same plan and saw exactly where to be and who had it covered.',
        ],
        link: {
          label: 'See how ChravelApp works as a family hub',
          to: '/use-cases/family-organization-app',
        },
      },
      {
        heading: 'Tasks turned snack duty and carpools into something you could see',
        paragraphs: [
          'A shared Tasks list made the invisible work visible: who was bringing snacks and water this week, who had the canopy and the first-aid kit, and which parent was driving which kids. No more “I thought you had it” — the assignments were right there, and anyone could check what still needed a volunteer.',
        ],
      },
      {
        heading: 'One broadcast instead of forty texts',
        paragraphs: [
          'When the field changed or a game got rained out, one Broadcast reached every family at once instead of a frantic reply-all. And the team’s photos — game-day action shots, the end-of-season party — landed in one shared album every parent could pull from, instead of being trapped on one phone.',
        ],
      },
      {
        paragraphs: [
          'The season still had early mornings and long Saturdays, but the coordination stopped being a burden carried by one parent. One shared hub for the schedule, the carpools, the snacks, and the photos let all the families share the load — and actually enjoy watching their kids play.',
        ],
      },
    ],
    faq: [
      {
        q: 'Who sets this up — the coach or the parents?',
        a: 'Either. A team parent or coach creates one trip for the season and invites the other families; from there the calendar, tasks, and broadcasts are shared.',
      },
      {
        q: 'How do carpools and snack duty get tracked?',
        a: 'Use the shared Tasks list so everyone can see who is driving, who is bringing what, and what still needs a volunteer — no more relying on one parent’s memory.',
      },
      {
        q: 'Does it work for any youth sport?',
        a: 'Yes — football, soccer, basketball, baseball, or any team where a group of parents has to coordinate practices, games, and rides across a season.',
      },
    ],
    related: [
      { label: 'ChravelApp for families and parents', to: '/use-cases/family-organization-app' },
      { label: 'ChravelApp for sports teams', to: '/use-cases/sports-team-travel-coordination' },
      { label: 'All ChravelApp use cases', to: '/use-cases' },
    ],
    cta: {
      heading: 'Run your team’s season from one shared hub',
      subtext:
        'Put the schedule, carpools, snack duty, and team photos in one place — and invite every family.',
      primaryLabel: 'Create a family hub',
      primaryTo: '/auth',
      secondaryLabel: 'See ChravelApp for families',
      secondaryTo: '/use-cases/family-organization-app',
    },
  },
  {
    slug: 'tour-manager-50-city-tour-chravelapp',
    title: 'Running a 50-City Tour: How a Tour Manager Stays Sane with ChravelApp',
    description:
      'Fifty cities, a dozen departments, and a new day sheet every morning. Here’s how a tour manager uses ChravelApp to keep artists, crew, security, and content aligned on the road.',
    h1: 'Running a 50-city tour: how a tour manager stays sane with ChravelApp',
    excerpt:
      'Fifty cities, a dozen departments, and a fresh day sheet every morning. Here’s how a tour manager uses ChravelApp to keep the artist, crew, security, and content team aligned night after night.',
    datePublished: '2026-01-21',
    author: BLOG_AUTHOR,
    tags: ['Music Touring', 'Tour Management'],
    sections: [
      {
        paragraphs: [
          'A 50-city tour is fifty versions of the same hard problem: a new venue, a new hotel, new load-in and door times, and the same crew that needs to know all of it before the day starts. The tour manager is the single point of failure for every one of those details — and for years the job has run on a day sheet PDF, a wall of texts, and a prayer.',
        ],
      },
      {
        heading: 'Every department on a different thread',
        paragraphs: [
          'The breakdown is always the same. The TM has the day sheet, security has movement and venue notes, the photographer got a call time from someone else, management is in email, and the promoter sent a PDF. By the third city, nobody is sure which version is current, and the TM is answering the same five questions in five different chats.',
        ],
      },
      {
        heading: 'One workspace per city',
        paragraphs: [
          'In ChravelApp, each city is one place: the schedule and call times on the Calendar, the hotel and venue pinned as Base Camps, parking and nearby spots in Explorer, and the advance, contracts, and run-of-show kept as Attachments. Smart Import can pull schedules and reservations from confirmation emails and PDFs, so the TM is building from the advance instead of retyping it.',
        ],
        link: {
          label: 'See how ChravelApp works for tour coordination',
          to: '/use-cases/music-tour-coordination',
        },
      },
      {
        heading: 'Broadcast to the right people, not everyone',
        paragraphs: [
          'When a lobby call moves or a venue changes the load-in door, the TM sends one Broadcast to the group that needs it — band, crew, or security — instead of blasting everyone and hoping. Tasks are assigned by role, so each department knows what it owns for the day without the TM chasing them.',
        ],
      },
      {
        heading: 'Content and memories in one place',
        paragraphs: [
          'The photographer and content team upload to one shared Media album instead of scattering assets across AirDrop, iCloud links, and Dropbox. When management or the label needs a shot from last night, it is already where everyone can find it.',
        ],
      },
      {
        paragraphs: [
          'Fifty cities never gets easy, but it gets manageable when the whole touring party works from one source of truth. The TM spends less of the day re-explaining logistics and more of it actually running the show.',
        ],
      },
    ],
    faq: [
      {
        q: 'Does this replace professional tour-management software?',
        a: 'It is a lightweight coordination layer, not a replacement for a full production stack. It shines at keeping the whole touring party — crew, security, content, guests — aligned on the day-to-day.',
      },
      {
        q: 'How do different departments stay in their lane?',
        a: 'Role-based access and targeted Broadcasts mean each group gets what it needs without wading through everyone else’s logistics.',
      },
      {
        q: 'Can the advance and day sheets be imported?',
        a: 'Yes. Smart Import pulls schedules and reservations from confirmation emails, PDFs, and links so you are not retyping the advance for every city.',
      },
    ],
    related: [
      { label: 'ChravelApp for tour coordination', to: '/use-cases/music-tour-coordination' },
      { label: 'ChravelApp for teams', to: '/teams' },
      { label: 'All ChravelApp use cases', to: '/use-cases' },
    ],
    cta: {
      heading: 'Keep the whole tour on one source of truth',
      subtext:
        'Organize each city’s schedule, hotels, venues, call times, tasks, and content in one workspace — and broadcast changes to the right people.',
      primaryLabel: 'Build a tour workspace',
      primaryTo: '/auth',
      secondaryLabel: 'See ChravelApp for touring',
      secondaryTo: '/use-cases/music-tour-coordination',
    },
  },
  {
    slug: 'comedian-club-theater-tour-chravelapp',
    title: 'On the Road with a Comedian: Running a Club and Theater Tour in ChravelApp',
    description:
      'A comedy tour is lean and relentless — a comic, an opener, a tour manager, and merch hitting a new room every night. Here’s how a small touring party keeps it organized in ChravelApp.',
    h1: 'On the road with a comedian: running a club and theater tour in ChravelApp',
    excerpt:
      'A comedy tour is lean and relentless — a comic, an opener, a tour manager, and a merch person hitting a new club or theater every night. Here’s how a small touring party keeps it all straight in ChravelApp.',
    datePublished: '2025-12-09',
    author: BLOG_AUTHOR,
    tags: ['Music Touring', 'Comedy'],
    sections: [
      {
        paragraphs: [
          'A comedy tour looks simple from the outside — one person and a microphone — but the logistics are relentless. A comic, an opener, a tour manager, and maybe a merch person hit a new club or theater every night, with radio promo in the morning, a long drive in the afternoon, and a late load-in before the first set. With a crew that small, one missed detail derails the whole day.',
        ],
      },
      {
        heading: 'Small crew, no margin for missed details',
        paragraphs: [
          'When four people are running everything, there is no department to catch a mistake. A wrong set time, a missed radio hit, or a hotel booked in the wrong city is not an inconvenience — it is the whole night. The tour cannot afford to have details scattered across texts and email.',
        ],
      },
      {
        heading: 'The whole run in one place',
        paragraphs: [
          'In ChravelApp, the run lives in one workspace: set times, press, and travel on the Calendar; the club and hotel pinned as Base Camps; and the settlement sheets, contracts, and tech riders kept as Attachments. Whoever is driving and whoever is checking in are looking at the same plan instead of texting “what city are we in tomorrow?”',
        ],
        link: {
          label: 'See how ChravelApp works for tour coordination',
          to: '/use-cases/music-tour-coordination',
        },
      },
      {
        heading: 'Promo, merch, and the night-of details',
        paragraphs: [
          'A shared Tasks list keeps the day’s moving parts straight — the morning radio hit, the meet-and-greet, the merch count and restock — and a quick Broadcast handles the inevitable “doors pushed to 8.” The comic can focus on the set instead of the schedule.',
        ],
      },
      {
        heading: 'Clips and photos for socials',
        paragraphs: [
          'Comedy lives on clips, and clips get lost fast. A shared Media album collects the night’s photos and video in one place, so the team can pull content for socials without digging through four phones the next morning.',
        ],
      },
      {
        paragraphs: [
          'A small tour does not need a heavyweight production system — it needs one place that holds the night. With the schedule, the docs, the tasks, and the content together, a lean comedy run stays organized from the first radio hit to the last drink at the bar.',
        ],
      },
    ],
    faq: [
      {
        q: 'Is ChravelApp overkill for a four-person tour?',
        a: 'No — it is built to be the lightweight layer a small crew actually needs: one place for the schedule, documents, tasks, and content, without a heavy production stack.',
      },
      {
        q: 'Can the opener and merch person see everything?',
        a: 'You control who is on the trip and what they can see, so the whole touring party stays aligned on logistics while sensitive items stay limited.',
      },
      {
        q: 'Where do clips and photos go?',
        a: 'Into one shared Media album, so the team can grab content for socials instead of chasing assets across everyone’s phones.',
      },
    ],
    related: [
      { label: 'ChravelApp for tour coordination', to: '/use-cases/music-tour-coordination' },
      { label: 'All ChravelApp use cases', to: '/use-cases' },
    ],
    cta: {
      heading: 'Keep the whole run in one place',
      subtext:
        'Put set times, travel, documents, tasks, and content in one workspace — and broadcast the changes that always come.',
      primaryLabel: 'Build a tour workspace',
      primaryTo: '/auth',
      secondaryLabel: 'See ChravelApp for touring',
      secondaryTo: '/use-cases/music-tour-coordination',
    },
  },
  {
    slug: 'arena-tour-large-crew-chravelapp',
    title: 'How a Major Artist’s Arena Tour Keeps a Huge Crew Aligned with ChravelApp',
    description:
      'An arena run moves a small city every day — band, dancers, security, wardrobe, content, and local crew. Here’s how ChravelApp keeps a large touring operation aligned city to city.',
    h1: 'How a major artist’s arena tour keeps a huge crew aligned with ChravelApp',
    excerpt:
      'An arena tour moves a small city every day — band, dancers, security, wardrobe, content, VIPs, and local crew. Here’s how a large touring operation stays aligned, city to city, in ChravelApp.',
    datePublished: '2025-07-22',
    author: BLOG_AUTHOR,
    tags: ['Music Touring', 'Production'],
    sections: [
      {
        paragraphs: [
          'A major arena tour is a traveling small city. Beyond the artist, there is a band, dancers, wardrobe, hair and makeup, security, a content team, tour and production management, VIP guests, and a fresh local crew in every market. Coordinating that many moving parts night after night is a logistics operation in its own right — and the bigger the party, the more ways there are to lose the plot.',
        ],
      },
      {
        heading: 'More people, more ways to lose the plot',
        paragraphs: [
          'At this scale, a single group chat is useless and a stack of separate ones is worse. Security needs movement and room details, the content team needs shoot windows, wardrobe needs call times, and VIP guests need just enough — but not the whole operation. When that lives in a dozen disconnected threads, something always slips.',
        ],
      },
      {
        heading: 'A shared day sheet the whole touring party can trust',
        paragraphs: [
          'In ChravelApp, every city has one current schedule on the Calendar, with the hotel, venue, and key rooms pinned as Base Camps and the advance, schedules, and credentials kept as Attachments. Instead of forwarding a screenshot of a day sheet that is already out of date, the whole party works from one version that updates in place.',
        ],
        link: {
          label: 'See how ChravelApp works for tour coordination',
          to: '/use-cases/music-tour-coordination',
        },
      },
      {
        heading: 'The right message to the right group',
        paragraphs: [
          'Role-based access and targeted Broadcasts mean security, content, band, and guests each get what they need and nothing they do not. A lobby-call change reaches the people it affects without blasting the entire operation, and sensitive movement details stay with the team that handles them.',
        ],
      },
      {
        heading: 'VIPs, guests, and content without the side chats',
        paragraphs: [
          'Guest lists, after-show plans, and content windows live in Tasks and the shared schedule instead of a tangle of side texts, and the content team uploads to one shared Media album so management and the label can find last night’s shots immediately.',
        ],
      },
      {
        paragraphs: [
          'A run this big will always be complex, but it does not have to be chaotic. One workspace per city — with the right people seeing the right things — keeps a huge crew moving together, market after market.',
        ],
      },
    ],
    faq: [
      {
        q: 'Can different departments have different access?',
        a: 'Yes. Role-based access keeps security, content, band, wardrobe, and guests in their own lanes while everyone still shares one source of truth.',
      },
      {
        q: 'How do guests and VIPs fit in without seeing everything?',
        a: 'You invite them with limited access so they get the logistics they need — times and locations — without the full production detail.',
      },
      {
        q: 'Does this replace the full production stack?',
        a: 'It complements it as the coordination layer for the wider touring party, keeping the day-to-day aligned across every department and the local crew.',
      },
    ],
    related: [
      { label: 'ChravelApp for tour coordination', to: '/use-cases/music-tour-coordination' },
      { label: 'ChravelApp for teams', to: '/teams' },
      { label: 'All ChravelApp use cases', to: '/use-cases' },
    ],
    cta: {
      heading: 'Keep a big touring operation aligned',
      subtext:
        'Give every department one current schedule and the right access — and broadcast changes to exactly the people who need them.',
      primaryLabel: 'Build a tour workspace',
      primaryTo: '/auth',
      secondaryLabel: 'See ChravelApp for touring',
      secondaryTo: '/use-cases/music-tour-coordination',
    },
  },
  {
    slug: 'sports-club-program-chravelapp-pro',
    title: 'How a Club Sports Program Runs on ChravelApp Pro',
    description:
      'Multiple teams, dozens of staff, and hundreds of families. Here’s how a club sports program uses ChravelApp Pro — role-based access, seat management, and broadcasts — to run the whole organization.',
    h1: 'How a club sports program runs on ChravelApp Pro',
    excerpt:
      'Multiple teams, dozens of coaches, and hundreds of families across a season. Here’s how a club sports program uses ChravelApp Pro — role-based access, seat management, and broadcasts — to run the whole organization.',
    datePublished: '2025-07-08',
    author: BLOG_AUTHOR,
    tags: ['Sports', 'ChravelApp Pro'],
    sections: [
      {
        paragraphs: [
          'One travel team is a coordination challenge. A whole club program — multiple age groups, dozens of coaches, and hundreds of families across a season — is an organization. At that scale, the free, one-team approach stops being enough, and a director needs the controls that come with ChravelApp Pro.',
        ],
      },
      {
        heading: 'Consumer tools don’t scale to a whole program',
        paragraphs: [
          'When a single director is overseeing ten teams, the cracks show fast: who can post to which team, how new coaches get access, how to reach every family at once, and how to keep last season’s parents out of this season’s team. A pile of separate group chats cannot answer any of that.',
        ],
      },
      {
        heading: 'Role-based access keeps everyone in their lane',
        paragraphs: [
          'ChravelApp Pro adds role-based access, so directors, coaches, parents, and players each see what is relevant to them. A coach manages their own team; a director sees across the program; parents get schedules and updates without the staff back-channel. Each team stays its own space while the organization stays connected.',
        ],
        link: {
          label: 'See how ChravelApp works for sports teams',
          to: '/use-cases/sports-team-travel-coordination',
        },
      },
      {
        heading: 'Seats and member management for a real organization',
        paragraphs: [
          'Pro brings admin-controlled seats, invite approvals, and bulk role assignment, so onboarding a new coach or a whole roster of families is a managed process — not a free-for-all of invite links. When the season turns over, access turns over with it.',
        ],
      },
      {
        heading: 'Broadcasts, schedules, and files across every team',
        paragraphs: [
          'A director can Broadcast to the whole program or a single team, keep every squad’s Calendar of practices and games in one system, and store waivers, rosters, and tournament rules as Attachments where the right staff can reach them. The program runs on one platform instead of ten disconnected chats.',
        ],
      },
      {
        paragraphs: [
          'For a club trying to look and operate like a real organization, ChravelApp Pro is the difference between herding group chats and running a program. The schedules, the staff, the families, and the access controls finally live in one place.',
        ],
      },
    ],
    faq: [
      {
        q: 'What’s the difference between ChravelApp and ChravelApp Pro?',
        a: 'Pro adds the controls an organization needs — role-based access, admin-managed seats, invite approvals, and bulk role assignment — on top of the shared calendar, tasks, broadcasts, and files. See ChravelApp for teams for details.',
      },
      {
        q: 'Can each team stay separate while the program stays connected?',
        a: 'Yes. Role-based access keeps each team its own space while a director can see across the whole program and broadcast to everyone at once.',
      },
      {
        q: 'Does it work from youth clubs up to elite programs?',
        a: 'Yes — the same role-based model scales from a youth club to a large travel or elite program with many teams and staff.',
      },
    ],
    related: [
      { label: 'ChravelApp for sports teams', to: '/use-cases/sports-team-travel-coordination' },
      { label: 'ChravelApp for teams', to: '/teams' },
      { label: 'All ChravelApp use cases', to: '/use-cases' },
    ],
    cta: {
      heading: 'Run your whole program on ChravelApp Pro',
      subtext:
        'Role-based access, managed seats, and program-wide broadcasts — so every team, coach, and family is in one organized place.',
      primaryLabel: 'See ChravelApp Pro',
      primaryTo: '/teams',
      secondaryLabel: 'See ChravelApp for sports teams',
      secondaryTo: '/use-cases/sports-team-travel-coordination',
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
