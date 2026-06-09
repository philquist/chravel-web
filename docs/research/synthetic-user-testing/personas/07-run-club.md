# Persona 7: Marcus Oyelaran — Local Run Club Organizer

Code-grounded simulation, 2026-06-09. Platform: 100% mobile (PWA / iOS Capacitor wrapper).
Primary source: `docs/research/synthetic-user-testing/evidence/product-ground-truth.md` (cited as "ground truth").
Key question under test: **is Chravel useful for small recurring communities, or overbuilt?**

---

## A. Profile

- **Name / age:** Marcus Oyelaran, 31–38.
- **Role:** Founder-organizer of "Eastside Pacers," a ~25-person neighborhood run club. Every Saturday, 8:00 AM, same park. Occasional out-of-town race weekend (2–3x/year). Post-run coffee is the real product.
- **Tech comfort:** Moderate. Lives in WhatsApp, Strava, and Instagram. Will install one app if it removes a headache; deletes it if setup exceeds ~3 minutes per week.
- **Planning style:** Lightweight and recurring. The "plan" is one message: "Saturday 8am, Rose Park east lot, 5k + coffee at Verve after. 👍 if in."
- **Pain points today:** WhatsApp attendance polls scroll away; new joiners ask "where exactly do we meet?" every week; photos die in the chat; the group link gets forwarded to strangers.
- **Budget sensitivity:** HIGH. It's a hobby with $0 budget. WhatsApp + Instagram + a free Strava club cost nothing. Any personal subscription needs to solve a weekly pain, not an annual one.
- **Why adopt:** A clean join link with a preview, a pinned meet-up point on a map, an attendance poll that doesn't scroll away, and a shared photo grid — all in one place.
- **Why reject:** Trip-shaped setup every single week, a 3-active-trip cap that a weekly cadence burns in 3 weeks, and a $9.99/mo "travel" subscription to run a free hobby club.

## B. Jobs-to-be-Done

1. When I am announcing Saturday's run on Tuesday night, I want to publish meet point + time + route in under 2 minutes from my phone, so I can get back to my life.
2. When I am guessing turnout, I want a one-tap "in/out" poll with a live count, so I can tell the coffee shop how many are coming.
3. When I am onboarding a newcomer mid-season, I want a forwardable link that shows them where and when before they commit, so I don't repeat directions weekly.
4. When I am wrapping up a run, I want everyone's photos in one shared grid, so the club has a social memory loop that recruits the next newcomer.
5. When I am planning the twice-a-year race-weekend trip, I want real trip tooling (lodging, splits, itinerary), so the heavyweight features earn their keep occasionally.

## C. Full User Journey (16 steps)

Verdict legend: ✅ works · ⚠️ works with friction · ❌ blocked/wrong model.

### 1. Discovery

- **Tried:** Lands on marketing site from a friend's invite link.
- **Code says:** Unauthenticated visitors get the marketing landing with pricing/FAQ/sign-up modal (`src/MarketingApp.tsx`, `src/components/landing/FullPageLanding.tsx`) [OBSERVED — ground truth §3]. Pricing copy: "Start free. Upgrade when your trip gets serious." (`PricingSection.tsx`) [OBSERVED — ground truth §7].
- **Friction:** Everything is framed as _trips_. "Upgrade when your trip gets serious" reads as not-for-me to a guy organizing a free park run. A `UseCasesSection.tsx` exists on the landing page, but the pitch is travel-first. [SIMULATED RISK]
- **Verdict:** ⚠️ — he arrives via invite, not marketing; positioning doesn't speak to him.

### 2. Sign-up / onboarding

- **Tried:** Google OAuth on phone.
- **Code says:** Email+password, Google, Apple; email verification post-signup; invite context preserved through OAuth redirects (`src/pages/AuthPage.tsx`) [OBSERVED — ground truth §3]. Then a **9-screen onboarding carousel** (Welcome → Chat → Calendar → Places → Tasks → Polls → Payments → Concierge → CTA), skippable [OBSERVED — ground truth §3].
- **Friction:** Nine screens for a man who wants one button. He taps skip. Survivable but signals "this is a big app." [SIMULATED RISK]
- **Verdict:** ✅ with eye-roll.

### 3. Creating a "trip" for a Saturday run — does the model fit?

- **Tried:** Create "Saturday Run — Rose Park."
- **Code says:** Required: title (`required aria-required="true"`, "e.g., Summer in Paris" placeholder), **Start Date AND End Date both `required`** (`src/components/CreateTripModal.tsx:495-597`) [OBSERVED]. Timezone selector only appears for Event-type trips (`{tripType === 'event' && ...}` line ~609) and otherwise defaults to device tz [OBSERVED — CreateTripModal.tsx:55]. Location optional with helper "Separate multiple locations with commas (e.g., Paris, Barcelona, Milan)" [OBSERVED].
- **Friction:** A 1-hour Saturday run must be entered as a date-spanning trip: start date = end date = Saturday, **no time-of-day field at trip level** — the 8:00 AM start has to be re-entered later as a calendar event inside the trip. Placeholders ("Summer in Paris", "Paris, Barcelona, Milan") confirm the model wasn't built for him. The Event trip type targets large-attendee conferences and is capped at **3 lifetime on Free** [OBSERVED — ground truth §4, §7], so it's the wrong container for week 4 onward.
- **Verdict:** ⚠️ — the trip model _can_ hold a one-day event (same start/end date), but it's a square peg: trip-level dates without times, travel placeholders, and a second data-entry step for the actual run time.

### 4. Inviting ~25 members with weekly churn

- **Tried:** Share a link in the old WhatsApp group; people trickle in over weeks.
- **Code says:** Shareable `/join/{token}` or short code `/j/{code}`; optional expiration, max uses, require-approval; invitee sees preview (name, dates, destination, cover, member count, "Trip starts in X days") before auth (`src/pages/JoinTrip.tsx`, `InviteModal`) [OBSERVED — ground truth §5]. 7 typed error states incl. `TRIP_ARCHIVED` (`src/types/inviteErrors.ts`) [OBSERVED]. Leave-trip flow exists (`src/components/TripHeader.tsx`, `TripUserManagement.tsx`) [OBSERVED — grep `leaveTrip`].
- **Friction:** The invite flow itself is genuinely good — preview-before-auth is exactly right for a semi-open community. But every invite requires an _account + email verification_ to participate (consumer_guest has **NO access to any resource** per the permission matrix [OBSERVED — ground truth §8]), which is a hard sell for "just show up Saturday" casuals. Worse: invites are **per-trip**, so weekly churn × weekly new trips = re-inviting 25 people to a fresh trip every week. There is no persistent "club" container with standing membership. [SIMULATED RISK grounded in observed per-trip invite model]
- **Known fragility:** "Dashboard member-trip missing after join approval" (trip_members.status drift) — approved member can't see the trip on their dashboard [OBSERVED — ground truth §10.6]. For a casual runner, that's one strike and out.
- **Verdict:** ⚠️ week 1, ❌ as a recurring pattern.

### 5. Meet-up location, route notes, post-run coffee

- **Tried:** Pin the east parking lot, paste route notes, save the coffee shop.
- **Code says:** Places = Google Places search/save; **Basecamp** = trip home base used for distances and concierge context (`src/components/PlacesSection.tsx`, `BasecampSelector.tsx`) [OBSERVED — ground truth §6]. No GPX/Strava/route-file support anywhere in `src/` [OBSERVED — grep `gpx|strava` → no files].
- **Friction:** Basecamp-as-meet-point and a saved coffee-shop place work well. But "route" for a runner means a mapped 5k loop — Chravel offers point pins only; route notes go in the description or chat as plain text. No Strava integration in a runner-dense market. [OBSERVED absence]
- **Verdict:** ⚠️ — meet point ✅, route ❌ (text only), coffee ✅.

### 6. AI Concierge

- **Tried:** "Suggest a 5k loop from Rose Park and a coffee spot after."
- **Code says:** 38 tools / 18 query classes; writes go through a "Save to Trip?" confirm card; **Free = 10 queries/user/trip** (`src/billing/config.ts`) [OBSERVED — ground truth §6, §7]. Limit-copy drift warning: some surfaces say "10 AI queries/month" [OBSERVED — ground truth §7 ⚠️]. Voice realtime is disabled product-wide ("Realtime voice is disabled... dictation only") [OBSERVED — ground truth §10.2].
- **Friction:** Place recommendations genuinely fit (coffee spots). But 10 queries/trip resets every week with a new trip — perversely, the weekly-trip antipattern makes the AI cap painless. He wouldn't pay for it. [SIMULATED RISK]
- **Verdict:** ⚠️ — nice-to-have, not a draw.

### 7. Places / Basecamp (route + meetup point)

- **Tried:** Set Basecamp = Rose Park east lot; save Verve Coffee.
- **Code says:** Map + list views; Basecamp feeds distance calc and concierge context [OBSERVED — ground truth §6].
- **Friction:** Single basecamp per trip is fine for a single-venue run. Re-setting it on every weekly trip clone is the friction — there's no "duplicate last trip" affordance found in `CreateTripModal.tsx` [OBSERVED absence in the create flow read].
- **Verdict:** ✅ within one trip; ⚠️ across weeks.

### 8. Polls (attendance)

- **Tried:** "Who's in Saturday? In / Out / Maybe."
- **Code says:** Options, auto/manual close, anonymous option, change vote, realtime counts, poll-as-task mode (`src/components/poll/`) [OBSERVED — ground truth §6].
- **Friction:** This is the single best feature-fit in the app for this persona. Realtime counts + change-vote covers the flaky-runner pattern. No RSVP-style default template ("In/Out") — he types options manually weekly. [SIMULATED RISK]
- **Verdict:** ✅ — best-in-journey.

### 9. Tasks

- **Tried:** "Bring the flag," "Marcus brings water."
- **Code says:** Multi-assignment, due dates, filters (mine/unassigned/overdue) (`src/components/todo/`) [OBSERVED — ground truth §6].
- **Friction:** Works, but overkill; the club has ~2 tasks a month. Harmless.
- **Verdict:** ✅ (rarely used).

### 10. Payments (rarely)

- **Tried:** Split a $60 post-race brunch once a quarter.
- **Code says:** Equal/custom split, who-owes-whom, settle-up via manual or **Venmo deeplink — no in-app money movement**; Free = **3 splits/trip** [OBSERVED — ground truth §6, §7]. Settlement double-credit race condition open [OBSERVED — ground truth §10.1].
- **Friction:** 3 splits/trip is fine _because_ trips are weekly and splits are rare — the antipattern again subsidizes the cap. Venmo deeplink matches how the club already settles.
- **Verdict:** ✅ for his volume.

### 11. Media (post-run photos — the social loop)

- **Tried:** Everyone dumps Saturday photos.
- **Code says:** Photos/videos/links/files, grid + lightbox, compression, iOS share-sheet ingestion (`src/components/UnifiedMediaHub.tsx`) [OBSERVED — ground truth §6]. Free storage = 500 MB, but **quotas are advisory-only** [OBSERVED — ground truth §7, §10.7]. Regression watch: media tiles "Unable to preview" for chat uploads was recently fixed [OBSERVED — ground truth §10 recently-fixed].
- **Friction:** The grid is the Instagram-replacement hook — but photos are siloed **per weekly trip**. The club's photo history fragments across 52 trips/year, most archived. No cross-trip club gallery. [OBSERVED model + SIMULATED RISK]
- **Verdict:** ⚠️ — great for one Saturday, broken as a club memory.

### 12. Chat

- **Tried:** Banter, "running 5 min late," newcomer questions.
- **Code says:** Stream Chat with threads, reactions, pins, mentions, search [OBSERVED — ground truth §6]. Recently fixed: message loss on websocket reconnect, mobile chat horizontal overflow stealing tab taps [OBSERVED — ground truth §10 recently-fixed; cite as fragility watch].
- **Friction:** It's a competent WhatsApp clone — but the chat _resets every week_ with each new trip. Continuity of community lives in the thread history, and the weekly-trip model amputates it. [SIMULATED RISK grounded in per-trip channel model]
- **Verdict:** ⚠️ — feature ✅, container ❌.

### 13. Notifications

- **Tried:** Wants exactly one ping: "poll posted," maybe "run starting soon."
- **Code says:** In-app dialog with categories, PWA/native push opt-in, preferences — but **no per-trip mute and no batching** (`src/components/home/NotificationsDialog.tsx`) [OBSERVED — ground truth §6, §10.4].
- **Friction:** 25 chatty runners with no per-trip mute means Saturday-morning photo dumps fire 25 pushes. Casual members will kill notifications globally, then miss the poll — the one notification that matters. [SIMULATED RISK on observed gap]
- **Verdict:** ⚠️ trending ❌ for member retention.

### 14. Reviewing the event

- **Tried:** Sunday: glance at who came, photos, settle the coffee tab.
- **Code says:** Profile shows stats and archived trips (`src/pages/ProfilePage.tsx`) [OBSERVED — ground truth §6]; payments has who-owes-whom summary; media grid persists per trip. No attendance history / streaks / "X of last 10 runs" anywhere — polls are per-trip and uncounted across trips. [OBSERVED absence at the model level]
- **Friction:** Run clubs run on streaks and consistency; Chravel has zero longitudinal view.
- **Verdict:** ⚠️.

### 15. RECURRENCE — next Saturday

- **Tried:** "Repeat this every Saturday 8am."
- **Code says:** Recurrence exists — **but only for calendar events inside a trip, not for trips**. `src/features/calendar/components/RecurrenceInput.tsx` is a full RRULE builder ("Supports daily, weekly, monthly patterns with customizable intervals", BYDAY weekday picker) [OBSERVED — RecurrenceInput.tsx:1-80]. `src/types/calendar.ts` carries `recurrence_rule`, `recurrence_exceptions`, `parent_event_id` [OBSERVED — calendar.ts:80-115]. **There is no trip-level recurrence, no trip templates, no trip duplication** [OBSERVED — no such fields/flows in `CreateTripModal.tsx` or `tripService.ts` create path].
- **The workaround that almost works:** create ONE long-running trip ("Eastside Pacers 2026," Jan 1–Dec 31 — start/end dates are required but nothing stops a year-long span) and put a `FREQ=WEEKLY;BYDAY=SA` calendar event inside it. That yields: one invite link forever, one chat with history, one media archive, one basecamp, and a real recurring 8am event. **Nothing in the UI suggests this**; the placeholders, "Trip starts in X days" invite preview, and date framing all push him toward trip-per-Saturday. [OBSERVED capability + SIMULATED RISK that he never discovers it]
- **Verdict:** ⚠️ — the pieces exist; the product never assembles them for him. Discoverability failure, not capability failure.

### 16. Pay-or-upgrade — week 4 wall

- **Tried:** Creates trip #4 on week 4 (the naive trip-per-week path).
- **Code says:** The 3-active-trip cap **is enforced, twice**: client-side (`src/services/tripService.ts:186-191` — counts non-archived trips of the same type, throws `TRIP_LIMIT_REACHED`) and server-side (`supabase/functions/create-trip/index.ts:99-122` — "Free plan supports up to 3 active consumer trips.") [OBSERVED — both files]. Unlike the unenforced event-attendee caps (ground truth §4), this wall is real. Archive flow: archive from trip card ("\"{title}\" will be archived." — `src/components/home/TripGrid.tsx:359`), restore from Archived filter; **restore is also server-gated** — `restoreTrip` surfaces `TRIP_LIMIT_REACHED` from the edge function (`src/services/archiveService.ts:141-158`) [OBSERVED]. Upsell copy at the seam: "Up to 3 active trips (archive to save more)" (`PlusUpsellModal.tsx:160`, `ConsumerBillingSection.tsx:139`); archived-empty-state: "Free users can archive trips to stay within the 3-trip limit — upgrade anytime to restore them!" (`ArchivedTripsSection.tsx:498`) [OBSERVED].
- **Cascading week-4 friction:** archiving last week's run kills its invite link (`TRIP_ARCHIVED` is a typed invite error — `src/types/inviteErrors.ts`) [OBSERVED], so any stale link forwarded around the neighborhood dies. The weekly loop becomes: create trip → re-invite 25 → re-pin basecamp → re-poll → run → archive → repeat. That is a **chore subscription**, and the $9.99/mo Explorer pitch ("unlimited trips") asks him to pay to keep doing the chore faster.
- **Verdict:** ❌ on the naive path; the cap converts this persona to churn, not revenue (see §F).

## D. Feature-by-Feature Findings

| Feature           | Expected goal             | Tried                    | What happened (per code)                                                                                                                              | Friction                                                                                                                       | Bug/UX issue                                                                | Severity                   | Revenue impact                                     | Retention impact | Recommended fix                                                                          |
| ----------------- | ------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| Trip creation     | 2-min weekly event        | Saturday run as trip     | Title + start/end dates required; no time-of-day; travel placeholders [OBSERVED — CreateTripModal.tsx:495-597]                                        | Re-enter run time as calendar event; weekly re-setup                                                                           | UX: trip-shaped model for event-shaped need                                 | High                       | Blocks activation of recurring-community segment   | High             | "Duplicate trip" + lightweight single-day event template                                 |
| Trip recurrence   | "Every Saturday 8am"      | Looked for repeat option | None at trip level; full RRULE builder exists for calendar events only [OBSERVED — RecurrenceInput.tsx]                                               | Capability hidden inside a trip he doesn't know to make long-running                                                           | UX: discoverability failure                                                 | High                       | Loses entire recurring-event vertical              | High             | Surface "recurring meetup" path: long-lived trip + RRULE event, one tap                  |
| 3-active-trip cap | Not hit a wall in month 1 | Trip #4, week 4          | Enforced client+server: "Free plan supports up to 3 active consumer trips." [OBSERVED — tripService.ts:188, create-trip/index.ts:122]                 | Weekly cadence burns cap in 3 weeks                                                                                            | Working as designed; designed wrong for this persona                        | Critical (for persona)     | Reads as churn driver, not upgrade driver here     | Critical         | Don't count single-day/past trips, or push the one-trip-per-club pattern before the wall |
| Archive/restore   | Free up a slot            | Archive last week        | Card menu archive; restore server-gated by same limit; archived invite links return TRIP_ARCHIVED [OBSERVED — archiveService.ts:154, inviteErrors.ts] | Weekly archive chore; dead links circulating                                                                                   | UX: archive kills invite link silently for holders                          | High                       | Stale-link dead ends suppress member growth        | High             | Redirect archived-trip invite to the club's current/active trip                          |
| Invites           | Semi-open join with churn | Forward link in WhatsApp | `/join/{token}`, preview-before-auth, max-uses/expiry/approval, 7 typed errors [OBSERVED — ground truth §5]                                           | Account+verification required to participate (guests have zero access [OBSERVED — §8]); per-trip membership = weekly re-invite | Known bug: approved member's trip missing from dashboard [OBSERVED — §10.6] | Medium (flow) / High (bug) | First-touch failure for invited members            | High             | Persistent club membership; fix trip_members.status drift                                |
| Basecamp/Places   | Meet point + coffee       | Pin lot, save café       | Google Places save + Basecamp distances [OBSERVED — §6]                                                                                               | Re-set weekly under trip-per-week                                                                                              | None                                                                        | Low                        | —                                                  | Medium           | Carries over automatically with duplicate-trip                                           |
| Route             | Share the 5k loop         | Looked for route/GPX     | No GPX/Strava/route support in src [OBSERVED — grep empty]                                                                                            | Routes are plain text                                                                                                          | Gap vs. runner expectations                                                 | Medium                     | Weakens fit vs. free Strava clubs                  | Medium           | Accept a pasted Strava/map link with rich unfurl as "route" place type                   |
| Polls             | One-tap attendance        | In/Out/Maybe poll        | Realtime counts, change vote, auto-close [OBSERVED — §6]                                                                                              | Manually retyped weekly                                                                                                        | None                                                                        | Low                        | Hook feature — protect it                          | High (positive)  | RSVP template + recreate-with-trip                                                       |
| Tasks             | "Bring the flag"          | One task                 | Full assignment system [OBSERVED — §6]                                                                                                                | Overkill, harmless                                                                                                             | None                                                                        | Low                        | —                                                  | Low              | None                                                                                     |
| Payments          | Quarterly brunch split    | One split                | Splits + Venmo deeplink; 3 splits/trip free [OBSERVED — §6/§7]                                                                                        | None at his volume                                                                                                             | Settlement double-credit race open [OBSERVED — §10.1]                       | Medium (bug)               | Low for persona                                    | Medium           | Atomic settlement + idempotency keys (already registered)                                |
| Media             | Club photo loop           | Post-run dump            | Grid/lightbox/compression/share-sheet [OBSERVED — §6]                                                                                                 | History shatters across weekly trips, then archives                                                                            | Storage quota advisory-only [OBSERVED — §10.7]                              | Medium                     | The would-be viral loop is structurally fragmented | High             | Cross-trip (club-level) gallery; long-lived trip mitigates                               |
| Chat              | Replace WhatsApp          | Banter + logistics       | Stream Chat, threads/pins/reactions [OBSERVED — §6]                                                                                                   | History resets per weekly trip                                                                                                 | Reconnect-loss recently fixed — watch [OBSERVED — §10]                      | Medium                     | Can't displace WhatsApp without continuity         | High             | One long-lived trip = one continuous channel                                             |
| Notifications     | One ping that matters     | Default settings         | Categories + push, **no per-trip mute, no batching** [OBSERVED — §6/§10.4]                                                                            | 25-person photo dump = push storm → global mute → missed polls                                                                 | Known gap                                                                   | High                       | Members disable push → engagement collapse         | High             | Per-trip mute + digest batching                                                          |
| AI Concierge      | Coffee/route ideas        | 2 queries                | 38 tools, confirm-card writes; 10 free queries/user/trip [OBSERVED — §6/§7]; copy drift "per month" vs "per trip" [OBSERVED — §7]                     | None at his volume                                                                                                             | Copy drift at limit surfaces                                                | Low                        | Not a payer driver here                            | Low              | Fix limit copy drift                                                                     |

## E. Emotional Reaction

- **Confident:** during invite preview, polls, and photo grid — "this part is genuinely nicer than WhatsApp."
- **Confused:** at trip creation ("why does a Saturday run need an end _date_?... where do I put 8 AM?") and at week 4 ("I have to _archive last Saturday_ to schedule next Saturday?").
- **Annoyed:** by the 9-screen onboarding, travel-flavored copy everywhere ("Summer in Paris"), and re-inviting the same 25 people weekly.
- **Impressed:** by the polls realtime counts, the join-link preview, and — if he ever finds it — the RRULE recurrence builder hidden in the calendar.
- **Would abandon:** YES on the naive path, at week 4, silently. The product never tells him the long-lived-trip pattern exists; the trip cap tells him "you're using this wrong."
- **Would invite others:** Only after a friend shows him the one-trip-per-club workaround. The 25 members he invites face account creation + verification + a notification firehose with no mute — several bounce. [SIMULATED RISK on observed gaps]

## F. Conversion Scores

| Metric            | Score | Justification                                                                                                                                                                                                            |
| ----------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Activation        | 5/10  | First Saturday works end-to-end (trip → invite → poll → photos). Trip-shaped form and 9-screen onboarding shave casualness; nothing breaks.                                                                              |
| Invite acceptance | 5/10  | Preview-before-auth is excellent [OBSERVED — §5], but mandatory accounts for zero-access guests [OBSERVED — §8], the join-approval dashboard bug [OBSERVED — §10.6], and weekly re-invites cap it.                       |
| Day-7 retention   | 4/10  | Week 2 = full re-setup. No duplicate-trip, no recurrence prompt. The org survives on inertia; members survive on whether push noise drove them away.                                                                     |
| Paid conversion   | 1/10  | The week-4 wall asks $9.99/mo to remove friction the product itself manufactures (unlimited _trips_ to fix a missing _repeat_ button). High budget sensitivity + free WhatsApp/Strava alternative ⇒ churn, not checkout. |
| NPS               | −20   | Detractor-leaning passive: praises polls and the join link, leads with "it's a travel app pretending my run club is a vacation."                                                                                         |

- **Would they pay?** Not at $9.99/mo Explorer, and Trip Passes ($39.99/45d) [OBSERVED — §7] are priced for a vacation, not a hobby cadence. **Maybe** $3–5/mo or ~$30/yr for a "Club" container: persistent membership, recurring event, evergreen invite link, club gallery.
- **What creates willingness to pay?** Member-side delight (photos + polls keeping people engaged) plus organizer time saved. He pays when the club _notices_ the tool, never to lift an arbitrary cap.
- **Does the 3-trip limit trigger upgrade or churn?** **Churn.** [SIMULATED RISK — enforcement is OBSERVED (tripService.ts:188, create-trip/index.ts:122); the behavioral outcome needs live test, but the limit fires at week 4 against a need ("repeat") that the paid tier doesn't actually solve — unlimited trips still means weekly re-setup and re-invites. Note PostHog has zero events ever ingested [OBSERVED — ground truth §9], so no funnel data exists to contradict this.]

## G. Top 5 Fixes

1. **Replace trip-per-week dead-ends with a first-class "recurring meetup" path** — wire the existing `RecurrenceInput.tsx` RRULE builder into a create-flow option ("Repeats weekly?") that produces a long-lived trip + recurring calendar event — because Marcus failed at _scheduling week 4_ (3-active-trip wall, `create-trip/index.ts:122`), causing silent week-4 churn of the entire recurring-community segment the capability already 90% supports.
2. **Replace the silent week-4 `TRIP_LIMIT_REACHED` wall with a guided "make this a recurring club" interstitial** (convert the 3 trips into one long-lived trip, migrating members) — because Marcus hit a paywall whose paid remedy (unlimited trips) doesn't fix his actual problem (repetition), causing the cap to read as hostility and convert to deletion instead of Explorer revenue.
3. **Replace dead `TRIP_ARCHIVED` invite links with a redirect to the organizer's designated active/club trip** (extend the existing typed-error recovery CTAs in `src/types/inviteErrors.ts`) — because semi-open communities circulate stale links by design, and every archived week currently turns forwarded links into dead ends, suppressing the member-growth loop that drives all other metrics.
4. **Replace all-or-nothing push with per-trip mute + daily digest batching** (`NotificationsDialog.tsx`; gap documented in NOTIFICATION_AUDIT.md [OBSERVED — ground truth §10.4]) — because a 25-person photo dump triggers a push storm, members globally disable notifications, then miss the attendance poll — the single interaction the club exists to coordinate — collapsing member-side engagement.
5. **Replace per-trip photo silos with a club-level (cross-trip) media gallery** in `UnifiedMediaHub.tsx` — because the post-run photo loop is Chravel's only realistic wedge against "free WhatsApp + Instagram," and fragmenting it across 52 archived trips a year destroys the social memory that would make members, not just the organizer, open the app unprompted.

---

**Key-question answer:** Chravel is **not overbuilt — it's mis-assembled** for this persona. Polls, join links, media, and even RRULE recurrence all exist [OBSERVED]; but the trip-shaped container (required date ranges, per-trip membership/chat/media, 3-active-trip cap, archive-kills-links) forces a weekly chore loop, and the product never reveals the long-lived-trip pattern that would make it genuinely better than WhatsApp. As shipped: useful for the club's 2–3 race weekends a year; abandoned for the other 49 Saturdays.
