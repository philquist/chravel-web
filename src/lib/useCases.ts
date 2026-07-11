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
      'Run every client trip from one polished portal — with Coordinator Access that lets your team manage logistics without ever touching the client’s private chats, photos, or AI history.',
    cardCtaLabel: 'See ChravelApp for travel concierge',
    seo: {
      title: 'Travel Concierge Client Portal | Coordinator Access with ChravelApp',
      description:
        'Deliver a private, white-glove trip portal after every booking. Coordinator Access lets your team manage the itinerary, base camps, tasks, files, and links — with a database-enforced privacy boundary that keeps the client’s chats, photos, and AI Concierge activity off-limits.',
    },
    h1: 'A client-ready trip portal — with coordinator access built in',
    intro:
      'ChravelApp gives travel concierges and advisors one place to run every client trip. Preload the itinerary, attachments, base camps, and recommendations, then invite yourself and your team as Coordinators — a permission scope that grants full logistics control while keeping the client’s private conversations, media, and AI activity off-limits by default.',
    body: [
      'A travel concierge sells peace of mind. The client pays precisely so they don’t have to manage logistics, chase confirmations, organize links, or remember every moving piece. But most concierge teams still deliver the experience through a stack of WhatsApp threads, iMessage, PDFs, Google Drive folders, and forwarded emails. That leaves a gap between the premium service the client bought and the fragmented way the trip actually arrives.',
      'ChravelApp closes that gap. Create a Pro Trip, preload the Calendar (or use Smart Import to pull flights and reservations from confirmation emails and PDFs), upload vouchers as Attachments, pin the hotel and meeting points as Base Camps, save vetted restaurants and activities in the Places tab, and drop pre-trip Tasks. When your client opens the trip, they don’t see a blank app — they see a private command center already planned.',
      'The unlock for concierge companies is **Coordinator Access**. Instead of promoting your planners to full admins (which would grant them access to the client’s private family chat and personal photo uploads), you invite them as Coordinators. Coordinators can manage the shared calendar, tasks, places, files, and links across every client trip — but the client’s private conversations, camera-roll uploads, and AI Concierge questions stay locked to the client. The boundary is enforced at the database with Postgres row-level security, not just hidden in the UI.',
      'This matters because your clients are trusting you with their trip, not their family group chat. A Coordinator-scoped planner can push a schedule update, add a reservation, swap a driver, upload a new voucher, and answer a logistics question — without ever being able to open the family thread where the client and their spouse are debating dinner. That’s the guarantee that lets luxury clients say yes without hesitation.',
      'ChravelApp also helps you standardize operations. Build a repeatable shape for honeymoons, family vacations, ski weeks, milestone birthdays, retreats, and VIP travel — every trip carrying the same Calendar, Tasks, Attachments, Base Camps, Places, and shared Media surfaces. Your whole team can run client trips at the same standard, with the right access, without living in one person’s inbox.',
    ],
    featureMap: [
      {
        pain: 'Planners need access to logistics — not private client chats',
        solution: 'Coordinator Access (logistics-only scope)',
      },
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
      { pain: 'Clients need to complete items before they travel', solution: 'Tasks' },
      {
        pain: 'Clients want vetted recommendations on the ground',
        solution: 'Places (curated locations & links)',
      },
      { pain: 'Splitting costs or collecting balances', solution: 'Payments' },
      {
        pain: 'Families want to keep the memories afterward',
        solution: 'Shared Media album (client-controlled)',
      },
    ],
    workflow: {
      heading: 'Set up a client trip in minutes',
      steps: [
        'Create the Pro Trip on your company’s Pro account and preload the Calendar — or use Smart Import to pull flights and reservations from confirmation emails, PDFs, and links.',
        'Upload receipts, vouchers, and reservations as Attachments, pin the hotel and key meeting points as Base Camps, and drop vetted restaurants, tours, and activities in Places.',
        'Invite the client and their party as **Full Members** — they get their own private chat, private AI Concierge, and personal media.',
        'Invite yourself and your planners as **Coordinators** — you manage the shared itinerary, tasks, files, and links; the client’s private surfaces stay off-limits.',
        'Send Broadcasts as plans change; the client opens a trip that is already planned and always current.',
      ],
    },
    faq: [
      {
        q: 'Can your team read our private chats or see our personal photos?',
        a: 'No. Coordinators can manage the shared itinerary, tasks, places, files, and links — but the client’s private chat, personal media uploads, and AI Concierge activity are off-limits. The boundary is enforced by Postgres row-level security in the database, not just hidden in the UI.',
      },
      {
        q: 'What can a Coordinator actually do?',
        a: 'Manage the shared Calendar, Tasks, Places, Files, and Links; send Broadcasts; add or update reservations, base camps, and vendors. Coordinators cannot manage roles, invite other admins, read private conversations, view private media, or see the client’s AI Concierge history.',
      },
      {
        q: 'Who owns the trip if we stop working with your company?',
        a: 'The client. The Pro Trip is a persistent workspace tied to trip membership. You can be removed as Coordinator at any time; the client keeps the trip, the media, the reservations, and every message they’ve ever sent.',
      },
      {
        q: 'Do I need to build a custom app or white-label ChravelApp?',
        a: 'No. Every client-ready trip is created in minutes inside ChravelApp — no custom development, no white-label setup, no separate portal to maintain.',
      },
      {
        q: 'Can my whole team manage client trips?',
        a: 'Yes. ChravelApp Pro gives your company Pro Trip creation and Coordinator seats. Multiple planners can be invited as Coordinators on each client trip with the right permissions.',
      },
      {
        q: 'Do clients need to pay for their own account?',
        a: 'No. When your concierge company owns the Pro Trip, invited clients and their party join as Full Members at no extra cost. See the "Who pays?" section below.',
      },
      {
        q: 'How do clients get their itinerary if it lives in my email?',
        a: 'Use Smart Import to pull schedules and reservations from confirmation emails, PDFs, and links directly into the trip Calendar and Attachments.',
      },
      {
        q: 'Does it work on iPhone and Android?',
        a: 'Yes — ChravelApp runs on the web and as an installable app on iOS and Android, so every client is covered regardless of device.',
      },
    ],
    cta: {
      heading: 'Deliver a more premium trip after every booking',
      subtext:
        'Create a client-ready Pro Trip, invite your team as Coordinators, and hand the client one private workspace that already feels planned.',
      primaryLabel: 'Create a client trip',
      primaryTo: '/auth',
      secondaryLabel: 'ChravelApp for concierge teams',
      secondaryTo: '/teams',
    },
  },

  {
    slug: 'wedding-guest-coordination-app',
    status: 'published',
    cardTitle: 'Weddings',
    cardTagline:
      'Run the whole weekend as a Pro Trip — separate channels for each family, wedding party, and vendors; a shared photo album; and a coordinator seat for your planner.',
    cardCtaLabel: 'See ChravelApp for weddings',
    seo: {
      title: 'Wedding Planning App with Coordinator Access | ChravelApp',
      description:
        'ChravelApp runs a wedding weekend as one Pro Trip: separate channels for the bride’s family, groom’s family, wedding party, and vendors; a shared photo album; and a Coordinator seat that lets your planner manage logistics without reading your family chats.',
    },
    h1: 'Run the whole wedding weekend — with channels, a shared photo album, and coordinator access for your planner',
    intro:
      'A wedding isn’t one event anymore — it’s a weekend with a dozen side conversations. ChravelApp lets the couple run the whole thing as a Pro Trip: separate channels for the bride’s family, groom’s family, wedding party, and vendors; a shared calendar, tasks, and photo album; and a Coordinator seat for the wedding planner so they can manage the logistics without living inside your family threads.',
    body: [
      'Weddings are full weekends now: welcome drinks, the rehearsal dinner, ceremony call times, shuttle pickups, the afterparty, brunch, dress codes, hotel blocks, family obligations, and a dozen side chats. The couple has a website, the planner has a timeline, the wedding party has a group chat, the caterer has an email thread, and guests still ask where to be, what to wear, and when to arrive.',
      'ChravelApp runs the weekend as one **Pro Trip** with role-based channels — so you can have a bride-family channel, a groom-family channel, a wedding-party channel, a vendors channel (caterer, florist, photographer, DJ), and the full-guests channel — all inside the same hub. Every audience gets the messages that matter to them and none of the ones that don’t. Add every event to the Calendar, pin the hotel and venues as Base Camps, upload the schedule and lookbooks as Attachments, save nearby spots in Places, and assign wedding-party Tasks.',
      'The shared photo album is one of the strongest reasons to run a wedding on ChravelApp. Guests take hundreds of photos across the weekend, but they get trapped across iPhones, Android phones, and private camera rolls. ChravelApp’s shared Media album gives everyone one place to upload, on any device — so the couple sees candid moments without waiting on the photographer, and nobody has to text pictures one at a time.',
      'The Pro Trip layer unlocks a real answer to the classic wedding question: *how does our planner help without reading everything?* Invite the planner as a **Coordinator** and they can manage the shared Calendar, Tasks, Places, Files, and Links across the whole weekend — but they can’t open the bride-family channel, they can’t see the couple’s private photo uploads, and they can’t read the AI Concierge questions the couple is asking about their own honeymoon. The boundary is enforced by Postgres row-level security in the database, not just hidden in the UI.',
      'For destination weddings it earns its keep twice over — guests aren’t just attending a ceremony, they’re traveling, switching hotels, and following a multi-day itinerary. Replace scattered WhatsApp threads, lost links, and repeated questions with one shared wedding hub. Everyone gets the schedule, the dress code, the locations, and the photo album in their pocket.',
    ],
    featureMap: [
      {
        pain: 'Bride’s side, groom’s side, and vendors need separate threads',
        solution: 'Pro Trip channels per audience',
      },
      {
        pain: 'Your planner needs logistics access without reading family chats',
        solution: 'Coordinator Access',
      },
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
      { pain: 'Ceremony, reception, and hotel are scattered', solution: 'Base Camps + Places' },
      { pain: 'Guest photos trapped across phones', solution: 'Shared Media album' },
      {
        pain: 'Destination guests juggling travel',
        solution: 'Calendar + Attachments + locations',
      },
    ],
    workflow: {
      heading: 'Set up your wedding weekend',
      steps: [
        'Create the wedding as a **Pro Trip** so you get role-based channels.',
        'Add channels for the bride’s family, groom’s family, wedding party, vendors, and full guest list — each audience gets only what they need.',
        'Add every event — welcome drinks, ceremony, reception, brunch — to the Calendar; pin the hotel and venues as Base Camps and drop nearby spots in Places.',
        'Upload the schedule, menus, and dress-code lookbooks as Attachments, and assign wedding-party Tasks.',
        'Invite your wedding planner as a **Coordinator** — they can manage the itinerary, tasks, places, files, and links without reading your family channels or seeing your private photos.',
        'Turn on the shared Media album so every guest uploads photos to one place, on any device.',
      ],
    },
    faq: [
      {
        q: 'Can our wedding planner see our family chat?',
        a: 'Not unless you explicitly invite them into that channel. As a Coordinator they can manage the shared calendar, tasks, places, files, and links, but they cannot read the bride-family or groom-family channel, cannot view the couple’s private photos, and cannot see the AI Concierge questions the couple is asking. The boundary is enforced at the database.',
      },
      {
        q: 'Do we really need the Pro plan for a wedding?',
        a: 'For anything more than a small ceremony, yes — Pro Trips are what unlock role-based channels (bride’s family / groom’s family / wedding party / vendors), Coordinator access for your planner, and larger guest capacity.',
      },
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
        a: 'Yes — that’s exactly what channels are for. The wedding party gets its own channel; the full guest list gets its own; families get theirs.',
      },
      {
        q: 'Is this a replacement for our wedding website?',
        a: 'It complements it. The website tells the story publicly; ChravelApp is the live, in-pocket hub for schedule changes, locations, dress code, tasks, channels, and the shared photo album.',
      },
      {
        q: 'Does it work for destination weddings?',
        a: 'Especially well — guests get the multi-day itinerary, hotel Base Camps, pinned locations, and travel documents in one place.',
      },
    ],
    cta: {
      heading: 'Make the whole wedding weekend easier',
      subtext:
        'Run the weekend as a Pro Trip with channels per audience, a shared photo album, and a coordinator seat for your planner.',
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
  {
    slug: 'conference-event-management-app',
    status: 'published',
    cardTitle: 'Conferences & Events',
    cardTagline:
      'Run conferences, summits, and large events — agenda, speakers, attendees, broadcasts, and logistics in one place.',
    cardCtaLabel: 'See ChravelApp for events',
    seo: {
      title: 'Conference & Event Management App | Agenda, Attendees & Logistics | ChravelApp',
      description:
        'ChravelApp runs conferences and events from one workspace — a live agenda and speaker lineup, attendee broadcasts, session polls, staff tasks, venue maps, and shared media.',
    },
    h1: 'A conference and event management app for organizers, staff, and attendees',
    intro:
      'Conferences live or die on logistics — a shifting agenda, a dozen speakers, staff in every room, and hundreds of attendees who need to know where to be. ChravelApp events give organizers one place to run it all, and one place attendees actually check.',
    body: [
      'A printed agenda goes stale by the first session. Speakers email last-minute slide and time changes, staff coordinate over radio and text, and attendees screenshot the schedule and then miss the room swap. For multi-day, multi-track events, every one of those gaps multiplies.',
      'ChravelApp turns the event into one shared workspace. Build the schedule as a live Agenda with the speaker Lineup on a shared Calendar. When a session moves rooms or a speaker swaps slots, you update it once and every attendee sees the current version — no reprinted handout and no “ignore the old PDF.”',
      'Reaching people becomes one action instead of five. A single Broadcast goes to every attendee — or just staff, or just speakers — so “keynote starts in ten minutes in Hall B” actually lands. Polls handle session feedback, breakout choices, and lunch counts without a separate survey tool.',
      'The production team gets its own space. Tasks track load-in, AV checks, registration, and teardown; Attachments hold the run-of-show, floor plans, and vendor contracts; and Base Camps pin the venue, hotel block, and green room. Role-based access keeps staff and speaker coordination separate from the attendee-facing view.',
      'Attendees get the agenda, maps, and updates in their pocket — and after the last session, a shared Media album collects photos from across the event in one place. The result is a conference that runs on a single source of truth instead of a binder, a printout, and three group chats.',
    ],
    featureMap: [
      { pain: 'Printed agendas go stale by day one', solution: 'Live Agenda + Calendar' },
      { pain: 'Speakers and sessions change last-minute', solution: 'Lineup + Broadcasts' },
      {
        pain: 'Attendees miss room and time changes',
        solution: 'Broadcasts + centralized schedule',
      },
      { pain: 'Staff coordinate over text and radio', solution: 'Tasks + role-based access' },
      { pain: 'Run-of-show, floor plans, and contracts scattered', solution: 'Attachments' },
      { pain: 'Session feedback and breakout choices', solution: 'Polls' },
      { pain: 'Event photos scattered across phones', solution: 'Shared Media album' },
    ],
    workflow: {
      heading: 'Set up your event',
      steps: [
        'Create an event and build the Agenda and speaker Lineup on the Calendar.',
        'Upload the run-of-show, floor plans, and vendor docs as Attachments.',
        'Add the venue and hotel as Base Camps, and assign staff Tasks for load-in and teardown.',
        'Invite attendees and staff with the right roles, then Broadcast updates as the day moves.',
        'Use Polls for feedback and breakouts, and collect event photos in a shared Media album.',
      ],
    },
    faq: [
      {
        q: 'Is this for attendees, organizers, or both?',
        a: 'Both. Organizers and staff get a private space for the run-of-show and tasks; attendees get the live agenda, maps, and updates.',
      },
      {
        q: 'Can we control who sees what?',
        a: 'Yes. Role-based access keeps staff and speaker coordination separate from the attendee-facing agenda.',
      },
      {
        q: 'How do attendees hear about changes?',
        a: 'A single Broadcast reaches everyone — or a specific group — instantly, so a room change does not get missed.',
      },
      {
        q: 'Does it handle multi-day, multi-track agendas?',
        a: 'Yes. The Agenda and Calendar handle multi-day schedules and parallel tracks, kept current in one place.',
      },
      {
        q: 'What happens after the event?',
        a: 'A shared Media album collects photos from across the event, and the agenda and files stay available for follow-up.',
      },
    ],
    cta: {
      heading: 'Run your next event from one workspace',
      subtext:
        'Put the agenda, speakers, staff tasks, attendee broadcasts, and venue logistics in one place — and invite everyone with the right access.',
      primaryLabel: 'Create an event',
      primaryTo: '/auth',
      secondaryLabel: 'ChravelApp for teams',
      secondaryTo: '/teams',
    },
  },
  {
    slug: 'local-clubs-meetups',
    status: 'published',
    cardTitle: 'Local Clubs & Meetups',
    cardTagline:
      'Keep run clubs, trivia nights, rec leagues, and golf groups organized — a recurring schedule, RSVPs, pinned locations, and a shared album in one place. No flight required.',
    cardCtaLabel: 'See ChravelApp for local groups',
    seo: {
      title: 'Local Club & Meetup Organizer App | Run Recurring Groups with ChravelApp',
      description:
        'ChravelApp keeps local clubs and recurring meetups organized — run clubs, trivia nights, rec leagues, and golf groups get a shared schedule, RSVPs, pinned locations, broadcasts, and a photo album in one place. No travel required.',
    },
    h1: 'The app for local clubs and recurring meetups',
    intro:
      'You don’t have to get on a plane to use ChravelApp. Run clubs, trivia nights, rec leagues, and golf groups get one home base for the schedule, RSVPs, locations, and photos — so the regulars always know where to be.',
    body: [
      'Not every group that needs organizing is going somewhere. Run clubs, trivia nights, flag-football and other rec leagues, golf groups, book clubs, and neighborhood meetups all run on a weekly rhythm — and most of them live in a single overstuffed group text. Plans get buried under replies, the location changes and half the crew misses it, and the one person who keeps it all straight ends up answering the same questions every week.',
      'ChravelApp gives a local group the same home base a big trip gets. Put the weekly run, the next trivia night, or this weekend’s tee time on the Calendar so the schedule is somewhere other than a chat thread. Pin the bar, the course, or the start line as Base Camps so nobody shows up to the wrong spot, and save nearby coffee shops or after-spots in Explorer. When something changes, one Broadcast reaches everyone at once instead of a flurry of texts.',
      'Headcounts get easier too. Use Polls to see who’s in for this week, and the Calendar to keep the standing schedule visible so people can plan around it. When the group splits a tab, chips in for a field rental, or collects league dues, Payments handles it without a side spreadsheet or a chain of payment-app requests.',
      'The shared Media album is the part that keeps a local group fun. Race-day photos, trivia-win celebrations, and golf-trip pictures usually get trapped across everyone’s phones. ChravelApp gives the group one album everyone uploads to, on any device — so the memories pile up in one place instead of scattering into private camera rolls.',
      'As regulars come and go, new members just join the group and immediately see the schedule, the spots, and the routine — no “catch me up on how this works” text required. The pitch is simple: you don’t need a trip or a plane ticket to get value out of ChravelApp. Any local crew that meets on a schedule can run on it.',
    ],
    featureMap: [
      { pain: 'A new group text for every week’s plan', solution: 'One shared club home base' },
      { pain: 'RSVPs lost in a wall of replies', solution: 'Polls + Calendar' },
      {
        pain: 'People show up to the wrong bar, course, or start line',
        solution: 'Base Camps + pinned locations',
      },
      { pain: 'Last-minute changes get missed', solution: 'Broadcasts' },
      { pain: 'Photos trapped across everyone’s phones', solution: 'Shared Media album' },
      { pain: 'New members don’t know the routine', solution: 'Members + shared details' },
      { pain: 'Splitting the tab or collecting league dues', solution: 'Payments' },
    ],
    workflow: {
      heading: 'Get your local crew organized',
      steps: [
        'Create the group and invite the regulars.',
        'Add your recurring meetups — the weekly run, trivia night, tee times — to the Calendar.',
        'Pin the bar, course, or start line as Base Camps and drop nearby spots in Explorer.',
        'Use Polls for weekly headcounts and Broadcasts when the plan changes.',
        'Turn on the shared Media album so everyone’s photos land in one place.',
      ],
    },
    faq: [
      {
        q: 'Do we have to be traveling to use ChravelApp?',
        a: 'No. ChravelApp works just as well for local, recurring groups — a run club, trivia night, rec league, or golf group — as it does for trips. No flight required.',
      },
      {
        q: 'Can we set up a recurring weekly schedule?',
        a: 'Yes. Add recurring events to the Calendar so the standing schedule stays visible, with Google Calendar sync so it shows up next to everyone’s other plans.',
      },
      {
        q: 'How do members RSVP each week?',
        a: 'Use Polls for a quick weekly headcount, and the Calendar so everyone can see what’s coming up and plan around it.',
      },
      {
        q: 'Can we collect league dues or split a tab?',
        a: 'Yes. Payments lets the group collect dues, chip in for a rental, or split a tab without a spreadsheet or a chain of payment-app requests.',
      },
      {
        q: 'Does it work on iPhone and Android?',
        a: 'Yes — ChravelApp runs on the web and as an installable app on iOS and Android, so every member is covered regardless of device.',
      },
    ],
    cta: {
      heading: 'Keep your local crew in one place',
      subtext:
        'Put the schedule, RSVPs, locations, and a shared photo album in one home base — then invite the regulars. No trip required.',
      primaryLabel: 'Create a group',
      primaryTo: '/auth',
      secondaryLabel: 'Browse all use cases',
      secondaryTo: '/use-cases',
    },
  },
  {
    slug: 'church-group-trip-coordination',
    status: 'published',
    cardTitle: 'Faith & Church Groups',
    cardTagline:
      'Coordinate mission trips, retreats, youth group, and choir tours — rosters, permission forms, schedules, payments, broadcasts, and a shared album in one place.',
    cardCtaLabel: 'See ChravelApp for faith groups',
    seo: {
      title: 'Church Group & Mission Trip Coordination App | ChravelApp',
      description:
        'ChravelApp keeps church groups, mission trips, retreats, and youth ministry organized — rosters and roles, permission forms, schedules, payments, broadcasts, and a shared photo album in one place.',
    },
    h1: 'The coordination app for church groups and mission trips',
    intro:
      'From the weekly youth group to the summer mission trip, ChravelApp gives ministry leaders one organized place for rosters, forms, schedules, payments, and updates — so leaders lead instead of chasing texts.',
    body: [
      'Ministry runs on logistics. Mission trips, retreats, youth group, choir and worship tours, and volunteer days all mean managing a roster, collecting forms, building a schedule, gathering trip fees, and keeping parents in the loop. Most groups still do it with sign-up sheets, paper permission slips, a phone tree, and a stack of parent group texts — which means details get lost and the leader spends more time chasing people than leading them.',
      'ChravelApp pulls all of it into one trip workspace. Add leaders, chaperones, and participants as Members with the right roles, and collect permission, medical, and waiver forms as Attachments so they live in one place instead of a folder on someone’s desk. Assign packing lists and prep responsibilities as Tasks, build the itinerary on the Calendar, and pin the lodging and host site as Base Camps so everyone knows where to be.',
      'Money and communication get simpler. Use Payments to collect trip fees and deposits without passing around cash or a sign-up sheet, and send one Broadcast to reach every participant — or every parent — at once. Instead of answering the same questions across a dozen threads, the leader points everyone to the trip, where the schedule, location, and details already live.',
      'It also helps parents feel secure. Broadcasts keep families informed about timing and changes, roles control who sees what, and the shared itinerary and Base Camps make it clear where the group is and where they’re staying. After the trip, the shared Media album gives everyone one place to upload photos, so the memories from a retreat or mission trip don’t scatter across phones.',
      'The same setup works at every scale — from a one-off weekend retreat to a recurring youth program. With ChravelApp Pro, admin-controlled seats and role-based access let multiple leaders run trips across the congregation with the right permissions. The pitch is simple: lead the trip, not the group chat.',
    ],
    featureMap: [
      { pain: 'Sign-up sheets and paper permission slips', solution: 'Attachments + Tasks' },
      {
        pain: 'Trip details scattered across the bulletin and group texts',
        solution: 'One shared trip workspace',
      },
      { pain: 'Collecting trip fees and deposits', solution: 'Payments' },
      {
        pain: 'Parents and chaperones out of the loop',
        solution: 'Broadcasts + Members/roles',
      },
      { pain: 'Itinerary and lodging unclear', solution: 'Calendar + Base Camps' },
      { pain: 'Trip photos trapped across phones', solution: 'Shared Media album' },
      {
        pain: 'The same questions from every family',
        solution: 'Centralized details + Broadcasts',
      },
    ],
    workflow: {
      heading: 'Set up a mission trip or retreat',
      steps: [
        'Create the trip and add leaders, chaperones, and participants with the right roles.',
        'Upload permission, medical, and waiver forms as Attachments and assign packing and prep Tasks.',
        'Build the itinerary on the Calendar and pin lodging and host sites as Base Camps.',
        'Collect trip fees and deposits with Payments.',
        'Broadcast updates to everyone, and turn on the shared Media album for the trip.',
      ],
    },
    faq: [
      {
        q: 'Does it work for weekly youth group and one-off retreats, not just big trips?',
        a: 'Yes. ChravelApp works for the weekly youth group, a weekend retreat, or a multi-day mission trip — the same workspace scales up or down.',
      },
      {
        q: 'Can we collect permission forms and trip fees?',
        a: 'Yes. Gather permission, medical, and waiver forms as Attachments, and use Payments to collect trip fees and deposits without cash or a sign-up sheet.',
      },
      {
        q: 'Can parents stay informed without being on every chat?',
        a: 'Yes. Broadcasts push updates to every family at once, and roles control who sees what, so parents stay informed without living in the group chat.',
      },
      {
        q: 'Can multiple leaders manage trips with the right access?',
        a: 'Yes. ChravelApp Pro adds admin-controlled seats and role-based access, so multiple leaders can run trips across the congregation with the right permissions.',
      },
      {
        q: 'Does it work on iPhone and Android?',
        a: 'Yes — ChravelApp runs on the web and as an installable app on iOS and Android, so every leader, chaperone, and family is covered regardless of device.',
      },
    ],
    cta: {
      heading: 'Lead the trip, not the group chat',
      subtext:
        'Put rosters, forms, the schedule, trip-fee collection, and a shared album in one workspace — then invite leaders, chaperones, and families.',
      primaryLabel: 'Create a trip',
      primaryTo: '/auth',
      secondaryLabel: 'ChravelApp for teams',
      secondaryTo: '/teams',
    },
  },
  {
    slug: 'business-travel-coordination',
    status: 'published',
    cardTitle: 'Business Travel & Company Retreats',
    cardTagline:
      'Coworkers on the same work trip get a private workspace for the itinerary, decks, receipts, tasks, and dinners — without leaking into personal group texts.',
    cardCtaLabel: 'See ChravelApp for business travel',
    seo: {
      title: 'Business Travel & Company Retreat Coordination App | ChravelApp',
      description:
        'ChravelApp keeps business trips and company retreats organized — a private team workspace for the meeting itinerary, decks and receipts, per-person prep tasks, base camps, and dinner splits, without polluting personal texts.',
    },
    h1: 'The coordination app for business trips and company retreats',
    intro:
      'When coworkers travel together for client meetings, offsites, or a company retreat, the details usually end up in personal iMessage threads, forwarded emails, and Slack DMs. ChravelApp gives the team one private trip workspace instead — contained, organized, and separate from personal life.',
    body: [
      'Business travel is coordination-heavy: a shared itinerary, several presentations, client dinners, hotel confirmations, cabs to split, and a running list of who is doing what before each meeting. Most teams still glue it together with personal group texts, forwarded confirmation emails, Slack threads that scroll past, and a shared Drive folder nobody remembers to open. The result is a work trip that lives inside everyone’s personal messages — right next to their family chats and dinner plans.',
      'ChravelApp gives the team a trip workspace that stays contained. Create a trip for the client visit, offsite, or company retreat, invite the coworkers going, and keep the entire conversation there — not in iMessage or WhatsApp. Chat, Broadcasts, Calendar, Tasks, Attachments, Base Camps, Explorer, Payments, and Media all live inside the trip, so the moment the trip is over, work does not keep bleeding into personal texts.',
      'The meeting itinerary lives on the shared Calendar — client meetings, internal syncs, work dinners, flight blocks, and travel windows so nobody misses a slot. Attachments hold the pitch deck, the signed NDA, expense receipts, hotel confirmations, and any handouts, so the deck is not stuck in one person’s email. Assign Tasks per person: "Steve, finalize the deck by Wednesday", "Jennifer, confirm the 7pm reservation with the client", "Priya, print handouts before the airport". Everyone sees who owns what.',
      'Base Camps solve one of the most annoying parts of a business trip. Pin the client office, conference venue, or offsite lodge as the shared Base Camp so everyone knows where to be. Each coworker can also set a personal Base Camp for their own hotel, since teammates often stay in different places on the same trip. Save the client’s office, the recommended dinner spot, and coffee near the venue in Explorer, and split the group cab or team dinner with Payments instead of chasing Venmo requests after you land.',
      'Company retreats are the same idea at a bigger scale. Build the offsite agenda on the Calendar, upload the schedule and vendor contracts as Attachments, pin the retreat venue as the Base Camp, and turn on the shared Media album so every photo from the trip lands in one place instead of scattering across phones. Broadcasts push agenda changes or "meet in the lobby at 8" updates to the whole team without another Slack ping.',
      'With ChravelApp Pro, admin-controlled seats and role-based access let ops leads, EAs, or people teams run business trips for a group with the right permissions. The pitch is simple: keep work travel organized, keep the team aligned, and keep work chats out of your personal messages.',
    ],
    featureMap: [
      {
        pain: 'Work trip details leaking into personal iMessage and WhatsApp',
        solution: 'A private trip workspace with contained Chat and Broadcasts',
      },
      {
        pain: 'Decks, contracts, and confirmations scattered across email and Drive',
        solution: 'Attachments in one place on the trip',
      },
      {
        pain: 'Meeting itinerary, work dinners, and flight blocks unclear',
        solution: 'Shared Calendar',
      },
      {
        pain: 'Team split across different hotels on the same trip',
        solution: 'Shared Base Camp for the venue + personal Base Camp per person',
      },
      {
        pain: 'Prep work falling through the cracks the night before',
        solution: 'Per-person Tasks (deck, reservation, print outs, client follow-ups)',
      },
      {
        pain: 'Chasing Venmo for the team dinner and shared cabs',
        solution: 'Payments to split and settle without a spreadsheet',
      },
      {
        pain: 'Retreat photos trapped across everyone’s phones',
        solution: 'Shared Media album for the trip',
      },
    ],
    workflow: {
      heading: 'Set up a business trip or company retreat',
      steps: [
        'Create the trip, invite the coworkers going, and set the client office or retreat venue as the shared Base Camp.',
        'Build the meeting and dinner schedule on the Calendar, and assign per-person prep Tasks (deck, reservations, handouts).',
        'Upload decks, contracts, and confirmations as Attachments so the whole team has them offline.',
        'Save client sites and dinner spots in Explorer, and use Payments to split cabs and team dinners.',
        'Send trip updates via Broadcasts, and turn on the shared Media album for retreats and offsites.',
      ],
    },
    faq: [
      {
        q: 'Does this keep work trips out of my personal iMessage or WhatsApp?',
        a: 'Yes. All chat, updates, files, and tasks for the trip live inside the trip workspace, so work travel does not sit next to your family and friend threads on your phone.',
      },
      {
        q: 'Can we track expense receipts and split team dinners or cabs?',
        a: 'Yes. Upload receipts and confirmations as Attachments, and use Payments to split the team dinner, group cab, or any shared cost without chasing Venmo requests after the trip.',
      },
      {
        q: 'Does it work for company retreats and offsites, not just client trips?',
        a: 'Yes. The same workspace scales from a two-person client visit to a full-company retreat — agenda on the Calendar, venue as the Base Camp, decks and vendor contracts as Attachments, and a shared photo album for the whole team.',
      },
      {
        q: 'Can more than one person manage the trip?',
        a: 'Yes. ChravelApp Pro adds admin-controlled seats and role-based access, so ops leads, EAs, and people teams can run business trips with the right permissions across the company.',
      },
      {
        q: 'Does it work on iPhone and Android?',
        a: 'Yes — ChravelApp runs on the web and as an installable app on iOS and Android, so every coworker is covered regardless of device.',
      },
    ],
    cta: {
      heading: 'Keep work trips organized — and out of your personal texts',
      subtext:
        'Put the meeting itinerary, decks, receipts, per-person tasks, and dinner splits in one private workspace — then invite the coworkers going.',
      primaryLabel: 'Create a trip',
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
