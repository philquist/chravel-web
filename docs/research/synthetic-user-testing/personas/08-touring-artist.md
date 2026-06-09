# Persona 8: Dee Okafor — Touring Artist Road Manager

> Code-grounded simulation. No live app run. Every claim labeled [OBSERVED — cite],
> [SIMULATED RISK], or [HYPOTHESIS — needs live test]. Primary source:
> `docs/research/synthetic-user-testing/evidence/product-ground-truth.md` (ground truth, 2026-06-09).

## A. Profile

- **Name / role:** Dee Okafor, road manager (TM duties included) for a mid-level comedy/music act. Current run: 5 cities in 8 days, 12-person traveling party (artist, road/tour manager, FOH engineer, merch lead, 2 security, 2 openers, photographer, assistant, 2 crew), plus a different local promoter contact per city.
- **Age range:** 32–40.
- **Tech comfort:** High. Lives in Master Tour-style tools, Google Sheets, group texts, PDFs in iMessage, shared drives. Phone-first 18 hours a day; laptop only during advancing.
- **Planning style:** Precision under chaos. Advances every city two weeks out; expects everything to change day-of. The day sheet is the contract with the touring party: venue, load-in, soundcheck, doors, set, curfew, hotel, bus call, per-diem note.
- **Pain points:** scattered PDFs that go stale the moment a set time moves; group texts where bus call gets buried under memes; promoters who shouldn't see the artist's hotel; settlement notes living in three email threads.
- **Budget sensitivity:** Low for tools that work — tour budget pays $49–$150/mo without blinking if it kills the PDF-and-text mess. Zero tolerance for tools that *almost* work; failure on show day is unrecoverable.
- **Why adopt:** one app where the whole party sees the current schedule, role-scoped info, instant "bus call moved to 11:15" pushes, and a per-city home base.
- **Why reject:** no trustworthy day sheet; ops data (settlement, per-diem, rooming) that the marketing promises but the product stubs; anything that requires connectivity in a concrete-walled venue.

## B. Jobs-to-be-Done

1. When I am **advancing a 5-city run**, I want to **enter venues, hotels, flights, and call times once per city in one system**, so I can **stop maintaining five parallel PDFs that fork the moment anything changes**.
2. When I am **starting a show day**, I want to **hand every member a per-day sheet (on phone, printable) with load-in → soundcheck → doors → set → curfew → bus call**, so I can **answer "what time and where" zero times**.
3. When I am **told the set time moved 40 minutes**, I want to **push one urgent update that demonstrably reaches all 12 people**, so I can **know nobody misses bus call**.
4. When I am **adding the local promoter for the Denver date**, I want to **scope what they see (venue logistics yes, artist hotel and settlement no)**, so I can **protect the artist's privacy and our deal terms**.
5. When I am **settling with the promoter at midnight**, I want to **log guarantee/backend/merch numbers against that city**, so I can **reconcile the run for management without digging through texts**.

## C. Full User Journey (16 steps)

Format per step: **Tried → What the code says happens → Friction → Verdict.**

### 1. Discovery
- **Tried:** Searches "tour day sheet app alternative", lands on chravelapp.com.
- **Code:** Marketing landing for unauthenticated visitors with pricing/FAQ/sign-up [OBSERVED — ground-truth §3, `src/MarketingApp.tsx`, `FullPageLanding.tsx`]. Pro category "Touring" is described as "Music tours, comedy shows, podcast tours, creator events, and entertainment productions" [OBSERVED — `src/types/proCategories.ts:31-36`]. PDF brand line is literally "ChravelApp Recap — The Group Chat Travel App" [OBSERVED — `src/utils/exportPdfClient.ts:1063-1064`].
- **Friction:** Positioning reads group-vacation-first; Dee has to squint to see a tour tool. [SIMULATED RISK]
- **Verdict:** Curious but skeptical — "this looks like it's for bachelorette parties."

### 2. Sign-up / onboarding
- **Tried:** Email sign-up on desktop during an advancing session.
- **Code:** Email+password / Google / Apple, email verification required; 9-screen skippable onboarding carousel (Welcome → Chat → Calendar → Places → Tasks → Polls → Payments → Concierge → CTA) [OBSERVED — ground-truth §3].
- **Friction:** Carousel is consumer-framed (polls, payments splits); nothing speaks to call times or crews. Skips it. [SIMULATED RISK]
- **Verdict:** Painless mechanically; no signal the product knows her job.

### 3. Pro trip creation (Touring)
- **Tried:** Creates a Pro trip, category Touring, for the 8-day run.
- **Code:** Pro trip creation is gated to Frequent Chraveler+ with 1 free Pro trial on Free [OBSERVED — ground-truth §4]. Touring category exists with roles `['Artist Team', 'Tour Manager', 'Crew', 'VIP', 'Security']` and tabs chat/calendar/ai-chat/media/payments/places/polls/tasks/team [OBSERVED — `src/types/proCategories.ts:29-41`, `src/components/pro/ProTabsConfig.tsx:24-34`]. Trip has a single `location` string and one date range [OBSERVED — `src/types/pro.ts:320-330`, ground-truth §4].
- **Friction:** "Location" forces a choice: type "US Run — 5 cities" or pick one city. There is no city/stop primitive at trip level — a rich `Tour`/`TourTrip` model (city, venue, venueAddress, accommodation w/ confirmation numbers, transportation, per-stop privacy `allowedRoles`) exists in `src/types/pro.ts:18-60` but only demo mock data instantiates it (`src/data/pro-trips/beyonceCowboyCarterTour.ts`, `postMaloneJellyRollTour.ts`); real pro trips get roster/roomAssignments/schedule/settlement/medical/compliance hardcoded EMPTY [OBSERVED — tripConverter.ts:117-130, per prior verification].
- **Verdict:** Creates one trip for the whole run. The demo data promises a tour product; the converter ships a group-trip product.

### 4. Inviting artist team / crew / security with roles
- **Tried:** Invites 12 people + 5 promoters via link, assigns Touring roles.
- **Code:** Invite links with expiration/max-uses/approval toggle, 7 typed error states [OBSERVED — ground-truth §5]. Role assignment and role-based channels exist on Pro (`useRoleAssignments`, `useRoleChannels`, `src/components/pro/admin/RoleManager.tsx`, ground-truth §6). Permission tiers: pro_admin full, pro_editor write (basecamp read-only), pro_viewer read-only [OBSERVED — ground-truth §8].
- **Friction:** Roles drive channels and tab access, but there is **no field-level privacy on calendar events, places, or payments** — a promoter invited as pro_viewer can read the whole calendar including the artist's hotel. The `isPrivate`/`allowedRoles` flags on accommodation/transportation exist only on the mock-only `TourTrip` type [OBSERVED — `src/types/pro.ts:42-59` + tripConverter.ts:117-130, per prior verification]. Workaround is to not invite promoters at all. [SIMULATED RISK — grounded in permission matrix]
- **Verdict:** Crew roles fine; promoter privacy fails. She keeps promoters in email — which re-creates the split-brain she came to kill.

### 5. Adding the 5-city schedule (venues, hotels, flights, ground, M&G, soundcheck, show, settlement notes)
- **Tried:** Builds the run: 5 venues, 5 hotels, 3 flights, daily ground, 2 meet-and-greets, soundchecks, showtimes, settlement notes per city.
- **Code:** Two surfaces exist:
  - **Multi-basecamp (real):** trip basecamps support multiple ordered camps with `start_date`/`end_date`; `resolveCurrentBaseCamp` auto-selects the active camp by date/timezone, with "next upcoming" fallback [OBSERVED — `src/utils/baseCamps.ts:28-54`, `src/hooks/useMultiBaseCamps.ts` via `BasecampsPanel.tsx:26-36`]. So 5 hotels = 5 dated basecamps, and the app's "home base" rolls city to city. Genuinely good fit.
  - **Calendar events (real):** month/itinerary/grid views, place autocomplete, Smart Import for confirmation emails/PDFs [OBSERVED — ground-truth §6; `useCalendarManagement.ts:14` — `ViewMode = 'calendar' | 'itinerary' | 'grid'`].
  - **ProSchedule (not real):** the typed vocabulary `'load-in' | 'sound-check' | 'rehearsal' | 'show' | 'load-out' | 'travel' | 'meeting'` with priority levels exists [OBSERVED — `src/types/pro.ts:128-138`] but greps show **zero UI components render it** — no schedule component exists in `src/components/pro/` (dir listing: only roster/role/channel/room components), and the only instantiations are demo mocks [OBSERVED — grep `'load-in'|ProSchedule` → types + `beyonceCowboyCarterTour.ts:462` only].
  - **Settlement:** `SettlementData` (guarantee, backendPercentage, merch revenue, payout) is typed [OBSERVED — `src/types/pro.ts:154-165`] but hardcoded empty for real trips [OBSERVED — tripConverter.ts:117-130, per prior verification]; ground-truth §6/§10 lists per-diem/compliance/settlement as partially stubbed. Settlement notes end up as plain calendar-event descriptions or chat messages.
- **Friction:** Everything becomes an undifferentiated calendar event. "Load-in 14:00" and "Dinner reso" have identical visual weight; no call-time semantics, no per-event role visibility.
- **Verdict:** Modelable (one trip, 5 dated basecamps, ~40 calendar events) but flattened. The data model that fits her job is unreachable.

### 6. AI Concierge on the road
- **Tried:** "What's our schedule in Denver?" / "Find a 24h diner near tonight's venue."
- **Code:** 38 tools / 18 query classes incl. places, Q&A on trip context, itinerary writes behind a pending-action confirm card; Free = 10 queries/user/trip, Frequent Chraveler+ unlimited [OBSERVED — ground-truth §6–7]. Basecamp feeds concierge distance context [OBSERVED — ground-truth §6]. Voice: realtime path disabled product-wide, dictation-only (`VOICE_PRODUCT_PATH = 'dictation-only'`) [OBSERVED — ground-truth §10.2].
- **Friction:** Useful for "near the venue" lookups since the current basecamp resolves by date. But hands-free voice while driving a sprinter is sold and not delivered. Known design frictions: Action-Plan JSON mandate ignored by model; preference injection on irrelevant queries [OBSERVED — ground-truth §10 design-level].
- **Verdict:** Pleasant surprise for food/logistics lookups; not trusted for schedule truth.

### 7. Places / Basecamp
- **Tried:** Sets the 5 hotels as dated basecamps; saves venues as places.
- **Code:** As §5 — multi-basecamp with date ranges is real, labels render "Hilton Denver · Jun 12–13" [OBSERVED — `baseCamps.ts:56-62`]; per-member personal basecamps also exist [OBSERVED — `BasecampsPanel.tsx:31, 66`]. Directions deep-link from camp coords [OBSERVED — `baseCamps.ts:64-70`].
- **Friction:** Basecamps are trip-visible; the artist's separate hotel can't be hidden from promoter-tier members (personal basecamp partially mitigates for the artist's own view, not for concealment). [SIMULATED RISK]
- **Verdict:** Strongest touring-shaped feature in the product. This is the "5 cities, one trip" answer.

### 8. Polls
- **Tried:** "Day off in Chicago: deep dish or steakhouse?"
- **Code:** Full poll feature with realtime counts, anonymous option [OBSERVED — ground-truth §6]. Poll votes **fail fast when `navigator.onLine === false`** rather than queue [OBSERVED — `src/hooks/useTripPolls.ts:174,386`].
- **Friction:** Minor; polls are a nice-to-have for her.
- **Verdict:** Works; irrelevant to the core job.

### 9. Tasks with team-role ownership
- **Tried:** "Merch count by 23:00 — Merch lead", "Advance Denver — TM", "Wristbands to promoter — Security".
- **Code:** Tasks support multi-assignment to *individuals*, due dates, mine/unassigned/overdue filters [OBSERVED — ground-truth §6]. No role-based assignment ("assign to Security") — assignment is per-user; roles exist in a parallel system (role channels/roster) that tasks don't reference [OBSERVED — `src/components/todo/`, `useTripTasks` per ground-truth; ProTripData task shape has single `assigned_to` string, `src/types/pro.ts:339-347`].
- **Friction:** With 12 people it's workable by tagging individuals; role-ownership ("whoever is on security tonight") doesn't exist.
- **Verdict:** Adequate, not role-aware.

### 10. Per-diem / settlement
- **Tried:** Set $45/day per-diem, log Denver settlement (guarantee $12.5k, 80/20 backend, merch).
- **Code:** `PerDiemData` (rates, advances, deductions, balances) and `SettlementData` fully typed [OBSERVED — `src/types/pro.ts:140-165`] — and hardcoded EMPTY for all real pro trips; ops data exists only in demo mocks [OBSERVED — tripConverter.ts:117-130, per prior verification; ground-truth §6 "per-diem/compliance/settlement partially stubbed"]. Logistics is a Growth-tier ($99/mo) line item in billing config [OBSERVED — ground-truth §7] — a tier whose flagship data layer is stubbed.
- **Friction:** The demo shows per-diem/settlement working (Beyoncé mock); her real trip shows nothing. Falls back to the consumer Payments splitter (equal/custom splits, Venmo deeplink settle-up — no in-app money movement) [OBSERVED — ground-truth §6], which is the wrong abstraction for promoter settlement.
- **Verdict:** **Demo-bait.** This is the single biggest trust break: the sales surface demonstrates features the product can't store.

### 11. Media (content capture)
- **Tried:** Photographer dumps show photos; she pulls clips for the artist's socials.
- **Code:** Photos/videos/links/files, grid + lightbox, compression pipeline, iOS share-sheet ingestion [OBSERVED — ground-truth §6]. Storage quotas advisory-only; bucket not signed-URL enforced [OBSERVED — ground-truth §10.7].
- **Friction:** Unenforced signed URLs on backstage/artist photos is a privacy liability for talent. [OBSERVED — ground-truth §10.7; severity contextual]
- **Verdict:** Functionally good; security posture concerning for celebrity content.

### 12. Chat + role channels
- **Tried:** All-tour channel + Crew channel + Security channel.
- **Code:** Stream Chat with threads/reactions/pins/mentions/search; per-role channels on Pro [OBSERVED — ground-truth §6; `src/components/pro/channels/ChannelChatView.tsx`]. Message loss on websocket reconnect was recently fixed (backfill) — cite as regression-watch [OBSERVED — ground-truth §10 recently-fixed].
- **Friction:** Channels work, but channel membership follows role assignment — and since promoters can't be safely scoped elsewhere, they're not in the trip, so "promoter channel" can't exist.
- **Verdict:** Better than the 12-person iMessage thread. Real value here.

### 13. Notifications + broadcasts (bus call!)
- **Tried:** 07:40 broadcast: "Bus call 11:15, lobby. URGENT."
- **Code:** Broadcasts with priority exist [OBSERVED — ground-truth §6; `src/features/broadcasts/`]. But: role-targeting is **cosmetic — fanout notifies everyone regardless of target**, and delivery tracking is **aggregate-only** (read_count, no per-person "who hasn't seen bus call") [OBSERVED — per persona 3 prior verification; `Broadcast.readBy` is a flat array, `src/types/pro.ts:302-310`]. No scheduled send — immediate-only [OBSERVED — per persona 3 prior verification]. Notification fanout blocks the INSERT transaction at scale; no per-trip mute, no batching [OBSERVED — ground-truth §10.4]. PWA/native push opt-in exists [OBSERVED — ground-truth §6].
- **Friction:** She needs exactly two things — *target by role* and *see who hasn't acknowledged*. Both are absent or fake. Can't pre-schedule tomorrow's 07:00 day-sheet broadcast the night before.
- **Verdict:** A broadcast that can't prove receipt of bus call does not replace "reply ✋ when you see this" in the group text.

### 14. THE DAY SHEET
- **Tried:** Produce Thursday's sheet: venue + load-in 14:00, soundcheck 16:30, doors 19:00, set 21:00, curfew 23:00, hotel, bus call, per-diem note. Phone-viewable, printable for the greenroom door.
- **Code:** Closest in-app artifact: calendar **itinerary view** / selected-date event list (`EventList` renders a flat list for a date, "No events for this date") [OBSERVED — `useCalendarManagement.ts:14`, `EventList.tsx:17`]. Closest export: Trip Export → client PDF supports **calendar date-range filtering** (from/to with same-day allowed) [OBSERVED — `ExportDialog.tsx:37-58`] producing a striped table `Event | Date & Time | Location | Description` (descriptions truncated at 60 chars), sections ordered alphabetically, branded "ChravelApp Recap — The Group Chat Travel App" [OBSERVED — `exportPdfClient.ts:417-438, 350-368, 1062-1064`]. PDF export is gated off Free [OBSERVED — ground-truth §7]. jsPDF carries a known CVE [OBSERVED — ground-truth §10.3]. The actual day-sheet vocabulary (load-in/sound-check/show/load-out with priority) exists in types and demo data only — **no UI path creates or renders it** [OBSERVED — §5 grep evidence].
- **Friction:** A single-day PDF is *technically* producible and is honestly closer than expected — but it's a generic event table: no call-time emphasis, no venue/hotel header block, no contact column, no role filtering, no per-diem/settlement line, truncated notes, and consumer branding on a document handed to a promoter.
- **Verdict:** **No credible day sheet.** A flat "ChravelApp Recap" table loses to her existing Master Tour/Word template on day one. This is the adoption kill shot.

### 15. Mid-tour updates
- **Tried:** Set time slides 40 min in Denver; she edits the calendar event from the venue.
- **Code:** Calendar edits propagate via Supabase realtime to members in the trip; offline reality: `offlineQueue` exists but has **zero call sites — dead code** [OBSERVED — `src/utils/concurrencyUtils.ts:238` + grep `offlineQueue\.` → no matches]; mutations fail fast offline (polls, basecamp updates guard on `navigator.onLine`) [OBSERVED — `useTripPolls.ts:174`, `useTripBasecamp.ts:154`]; `OfflineIndicator` banner exists app-wide [OBSERVED — `src/App.tsx:29,157-177`]. No evidence of offline data caching for calendar — service worker handles app shell/updates, not query data [OBSERVED — `src/utils/serviceWorkerRegistration.ts`; HYPOTHESIS — needs live test for actual cache behavior in a venue basement]. Idempotency keys missing on chat/payments/calendar mutations — retries can duplicate [OBSERVED — ground-truth §10.1]. Anyone already on the old PDF day sheet... doesn't exist here, which is the one upside: single source of truth *if* everyone is online. Exported PDFs, however, go stale silently. [SIMULATED RISK]
- **Verdict:** Online: genuinely better than re-issuing PDFs. In a concrete venue with no signal: edits fail or — worse — retry into duplicates.

### 16. Pay or upgrade
- **Tried:** Run's going okay; she asks management to buy Pro Starter ($49/mo, 50 seats, "small touring acts" fit).
- **Code:** Pro Starter $49/mo, Growth $99/mo (Logistics), Enterprise custom [OBSERVED — ground-truth §7]. **Pro trial CTAs are `mailto:` links (support@/billing@chravelapp.com) — no self-serve Pro checkout** [OBSERVED — ground-truth §7]. On iOS, `APPLE_IAP_ENABLED = false` → "Subscribe on web" [OBSERVED — ground-truth §7].
- **Friction:** She is mid-tour, on a bus, with a tour budget and a company card, and the buy button opens her email client. The features she'd pay $99 for (Logistics: per-diem/settlement) are the stubbed ones.
- **Verdict:** Even a willing buyer can't convert without a sales email round-trip. [OBSERVED — ground-truth §7]

## D. Feature-by-Feature Findings

| Feature | Expected goal | Tried | What happened (per code) | Friction | Bug/UX issue | Severity | Revenue impact | Retention impact | Recommended fix |
|---|---|---|---|---|---|---|---|---|---|
| Multi-city modeling | 5 cities, one source of truth | One Pro trip + 5 dated basecamps | Works: `resolveCurrentBaseCamp` rolls home base by date [OBSERVED — baseCamps.ts:28-54] | City context not reflected anywhere else (calendar/tasks aren't city-grouped) | Gap, not bug | Medium | Positive — real differentiator | Positive | Surface "current stop" as a first-class header; group calendar/itinerary by basecamp date windows |
| Pro Touring schedule (load-in/soundcheck/show) | Enter call times with semantics | Create a 'load-in' item | Impossible — `ProSchedule` type + demo mocks only; no UI creates/renders it [OBSERVED — pro.ts:128-138; grep; tripConverter.ts:117-130 per prior verification] | Everything is a generic calendar event | **Demo/product gap** | Critical | Blocks Pro $49–99 conversion | Severe | Ship a schedule item type-picker on calendar events for Pro Touring trips, persisted to DB |
| Day sheet | Per-day sheet on phone + print | Itinerary view; date-range PDF export | Flat event table, alphabetical sections, "Group Chat Travel App" branding, 60-char note truncation [OBSERVED — exportPdfClient.ts:417-438, 1062-1064; ExportDialog.tsx:37-58] | No call-time hierarchy, contacts, hotel block, role filter | UX failure for vertical | Critical | Kills the wedge use case | Severe | "Day Sheet" export template: one day, venue/hotel header, chronological call times, contacts, notes unabridged, neutral branding |
| Per-diem / settlement | Log money per city | Open logistics | Typed but hardcoded empty on real trips; demo-only [OBSERVED — tripConverter.ts:117-130 per prior verification; ground-truth §6/§10] | Demo shows what product can't do | **Stub sold as feature** | Critical | Growth tier ($99) sells stubbed flagship | Severe — trust break | Either ship minimal per-city settlement CRUD or remove from demo/marketing until real |
| Broadcasts | Bus call reaches everyone, provably | Urgent broadcast | Sends to all; role targeting cosmetic; aggregate read tracking only; immediate-only [OBSERVED — per persona 3 prior verification; pro.ts:302-310] | Can't see who missed bus call; can't schedule 07:00 send | Cosmetic targeting = integrity bug | High | Weakens core Pro pitch | High | Per-recipient read receipts + honest role targeting + scheduled send |
| Privacy vs promoters | Promoter sees venue ops, not artist hotel/settlement | Invite promoter as pro_viewer | Reads entire calendar/places; field-level privacy (`isPrivate`/`allowedRoles`) exists only on mock-only types [OBSERVED — pro.ts:42-59; ground-truth §8] | Must exclude promoters entirely | Missing capability | High | Blocks whole-party adoption | High | Per-item visibility (roles allowlist) on calendar events and basecamps |
| Offline | Read schedule in venue basement | Go offline, open calendar | `offlineQueue` dead code (0 call sites) [OBSERVED — concurrencyUtils.ts:238 + grep]; mutations fail fast [OBSERVED — useTripPolls.ts:174]; data caching unverified [HYPOTHESIS — needs live test] | Day-of reliability unknown → assume worst | Dead code + missing offline reads | High | — | Severe on tour | Persist TanStack Query cache (e.g., persistQueryClient) for calendar/basecamps; wire or delete offlineQueue |
| Tasks | Role-owned tasks | Assign "Security" | Individual (multi) assignment only; roles not referenceable [OBSERVED — ground-truth §6; pro.ts:339-347] | Manual tagging | Gap | Medium | Minor | Medium | Allow assigning to a role; resolves to current role members |
| Chat + role channels | Crew/security channels | Created both | Works (Stream); reconnect-loss recently fixed — watch [OBSERVED — ground-truth §6, §10 recently-fixed] | — | — | Low | Positive | Positive | — |
| Concierge | Near-venue answers | Food near basecamp | Works w/ date-resolved basecamp context; voice = dictation-only despite tier marketing [OBSERVED — ground-truth §6, §10.2] | Voice promise broken | Marketing/product drift | High (trust) | FC tier sells broken marquee | Medium | Relabel voice as dictation until realtime path ships |
| Smart Import | Forward confirmations into calendar | Hotel/flight emails | Gmail OAuth + PDF/ICS ingest with preview/cherry-pick [OBSERVED — ground-truth §6]; replay/idempotency partially tested — retries can duplicate shared data [OBSERVED — ground-truth §10.8] | Duplicate risk on flaky venue Wi-Fi | Known gap | Medium | — | Medium | Idempotency keys on import commit |
| Media | Show content capture | Photo dump | Works; storage advisory-only, no signed-URL enforcement [OBSERVED — ground-truth §6, §10.7] | Artist-content leak surface | Security gap | High (for talent) | — | Medium | Signed URLs on media bucket |
| Pro purchase | Pay $49 now | Click trial CTA | `mailto:` link; no self-serve checkout [OBSERVED — ground-truth §7] | Mid-tour buyer bounced to email | Conversion dead-end | Critical | Direct revenue loss | — | Self-serve Stripe checkout for Pro Starter |

## E. Emotional Reaction

- **Impressed:** dated multi-basecamps that auto-roll the home base city to city ("someone here gets routing"); role channels; Smart Import of confirmations.
- **Confused:** why the demo tour shows load-in schedules, per-diem balances, and settlement sheets that her real trip cannot contain [OBSERVED — tripConverter.ts:117-130 per prior verification]. She will assume she's doing it wrong, burn 30 minutes, then feel deceived.
- **Annoyed:** broadcast can't prove who saw bus call; can't schedule tomorrow's sheet; buy button is an email.
- **Would abandon:** the first time she needs Thursday's day sheet and gets an alphabetized "ChravelApp Recap" table — likely day 2 of the run.
- **Would they run a tour on it?** Not as system of record. Plausibly as the *crew comms + media + routing* layer alongside Master Tour/Sheets — which is exactly the half-adoption that churns in 60 days. [SIMULATED RISK]

## F. Conversion Scores

- **Activation: 5/10** — trip + basecamps + calendar + invites all genuinely work; the Touring category sets correct expectations the ops layer then breaks.
- **Invite: 6/10** — she'd invite the 12-person party (chat/calendar value is real); she will NOT invite promoters (privacy), capping network spread per city.
- **Day-7 retention: 3/10** — day 1–2 of the run exposes the day-sheet and broadcast-receipt gaps under real pressure; PDFs and the group text come back.
- **Paid conversion: 2/10** — willingness exists ($49–99/mo is trivial against a tour budget) but: the features that justify Growth are stubbed, and the purchase path is `mailto:` [OBSERVED — ground-truth §7]. A motivated buyer cannot complete a purchase in-app.
- **NPS: −40** — the floor isn't apathy, it's broken promises: demo shows settlement/per-diem/schedules that real trips can't hold, and "voice concierge" is dictation. Detractor with specifics.
- **Would they pay? What price?** Yes — $49/mo instantly for: real day-sheet export + per-recipient broadcast receipts + role-scoped visibility. $99–149/mo if settlement/per-diem ship for real. Tour managers pay Master Tour hundreds/month; price is not the objection.
- **What creates willingness to pay:** provable message receipt (bus call), a printable per-day sheet, promoter-safe scoping, offline-readable schedule.
- **What blocks adoption mid-tour:** no offline read guarantee [HYPOTHESIS — needs live test], no day sheet, no receipt tracking, mailto purchase.
- **Which CTA works:** none shipped. "Start Free Trial" (consumer `PlusUpsellModal`) mis-targets her; the Pro CTA is email. A "Run your next tour on Chravel — first Pro trip free" with self-serve checkout would land [OBSERVED — ground-truth §4 notes 1 free Pro trial exists on Free; the gating mechanism is there, the funnel isn't].

## G. Top 5 Fixes

1. **Replace the generic "ChravelApp Recap" trip PDF with a per-day "Day Sheet" export template** (venue/hotel header, chronological call times, contacts, full-length notes, neutral branding, single-day default) **because Dee failed at** producing Thursday's day sheet — the single artifact her job runs on — **causing** loss of the entire touring vertical to the PDF + group-text status quo. (Foundation exists: date-range filter in `ExportDialog.tsx:37-58` + jsPDF pipeline in `exportPdfClient.ts`.)
2. **Replace the cosmetic broadcast role-targeting and aggregate read counts with honest role-scoped fanout + per-recipient read receipts + scheduled send** because Dee failed at confirming all 12 people saw "bus call 11:15," causing missed lobby calls and an immediate retreat to "reply ✋" group texts — the core behavior Chravel exists to replace. [OBSERVED — cosmetic targeting per persona 3 prior verification]
3. **Replace the hardcoded-empty ops layer (`tripConverter.ts:117-130`) with minimal real CRUD for ProSchedule items and per-city settlement — or strip them from the demo and Growth-tier marketing** because Dee failed at logging per-diem and Denver settlement that the demo tour visibly contains, causing a "demo-bait" trust break that converts a $99/mo prospect into a public detractor.
4. **Replace all-or-nothing trip visibility with per-item role allowlists on calendar events and basecamps** (the `allowedRoles` shape already typed at `pro.ts:42-59`) because Dee failed at inviting local promoters without exposing the artist's hotel and deal terms, causing per-city collaborators to stay in email and capping both utility and viral spread.
5. **Replace the dead `offlineQueue` (zero call sites, `concurrencyUtils.ts:238`) and fail-fast offline mutations with a persisted query cache for calendar/basecamps + queued writes with idempotency keys** because Dee failed (per code, unverifiable live [HYPOTHESIS — needs live test]) at reading the schedule in a no-signal venue basement, causing show-day reliability doubts that disqualify the product as system of record — and note ground-truth §10.1's missing idempotency keys make naive retry *worse* (duplicate events).

**Bonus (revenue, not product):** Replace the `mailto:` Pro trial CTA with self-serve Stripe checkout for Pro Starter — Dee had budget authority, intent, and a card, and the funnel ended in her email drafts folder [OBSERVED — ground-truth §7].
