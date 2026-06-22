// Use-case marketing cluster content.
//
// Source of truth for the /use-cases hub and each /use-cases/:slug page. Pages are
// data-driven: add a fully-authored `UseCaseDetail` here to publish a new page (then
// add its path to public/sitemap.xml). Card-only `UseCaseSummary` entries render on
// the hub as part of the cluster without their own page yet ("coming soon"), or link
// out to an existing page via `href` (avoids duplicate URLs).
//
// Copy claims only real ChravelApp features. Authoritative feature vocabulary (see
// TripExportModal + trip tabs): Chat, Calendar (+ Google Calendar sync), Tasks,
// Attachments (files/receipts), Media (shared photos), Explorer (Places & Explore
// Links), Base Camps, Broadcasts, Payments, Polls, Members/roles, AI Concierge,
// Smart Import.

export type UseCaseStatus = 'published' | 'coming-soon';

export interface UseCaseFaq {
  q: string;
  a: string;
}

/** A pain → ChravelApp solution pairing rendered in the feature map. */
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
    cardCtaLabel: 'See ChravelApp for travel concierge',
    seo: {
      title: 'Travel Concierge Client Portal | Organize Client Trips with ChravelApp',
      description:
        'ChravelApp gives travel concierges and advisors a client-ready trip portal — preload the itinerary, attachments, reservations, base camps, tasks, and recommendations, then invite the client into one organized workspace.',
    },
    h1: 'A client-ready trip portal for travel concierge companies',
    intro:
      'Travel concierges and advisors sell peace of mind. ChravelApp lets you deliver it after the booking — one organized trip workspace your clients open instead of digging through email, WhatsApp, and Google Drive.',
    body: [
      'A travel concierge sells peace of mind. The client pays precisely so they do not have to manage logistics, chase details, organize links, or remember every moving piece of the trip. But once the booking is confirmed, many concierge teams still deliver the experience through a messy stack of WhatsApp messages, iMessage threads, PDFs, Google Drive folders, email chains, and screenshots. That leaves a gap between the premium service the client bought and the fragmented way the trip actually arrives.',
      'ChravelApp closes that gap with one place to organize the entire client experience after purchase. Create a trip, add the family or client group, and preload the itinerary onto the Calendar — or let Smart Import pull flights and reservations straight from confirmation emails and PDFs. Upload vouchers and receipts as Attachments, pin the hotel and meeting points as Base Camps, save vetted restaurants and activities in Explorer, and assign Tasks for passports, payments, or arrival details. When the client joins, they are not staring at a blank app. They enter a trip that already feels planned.',
      'This matters because you are really selling confidence. When a client opens ChravelApp and sees their flights, hotels, reservations, documents, and reminders in one place, your company instantly looks more buttoned-up. Instead of asking "where was that confirmation?" or "which hotel are we meeting at?", they check the trip. And instead of sending the same update five different ways, you send one Broadcast to the whole group.',
      'ChravelApp also helps you standardize operations. Build a repeatable shape for honeymoons, family vacations, ski weeks, milestone birthdays, retreats, and VIP travel — every trip carrying the same Calendar, Tasks, Attachments, Base Camp, Explorer, and shared Media. With ChravelApp Pro, admin-controlled seats and role-based access let multiple planners run client trips with the right permissions, so the experience stays consistent across your whole team instead of living in one person’s inbox.',
      'The pitch is simple: after your client pays, do not send them another messy folder — send them a private trip command center. ChravelApp lets a travel concierge look more professional, cut client confusion, and deliver a more premium post-booking experience without building a custom app or standing up a white-label portal.',
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
        q: 'Do I need to build a custom app or white-label ChravelApp?',
        a: 'No. You create a client-ready trip in minutes inside ChravelApp — no custom development and no white-label setup required.',
      },
      {
        q: 'Can my whole team manage client trips?',
        a: 'Yes. ChravelApp Pro adds admin-controlled seats and role-based access, so multiple planners can run client trips with the right permissions.',
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
        a: 'Yes — ChravelApp runs on the web and as an installable app on iOS and Android, so every client is covered regardless of device.',
      },
    ],
    cta: {
      heading: 'Deliver a more premium trip after every booking',
      subtext:
        'Create a client-ready ChravelApp trip, preload the details, and invite the family into one organized workspace.',
      primaryLabel: 'Create a client trip',
      primaryTo: '/auth',
      secondaryLabel: 'ChravelApp for teams',
      secondaryTo: '/teams',
    },
  },
  {
    slug: 'wedding-guest-coordination-app',
    status: 'published',
    cardTitle: 'Weddings',
    cardTagline:
      'Keep guests, the wedding party, photos, dress codes, and weekend events in one shared hub.',
    cardCtaLabel: 'See ChravelApp for weddings',
    seo: {
      title: 'Wedding Guest Coordination App | Plan the Whole Weekend with ChravelApp',
      description:
        'ChravelApp keeps wedding guests, the wedding party, schedules, dress codes, locations, and a shared photo album in one place — so everyone knows where to be, what to wear, and where to upload photos.',
    },
    h1: 'The wedding guest coordination app for the whole weekend',
    intro:
      'A wedding isn’t one event anymore — it’s a weekend. ChravelApp gives the couple, the wedding party, and every guest one shared place for the schedule, dress codes, locations, tasks, and photos.',
    body: [
      'Weddings are full weekends now: welcome drinks, the rehearsal dinner, ceremony call times, shuttle pickups, the afterparty, brunch, dress codes, hotel blocks, family obligations, and a dozen side chats. The couple has a website, the planner has a timeline, the wedding party has a group chat, and guests still ask where to be, what to wear, and when to arrive.',
      'ChravelApp turns the weekend into one shared hub. Add every event to the Calendar, pin the hotel as a Base Camp alongside the ceremony and reception venues, and upload the schedule, menus, and dress-code references as Attachments. Save the rehearsal spot, the brunch place, and nearby coffee in Explorer, and create Tasks for the wedding party. Instead of digging through an old flyer or scrolling a thread, everyone checks one place.',
      'The shared photo album is one of the strongest reasons to run a wedding on ChravelApp. Guests take hundreds of photos across the weekend, but they get trapped across iPhones, Android phones, and private camera rolls. ChravelApp’s shared Media album gives everyone one place to upload, on any device — so the couple sees candid moments without waiting on the photographer, and nobody has to text pictures one at a time.',
      'It works for the wedding party too. The couple, planner, and party can use Tasks for attire deadlines, speeches, welcome-bag prep, and day-of responsibilities, and a single Broadcast to push an update when a time or location changes. For destination weddings it earns its keep twice over — guests aren’t just attending a ceremony, they’re traveling, switching hotels, and following a multi-day itinerary.',
      'Replace scattered WhatsApp threads, lost links, and repeated questions with one shared wedding hub. Everyone gets the schedule, the dress code, the locations, and the photo album in their pocket.',
    ],
    featureMap: [
      { pain: 'Guests lose track of weekend events', solution: 'Shared Calendar' },
      {
        pain: '“What’s the dress code?” asked on repeat',
        solution: 'Attachments (lookbooks & notes)',
      },
      {
        pain: 'Guests ask the same logistics questions',
        solution: 'Broadcasts + centralized details',
      },
      { pain: 'The wedding party needs accountability', solution: 'Tasks' },
      { pain: 'Ceremony, reception, and hotel are scattered', solution: 'Base Camps + Explorer' },
      { pain: 'Guest photos trapped across phones', solution: 'Shared Media album' },
      {
        pain: 'Destination guests juggling travel',
        solution: 'Calendar + Attachments + locations',
      },
    ],
    workflow: {
      heading: 'Set up your wedding weekend',
      steps: [
        'Create the trip and invite guests — or just the wedding party.',
        'Add every event — welcome drinks, ceremony, reception, brunch — to the Calendar.',
        'Pin the hotel as a Base Camp, add the ceremony and reception venues, and drop nearby spots in Explorer.',
        'Upload the schedule and dress-code or lookbook references as Attachments, and assign wedding-party Tasks.',
        'Turn on the shared Media album so every guest uploads photos to one place, on any device.',
      ],
    },
    faq: [
      {
        q: 'Can guests upload photos from both iPhone and Android?',
        a: 'Yes. The shared Media album works on the web and on iOS and Android, so every guest uploads to the same place regardless of device.',
      },
      {
        q: 'Do guests need the app to see the schedule?',
        a: 'ChravelApp runs on the web and as an installable app on iOS and Android. Guests open the trip and see the latest schedule, locations, and dress code.',
      },
      {
        q: 'Can we keep the wedding party separate from all guests?',
        a: 'Yes. You control who is on the trip and their roles, so the wedding party can coordinate tasks separately from the full guest list.',
      },
      {
        q: 'Is this a replacement for our wedding website?',
        a: 'It complements it. The website tells the story; ChravelApp is the live, in-pocket hub for schedule changes, locations, dress code, tasks, and the shared photo album.',
      },
      {
        q: 'Does it work for destination weddings?',
        a: 'Especially well — guests get the multi-day itinerary, hotel Base Camps, pinned locations, and travel documents in one place.',
      },
    ],
    cta: {
      heading: 'Make the whole wedding weekend easier',
      subtext:
        'Put the schedule, locations, dress codes, tasks, and a shared photo album in one wedding hub — then invite the guests.',
      primaryLabel: 'Create a wedding trip',
      primaryTo: '/auth',
      secondaryLabel: 'Browse all use cases',
      secondaryTo: '/use-cases',
    },
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
    slug: 'family-organization-app',
    status: 'published',
    cardTitle: 'Families & Parents',
    cardTagline:
      'Keep kids, parents, schedules, photos, chores, and game-day logistics in one shared family hub.',
    cardCtaLabel: 'See ChravelApp for families',
    seo: {
      title: 'Family Organization App | One Hub for Schedules, Photos & Chores | ChravelApp',
      description:
        'ChravelApp is a shared family hub — keep the family calendar, kids’ game photos, tickets and forms, chores, dinner polls, and team carpools in one place, trip or no trip.',
    },
    h1: 'The family hub app for parents, kids, and everyone’s schedules',
    intro:
      'Family life runs on logistics — practices, pickups, games, forms, chores, and “what’s for dinner?” ChravelApp pulls it into one shared family hub the whole household can see, whether you’re traveling or just getting through the week.',
    body: [
      'Family logistics live everywhere: a parent’s text thread, a paper flyer on the fridge, two different calendars, screenshots of the game schedule, a coach’s group chat, and a permission slip nobody can find. With the details spread that thin, someone always misses a pickup or forgets the form.',
      'ChravelApp gives the household one shared space. Put practices, games, recitals, and appointments on a shared Calendar everyone can see. Drop tickets, permission slips, rosters, and school forms into Attachments so they are never lost. Keep a running Tasks list for chores and to-dos, and settle the small stuff — who owes who for tickets, gas, or gear — with Payments.',
      'It is great for memories, too. Kids can post photos straight from the soccer game into the family chat and the shared Media album, so grandparents and the parent who could not make it see them in real time — not weeks later, buried in one person’s camera roll.',
      'You do not have to be going anywhere. A “trip” in ChravelApp can simply be your family, or this season — it works just as well for a Saturday of local games as for a week away. Settle dinner with a quick Poll (“pizza, sushi, or Chinese?”) and keep everyone on the same page without a single group-text avalanche.',
      'And it scales beyond one household. Put all the parents of a kids’ football or soccer team in one ChravelApp trip and the carpool sorts itself out — who is picking up whom, who is bringing snacks or water, who has the canopy this week — with a shared Calendar, Tasks, and a single Broadcast instead of a forty-message thread no one can follow.',
      'One shared hub for the whole family — schedules, photos, forms, chores, money, and game-day logistics — so the people you care about spend less time chasing details and more time together.',
    ],
    featureMap: [
      { pain: 'Practices, games, and pickups scattered across texts', solution: 'Shared Calendar' },
      { pain: 'Kids’ game photos stuck on one phone', solution: 'Shared Media album + chat' },
      { pain: 'Tickets, forms, and permission slips get lost', solution: 'Attachments' },
      { pain: '“Who owes who” for tickets, gas, and gear', solution: 'Payments' },
      { pain: 'Chores and to-dos slip through the cracks', solution: 'Tasks' },
      { pain: '“What’s for dinner?” every night', solution: 'Polls' },
      {
        pain: 'Coordinating carpools across team families',
        solution: 'One shared trip + Broadcasts',
      },
    ],
    workflow: {
      heading: 'Set up your family hub',
      steps: [
        'Create a trip for your family — or for this season’s team.',
        'Add practices, games, and appointments to the shared Calendar.',
        'Drop tickets, forms, and rosters into Attachments, and start a Tasks list for chores.',
        'Turn on the shared Media album so kids can post game photos to the family chat.',
        'Use Polls for dinner and plans, and Payments to settle who owes who.',
        'For a team, invite the other parents and Broadcast carpool and snack duty in one place.',
      ],
    },
    faq: [
      {
        q: 'Do we need to be taking a trip to use this?',
        a: 'No. A “trip” can simply be your family or your team’s season — it works the same for a local Saturday of games as for travel.',
      },
      {
        q: 'Can kids and grandparents join?',
        a: 'Yes. You invite whoever should be in the loop and control their access, so kids can post photos and grandparents can follow along.',
      },
      {
        q: 'How does carpool coordination work?',
        a: 'Put all the team parents in one trip, then use the Calendar, Tasks, and a single Broadcast for pickups, snacks, and gear — no more forty-message group text.',
      },
      {
        q: 'Does it work on iPhone and Android?',
        a: 'Yes — ChravelApp runs on the web and as an installable app on iOS and Android, so every parent and kid is covered.',
      },
      {
        q: 'Can we settle money between family members?',
        a: 'Yes. Payments lets you track who owes who for tickets, gas, and gear without a side spreadsheet.',
      },
    ],
    cta: {
      heading: 'Make your family’s logistics one shared place',
      subtext:
        'Put the calendar, photos, forms, chores, dinner polls, and carpools in one family hub — and invite everyone who needs to be in the loop.',
      primaryLabel: 'Create a family hub',
      primaryTo: '/auth',
      secondaryLabel: 'Browse all use cases',
      secondaryTo: '/use-cases',
    },
  },
  {
    slug: 'sports-team-travel-coordination',
    status: 'published',
    cardTitle: 'Sports Teams',
    cardTagline:
      'Coordinate players, parents, coaches, hotels, games, and travel updates without chasing group chats.',
    cardCtaLabel: 'See ChravelApp for sports teams',
    seo: {
      title: 'Sports Team Travel Coordination App | Organize Teams with ChravelApp',
      description:
        'ChravelApp helps coaches, team managers, parents, and players coordinate sports travel — schedules, hotels, locations, forms, tasks, broadcasts, and a shared photo album in one workspace.',
    },
    h1: 'A sports team travel app for coaches, players, parents, and managers',
    intro:
      'Sports travel breaks down when the details live in too many places. ChravelApp gives the whole travel party — coaches, players, parents, and managers — one shared workspace for schedules, hotels, locations, and updates.',
    body: [
      'The coach has the schedule, the team parent has the hotel block, players are in one chat and parents in another, the bracket changes, the bus time moves, someone misses the team meal, someone can’t find the gym. For AAU, high school, college, and club programs, the load falls on a few people who repeat the same updates over and over.',
      'ChravelApp gives the team one workspace. Put game times, practices, meals, bus departures, and check-ins on the Calendar, mark the team hotel as the Base Camp, and save gyms, stadiums, airports, and meeting points in Explorer. Upload waivers, rooming lists, packing lists, and tournament rules as Attachments. When something changes, send one Broadcast instead of texting every subgroup.',
      'Tasks keep everyone accountable: players bring uniforms, submit forms, pack specific gear, and arrive by a set time; parents confirm travel, pickups, and meal preferences. It all lives in the trip instead of one parent’s spreadsheet or buried in a thread, and role-based access keeps staff, players, and parents in the right lanes.',
      'ChravelApp isn’t trying to replace your stats or film platform — it’s the travel coordination layer for the trips where communication, movement, and timing matter: tournament weekends, road games, showcases, retreats, and championship runs. Afterward, the shared Media album gives the team one place for everyone’s photos.',
      'Keep the whole team on the same page — schedules, hotels, locations, forms, tasks, and updates in one place, without chasing everyone across text chains.',
    ],
    featureMap: [
      { pain: 'Schedule changes cause confusion', solution: 'Broadcasts + Calendar' },
      { pain: 'Parents and players are in different chats', solution: 'One shared workspace' },
      { pain: 'Hotel, gym, and meal info gets buried', solution: 'Base Camps + Explorer' },
      { pain: 'Waivers and forms are hard to track', solution: 'Attachments' },
      { pain: 'Players forget gear or deadlines', solution: 'Tasks' },
      { pain: 'Travel costs to collect', solution: 'Payments' },
      { pain: 'Tournament photos scattered', solution: 'Shared Media album' },
    ],
    workflow: {
      heading: 'Set up a team trip',
      steps: [
        'Create the trip and add coaches, managers, players, and parents.',
        'Put games, practices, meals, and bus times on the Calendar.',
        'Mark the team hotel as a Base Camp and pin gyms, stadiums, and airports in Explorer.',
        'Upload waivers, rooming lists, and packing lists as Attachments, then assign player and parent Tasks.',
        'Broadcast changes to everyone at once, and collect travel costs with Payments.',
      ],
    },
    faq: [
      {
        q: 'Can parents and players have different access?',
        a: 'Yes. ChravelApp supports role-based access, so staff, players, and parents each see what is relevant to them.',
      },
      {
        q: 'Is this only for elite or pro teams?',
        a: 'No — it works for AAU, youth, high school, college, club, and pro programs. Anywhere a travel party needs schedules, locations, and updates in one place.',
      },
      {
        q: 'How do last-minute changes reach everyone?',
        a: 'Send a single Broadcast; it reaches the whole trip instead of relying on separate group texts.',
      },
      {
        q: 'Can we collect money for travel?',
        a: 'Yes. Payments let you split costs and collect balances without a separate spreadsheet.',
      },
      {
        q: 'Does it work on every phone?',
        a: 'Yes — the web plus installable iOS and Android apps, so every player and parent is covered.',
      },
    ],
    cta: {
      heading: 'Keep the whole team on the same page',
      subtext:
        'Coordinate schedules, hotels, locations, forms, tasks, and updates for your next team trip.',
      primaryLabel: 'Plan a team trip',
      primaryTo: '/auth',
      secondaryLabel: 'ChravelApp for teams',
      secondaryTo: '/teams',
    },
  },
  {
    slug: 'music-tour-coordination',
    status: 'published',
    cardTitle: 'Touring Artists & Crews',
    cardTagline:
      'Keep artists, crew, security, content teams, and management aligned city by city.',
    cardCtaLabel: 'See ChravelApp for touring',
    seo: {
      title: 'Music Tour Coordination App | Align Artists, Crew & Teams with ChravelApp',
      description:
        'ChravelApp keeps touring artists, managers, crew, security, and content teams aligned — daily schedules, hotels, venues, call times, tasks, files, and a shared photo album, city by city.',
    },
    h1: 'A tour coordination app for artists, crew, security, and management',
    intro:
      'Touring gets chaotic when every department runs on a different thread. ChravelApp gives the whole touring party one shared place for the day-to-day logistics that keep the run moving.',
    body: [
      'The tour manager has the day sheet, security has the movement details, the photographer got a call time from someone else, the artist team has a private chat, management is in email, and the promoter sent a PDF. The result is predictable: repeated questions, missed details, and people solving logistics that should already be clear.',
      'ChravelApp gives touring teams one place for each city — the schedule, hotel, venue, call times, meal times, content windows, after-show plans, and key locations. Put the day on the Calendar, pin the hotel and venue as Base Camps, drop parking and nearby spots in Explorer, and keep advance sheets and contracts as Attachments. Smart Import can pull schedules and reservations from confirmation emails and PDFs instead of forwarding screenshots.',
      'It is especially useful for the wider party — managers, assistants, security, photographers, videographers, stylists, label reps, and VIP guests. They do not all need a full pro tour-management stack; they need accurate logistics: where to be, when, and what they are responsible for. Tasks cover that, and a single Broadcast pushes a change to everyone who needs it.',
      'ChravelApp also handles content and memories. The photographer, videographer, and team can upload to one shared Media album instead of chasing assets across AirDrop, iCloud links, Android devices, and Dropbox. For developing artists, independent teams, promo runs, and festival weekends, it makes the operation feel buttoned-up without a heavyweight enterprise system.',
      'Keep the touring party aligned city by city — schedules, hotels, venues, call times, tasks, files, and shared content in one workspace.',
    ],
    featureMap: [
      { pain: 'Departments operate in separate chats', solution: 'One shared tour workspace' },
      { pain: 'Day sheets get screenshotted and go stale', solution: 'Calendar + Attachments' },
      { pain: 'Security, content, and management miss updates', solution: 'Broadcasts' },
      { pain: 'Hotels, venues, and parking get buried', solution: 'Base Camps + Explorer' },
      { pain: 'Advance sheets arrive as emails and PDFs', solution: 'Smart Import + Attachments' },
      { pain: 'Responsibilities fall through the cracks', solution: 'Tasks' },
      { pain: 'Photos and content assets are scattered', solution: 'Shared Media album' },
    ],
    workflow: {
      heading: 'Set up a city on tour',
      steps: [
        'Create the trip and add the artist, crew, security, content team, and management.',
        'Put each city’s schedule and call times on the Calendar — or pull them in with Smart Import.',
        'Pin the hotel and venue as Base Camps, and add parking and nearby spots in Explorer.',
        'Keep advance sheets and contracts as Attachments and assign Tasks by role.',
        'Broadcast changes to the right people, and collect content in one shared Media album.',
      ],
    },
    faq: [
      {
        q: 'Does ChravelApp replace pro tour-management software?',
        a: 'It is a lightweight coordination layer, not a replacement for a full production stack. It shines at keeping the wider party — crew, security, content, guests — aligned on daily logistics.',
      },
      {
        q: 'Can different roles see different things?',
        a: 'Yes. Role-based access keeps the core crew, content team, and guests in the right lanes.',
      },
      {
        q: 'How do call-time changes reach everyone?',
        a: 'One Broadcast reaches the whole trip, instead of forwarding updates across separate threads.',
      },
      {
        q: 'Where do photos and video go?',
        a: 'Into one shared Media album, so the team is not chasing assets across AirDrop, iCloud, and Dropbox.',
      },
      {
        q: 'Can we import the advance or day sheet?',
        a: 'Yes. Smart Import pulls schedules and reservations from confirmation emails, PDFs, and links.',
      },
    ],
    cta: {
      heading: 'Keep the touring party aligned, city by city',
      subtext:
        'Organize schedules, hotels, venues, call times, tasks, files, and shared content for your next run.',
      primaryLabel: 'Build a tour workspace',
      primaryTo: '/auth',
      secondaryLabel: 'ChravelApp for teams',
      secondaryTo: '/teams',
    },
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
