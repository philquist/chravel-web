# Persona 4: Mackenzie "Mack" Rivera — Bachelorette Party Planning Lead

> Code-grounded simulation (no live app run). Every finding labeled
> `[OBSERVED — cite]`, `[SIMULATED RISK]`, or `[HYPOTHESIS — needs live test]` per
> `docs/research/synthetic-user-testing/evidence/product-ground-truth.md` (the "ground-truth brief").

---

## A. Profile

- **Name / Age:** Mackenzie "Mack" Rivera, 29. Maid of honor for her college roommate's wedding.
- **Tech comfort:** High consumer-app fluency — lives in iMessage, Instagram, Venmo, Partiful,
  Google Docs. Zero patience for B2B-feeling software. **iPhone only.**
- **Planning style:** Decisive but consensus-performing. She'll pick the Airbnb herself, but she
  runs polls so nobody can complain later. Keeps a Notes-app master list and a "NASH BASH 🤠" group text.
- **Pain points with her current stack:** group text decisions evaporate after 40 messages; the
  Google Doc nobody opens; chasing 9 Venmo requests one at a time; "wait, what time is the party bus?"
  asked six times.
- **Budget sensitivity:** Medium. Will drop $400 on a party bus without blinking; viscerally resents
  a recurring subscription for a one-weekend event. A one-time pass is plausible; $9.99/mo is not.
- **Why she'd adopt:** one link that gives 9 women the schedule, the polls, the costs, and the photos —
  without her re-typing anything.
- **Why she'd reject:** if her guests have to create accounts to see anything; if "payments" doesn't
  actually move money; if the free tier blocks the exact things a bachelorette generates in bulk
  (photos, cost splits); if it feels like project-management software instead of a party.

## B. Jobs-to-be-Done

1. When I'm **kicking off planning 3 months out**, I want to **send one link to the group text that
   instantly shows everyone the plan**, so I can **stop being the human FAQ**.
2. When **the group can't decide on dinner/activities/outfits**, I want to **run a quick vote with a
   deadline**, so I can **lock decisions without 60 unread messages**.
3. When I've **fronted the Airbnb, party bus, dinners, and decorations**, I want to **split 10+ costs
   and see who still owes what**, so I can **get paid back without awkward one-by-one Venmo chasing**.
4. When **we're in Nashville**, I want **the day's schedule and addresses one tap away for everyone**,
   so I can **drink a margarita instead of dispatching Ubers**.
5. When **the weekend ends**, I want **every photo in one place**, so I can **make the bride a recap
   and post the Instagram dump**.

## C. Full User Journey — Nashville Bachelorette, 10 women, 3 nights

### 1. Discovery / landing first impression

- **Tried:** Opens chravelapp.com on Safari after seeing a TikTok.
- **What code says happens:** Unauthenticated visitors get the marketing landing
  (`src/MarketingApp.tsx`, `src/components/landing/FullPageLanding.tsx`) with pricing, FAQ, sign-up
  modal; pricing copy: "Start free. Upgrade when your trip gets serious." `[OBSERVED — ground-truth §3, §7]`.
  A "Replaces" grid explicitly name-checks **Venmo** among the apps Chravel replaces
  `[OBSERVED — src/components/conversion/ReplacesGridData.ts:103]`.
- **Friction:** The "replaces Venmo" claim sets an expectation the product cannot meet — settle-up is
  a Venmo deeplink, "no in-app money movement" `[OBSERVED — ground-truth §6 Payments, §10 design frictions]`.
- **Verdict:** Interested but primed for disappointment on payments. ✅ proceeds.

### 2. Sign-up / onboarding

- **Tried:** Google OAuth on iPhone Safari.
- **What code says happens:** Email/Google/Apple auth, email verification post-signup, then a
  skippable **9-screen onboarding carousel** (Welcome → Chat → Calendar → Places → Tasks → Polls →
  Payments → Concierge → CTA) `[OBSERVED — ground-truth §3]`.
- **Friction:** `[SIMULATED RISK]` Nine screens before any value is a lot for someone with a group
  text open in another app; she skips at screen 2. Email verification adds a context switch.
- **Verdict:** Tolerable. ✅

### 3. Trip creation (Nashville weekend)

- **Tried:** "NASH BASH 🤠", consumer trip, 3 nights, Nashville, cover photo of the bride.
- **What code says happens:** `CreateTripModal.tsx` — title (unique per user), start/end dates,
  timezone required; optional location, description, cover photo with crop modal
  `[OBSERVED — ground-truth §4]`. Free tier allows 3 active trips `[OBSERVED — src/utils/featureTiers.ts:66]`.
- **Friction:** None material; cover-photo crop is the kind of touch that makes it feel like hers.
- **Verdict:** ✅ Best moment of setup. Feels premium.

### 4. Inviting 8 guests (the make-or-break step)

- **Tried:** Taps Invite, shares the `/join/{token}` link into the group text.
- **What code says happens:**
  - Link generation with optional expiration/max-uses/require-approval; share via copy/SMS/email/native
    share `[OBSERVED — ground-truth §5]`.
  - The link unfurls richly in iMessage: OG tags set per trip — `Join NASH BASH 🤠 • Nashville!`,
    "📍 Nashville • You've been invited to join a trip!" with the cover image
    `[OBSERVED — src/pages/JoinTrip.tsx:232-245]`.
  - Guests see a real **pre-auth preview**: trip name, dates, cover, "8 Chravelers already planning",
    and an urgency chip "Trip starts in 3 weeks" `[OBSERVED — JoinTrip.tsx:850-909]`.
  - Then the auth wall. The unauthenticated copy is **leaked internal spec text shipped as UI**:
    _"Sign in with the standard Chravel dark auth flow to request access to this trip."_ and
    _"Google, Apple, and email sign-in remain available in the same dark modal."_
    `[OBSERVED — JoinTrip.tsx:914-933]`. Real users should never read the words "dark auth flow"
    or "the same dark modal."
  - After auth, **auto-join fires** (good — no second tap) `[OBSERVED — JoinTrip.tsx:374-386]`, invite
    code survives the OAuth round-trip via localStorage `[OBSERVED — JoinTrip.tsx:59,126-141,248-256]`.
  - But the signed-in CTA is always **"Request to Join"** with spinner text "Requesting…", and a blue
    **"Member Approval — A current trip member will review your request"** box renders for _every_
    authed user, gated only on `!joining && user` — **not** on `invite.require_approval`
    `[OBSERVED — JoinTrip.tsx:948,961-971]`. Mack didn't turn approval on; her guests are told they're
    in a review queue anyway, then are surprised by instant "Successfully joined the trip!"
  - 7 typed error states with recovery CTAs exist (expired, full, mismatch, etc.)
    `[OBSERVED — src/types/inviteErrors.ts via ground-truth §5]` — genuinely better than most apps.
  - **Guests who won't sign up get nothing**: `consumer_guest` has **NO access to any resource**
    `[OBSERVED — ground-truth §8, permissionMatrix.generated.ts]`. There is no read-only,
    no-account itinerary view. The preview card (name/dates/photo) is the entire no-account experience.
  - Post-join fragility: "Dashboard member-trip missing after join approval" is an open high-severity
    bug `[OBSERVED — ground-truth §10.6]` — a guest who joins, then can't find the trip on her home
    screen, texts Mack "it's not working" and never returns. `[SIMULATED RISK]` for this exact group.
- **Friction:** Half of Mack's 8 guests are exactly the "I'm not downloading another app" type. The
  preview is great bait, but the account wall before _any_ itinerary content means 3–4 guests stall.
- **Verdict:** ⚠️ Strongest link-unfurl + preview in the category, sabotaged by mandatory accounts,
  placeholder copy, and false "approval" messaging. This is the single highest-leverage screen in the
  product and it ships with lorem-ipsum-grade text.

### 5. Schedule items

- **Tried:** Adds Friday dinner, Saturday pedal tavern, party bus pickup, Sunday brunch.
- **What code says happens:** Calendar with month/day/list views, event create with place autocomplete;
  Smart Import can ingest confirmation emails/PDFs `[OBSERVED — ground-truth §6]`.
- **Friction:** Smart Import is gated — the concierge surface tells free users "Smart Import requires
  Explorer+. Upgrade to extract events from receipts and screenshots."
  `[OBSERVED — src/components/AIConciergeChat.tsx:436]`. So she types everything manually, which is
  exactly her Notes-app status quo. Google Calendar sync is Explorer+ too `[OBSERVED — ground-truth §7]`.
- **Verdict:** ✅ functional, ➖ no magic on free.

### 6. AI Concierge for restaurants / nightlife / schedule

- **Tried:** "Best honky-tonks near Broadway for a bachelorette," "dinner for 10 Saturday," "build our
  Saturday schedule."
- **What code says happens:** The recommendations are **real tools, not generic text**:
  `searchPlaces` hits Google Places ("Search for places like restaurants, hotels, attractions near a
  location"), `getTravelTimes` ("how long from hotel to each restaurant?"), `savePlace` ("bookmark this
  restaurant"), `createReservation` draft cards ("Use ONLY when the user explicitly asks to
  book/reserve… Do NOT auto-book"), and `browseWebsite` ("check a restaurant's menu, hours,
  availability") `[OBSERVED — supabase/functions/_shared/concierge/toolRegistry.ts:140,259,298,508,814]`.
  There's a dedicated `restaurant_recommendation` query class `[OBSERVED — toolRegistry.ts:1514]`.
  AI writes go through a "Save to Trip?" confirm card `[OBSERVED — ground-truth §6]`.
- **Friction:** Free = **10 queries per user per trip**, surfaced as an "X/10 Asks" chip that warns at
  ≤2 remaining and hard-stops at "0/10 Asks" `[OBSERVED — src/hooks/useConciergeUsage.ts:120-136,330-349;
featureTiers.ts:60]`. Planning a 3-night weekend conversationally burns 10 asks in one sitting.
  The chip's upgrade link routes to `/settings` `[OBSERVED — useConciergeUsage.ts:368]` — a settings
  page, not a checkout, mid-flow. Known design friction: "Action Plan JSON" mandate frequently ignored
  by the model; preference injection on irrelevant queries `[OBSERVED — ground-truth §10 design frictions]`.
  Voice concierge is architecturally broken ("Voice setup timed out") but it's gated above her tier so
  she never sees it `[OBSERVED — ground-truth §10.2]`.
- **Verdict:** ✅ This is the feature that beats her Google-and-Instagram research loop — for exactly
  10 messages. Best free-tier hook in the product, throttled hardest.

### 7. Places / Basecamp

- **Tried:** Sets the Airbnb as Basecamp, saves Hattie B's, Losers Bar, the pedal tavern dock.
- **What code says happens:** Google Places search/save; Basecamp drives distances and concierge
  context; map + list views `[OBSERVED — ground-truth §6; src/components/BasecampSelector.tsx]`.
- **Friction:** Minimal. `[SIMULATED RISK]` Basecamp's value (walking-distance-aware recs) is marketed
  inside the _paid_ upsell ("Basecamp Intelligence… within walking distance… from your basecamp"
  `[OBSERVED — src/components/PlusUpsellModal.tsx:122-127]`), so free users may never learn why to set one.
- **Verdict:** ✅

### 8. Polls (dinner, activities, outfits, budget)

- **Tried:** "Friday dinner?", "Saturday: pedal tavern or boat?", "Outfit theme: denim & diamonds vs
  cowboy chic?", "Budget cap per person?"
- **What code says happens:** 2–10 text options, allow-multiple, anonymous, allow-vote-change,
  deadline date+time, realtime counts; poll-as-task mode
  `[OBSERVED — src/components/poll/CreatePollForm.tsx:20-74; ground-truth §6]`. No free-tier limit on
  polls found `[OBSERVED — no entitlement references in src/components/poll/]`.
- **Friction:** Options are **text-only `Input` fields** `[OBSERVED — CreatePollForm.tsx:34,55-59]` —
  the outfits poll wants _photos_ (she'd otherwise drop 4 Pinterest screenshots in the group text).
  Anonymous voting exists, which is genuinely right for the budget question.
- **Verdict:** ✅ Core decision loop works and beats group-text chaos. ➖ No image options blunts the
  most bachelorette-y poll.

### 9. Tasks

- **Tried:** "Book party bus — Mack", "Bring sashes — Dani", "Costco run — Jess + Amara", due dates.
- **What code says happens:** Multi-assignment, due dates, mine/unassigned/overdue filters
  `[OBSERVED — ground-truth §6; src/components/todo/]`.
- **Friction:** None found at this tier. `[HYPOTHESIS — needs live test]` whether guests actually
  check a Tasks tab vs. being @-mentioned in chat.
- **Verdict:** ✅

### 10. Splitting costs — THE monetization moment, and it's broken in the inverse direction

- **Tried:** Logs Airbnb $2,800 ÷ 9, party bus $450, two dinners, brunch, decorations, bride's
  share covered, matching shirts, pedal tavern deposit, Ubers — **10+ splits**, expecting to hit the
  documented free limit of 3.
- **What code says happens:**
  - The 3-splits/trip free limit exists in **config and pricing copy only**:
    `paymentRequestsPerTrip: 3` `[OBSERVED — src/utils/featureTiers.ts:67]`,
    `'payments_basic' // 3 splits/trip (Free)` `[OBSERVED — src/billing/types.ts:30]`,
    `FEATURE_LIMITS.payment_splitting` `[OBSERVED — src/billing/entitlements.ts:215,272]`.
  - **No enforcement call site exists anywhere.** Zero references to `paymentRequestsPerTrip`,
    `payment_splitting`, tier, entitlement, limit, or upsell in `src/components/payments/`,
    `src/components/mobile/CreatePaymentModal.tsx`, `src/components/mobile/MobileTripPayments.tsx`,
    `src/hooks/usePaymentSplits.ts`, `src/services/paymentService.ts`, or `supabase/functions/`
    `[OBSERVED — exhaustive grep of those paths returned no matches]`.
  - So Mack logs all 10+ splits on free without ever seeing an upgrade prompt. The product's **best
    natural upgrade trigger never fires**, and the pricing table advertises a limit the code doesn't
    implement (sell-side drift: if it's ever enforced later, existing free trips break mid-weekend).
  - Settle-up: who-owes-whom summary, then a **Venmo deeplink** built from the creditor's _saved_
    handle — `generatePaymentDeeplink(method.type, amount, method.identifier)`
    `[OBSERVED — src/components/payments/PersonBalanceCard.tsx:46-51;
src/utils/paymentDeeplinks.ts:12-14]`. Correct recipient _if_ the payer configured
    `PaymentMethodsSettings`; if not, no deeplink renders and it's "mark as paid" manual honor system.
    Zelle "deeplink" is just `https://www.zellepay.com/send-money` `[OBSERVED — paymentDeeplinks.ts:22]`.
  - **No money moves in-app** `[OBSERVED — ground-truth §6, §10]` — Chravel is a ledger over Venmo,
    while the marketing grid says it "replaces" Venmo.
  - Open critical bug: **settlement double-credit race** — settlement mutation not atomic; concurrent
    requests can double-credit; idempotency keys missing on payments mutations
    `[OBSERVED — ground-truth §10.1]`. Ten people settling Sunday night from a bar is precisely the
    concurrency profile that triggers it. `[SIMULATED RISK]` someone gets marked paid twice and Mack
    eats $311.
  - Dead-code landmine: an unused `PaymentMessage.tsx` component **fabricates payment handles from
    display names** — "Mock payment identifiers for demo purposes…
    ``venmo: `@${payerName?.toLowerCase()…}` ``" `[OBSERVED — src/components/payments/PaymentMessage.tsx:38-50;
no non-test imports found]`. Harmless today; catastrophic if ever wired into chat rendering
    (money sent to a guessed handle).
- **Friction:** Setup tax — each of the 9 guests must save her own Venmo handle before deeplinks work.
- **Verdict:** ⚠️ The ledger + who-owes-whom view beats her spreadsheet. But it doesn't move money,
  the advertised free limit is fictional (no upgrade trigger), and the settle path carries a documented
  double-credit race on her exact usage pattern.

### 11. Media

- **Tried:** Group uploads from Friday night — easily 60+ photos from 10 phones.
- **What code says happens:** Free tier = **5 photos, 5 videos, 5 files PER TRIP**
  `[OBSERVED — src/utils/featureTiers.ts:61-63]`, enforced pre-upload by counting **trip-wide**
  (`.eq('trip_id', tripId)`) against the **uploader's own tier**
  `[OBSERVED — src/services/uploadService.ts:80-111]`. Error copy: "You've reached the limit of 5
  photos per trip on your current plan. Upgrade for unlimited uploads." `[OBSERVED — uploadService.ts:108]`.
  - Consequence 1: the entire 10-person group shares a 5-photo album. Dead on arrival Friday, hour one.
  - Consequence 2: **even if Mack upgrades, her free guests stay blocked** — the check applies each
    _guest's_ free limit against the trip-wide count, which already exceeds 5
    `[OBSERVED — uploadService.ts:56-57,85-110: tier resolved per uploader, count per trip]`.
    Host upgrade does not unlock the group's album. This inverts the product's own viral loop.
  - Also note: ground-truth §7 table lists free storage (500 MB) but not the 5-photo cap; the upsell
    modal sells free as "Photo & video sharing" with no cap disclosure
    `[OBSERVED — PlusUpsellModal.tsx:163]` — she discovers the wall only at upload failure.
  - Quotas are client-side/advisory; bucket not signed-URL enforced `[OBSERVED — ground-truth §10.7]`.
  - Grid + lightbox, compression, iOS share-sheet ingestion exist `[OBSERVED — ground-truth §6,
src/components/UnifiedMediaHub.tsx]`; media-tile preview failures for chat uploads are
    recently-fixed regression-watch `[OBSERVED — ground-truth §10 recently fixed]`.
- **Verdict:** ❌ Hard fail for this persona. The shared album is the #1 Instagram-worthy artifact of a
  bachelorette, and the free tier caps it at 5 photos _for the whole group_, with an upgrade that
  doesn't even fix it group-wide. Everyone retreats to AirDrop/Shared iCloud Album.

### 12. Chat

- **Tried:** Moves "NASH BASH" chatter in; pins the address; reacts; threads the outfit debate.
- **What code says happens:** Stream Chat with threads, reactions, pins, mentions, link unfurl, search
  `[OBSERVED — ground-truth §6]`. Reconnect message loss and mobile horizontal-overflow tab-stealing
  are _recently fixed_ — cite as fragility watch, not open bugs `[OBSERVED — ground-truth §10 recently fixed]`.
- **Friction:** `[SIMULATED RISK]` The group text doesn't die — it just forks. Chat in Chravel only
  wins if all 9 join; with 3 holdouts (step 4), conversation stays in iMessage and Chravel becomes
  Mack's solo dashboard. This is the guest-value cliff compounding.
- **Verdict:** ✅ feature, ⚠️ adoption.

### 13. Notifications

- **Tried:** Guests get pinged for polls, payments, schedule changes.
- **What code says happens:** In-app dialog with categories, PWA/native push opt-in, preferences —
  but **no per-trip mute and no batching/grouping** `[OBSERVED — ground-truth §6, §10.4]`.
- **Friction:** A 10-woman bachelorette generates hundreds of events. Guests who can't mute _this trip_
  (their only trip) will kill push globally or delete the PWA. `[SIMULATED RISK]` directly from the
  documented gap.
- **Verdict:** ⚠️ Volume without controls = uninstall vector.

### 14. Reviewing the final itinerary

- **Tried:** Wants a clean shareable "FINAL ITINERARY 🤠" the week before — ideally a PDF for the
  group text holdouts.
- **What code says happens:** Calendar list view serves in-app. **PDF export is Explorer+**
  `[OBSERVED — ground-truth §7: PDF export ✗ on Free]` — yet the in-app upsell modal tells free users
  they already have "1 PDF export per trip" and "ICS calendar download"
  `[OBSERVED — PlusUpsellModal.tsx:165-166]`. Direct contradiction with `src/billing/config.ts`;
  exactly the limit-copy drift the ground-truth brief flags (§7 ⚠️). Whichever is true, she finds out
  at the worst moment.
- **Verdict:** ⚠️ The one artifact that serves her _non-adopting_ guests is paywalled — and the paywall
  copy disagrees with the billing config.

### 15. Returning later

- **Tried:** Opens the app two weeks post-trip for photos and final settle-ups.
- **What code says happens:** 3 active trips on free — fine for her single trip
  `[OBSERVED — featureTiers.ts:66]`. Archive restore is sold as a paid feature ("Unlimited saved trips +
  restore archived") `[OBSERVED — TripPassModal.tsx:27]`. The join-approval dashboard bug (§10.6) may
  have already shed stragglers. With 5 photos in media and balances settled out-of-band, there's
  little to return _to_. `[SIMULATED RISK]` Day-7 return is the bride asking "where are the pics?" —
  and they're in iCloud, not Chravel.
- **Verdict:** ⚠️ Post-trip retention depends on the exact feature (media) the free tier amputated.

### 16. Pay-or-upgrade decision

- **Tried:** Hits the 10-ask concierge wall and the 5-photo wall; looks for a one-time option.
- **What code says happens:**
  - The right product exists: **Explorer Trip Pass, 45 days, $39.99 one-time** ("Full premium features
    for one trip — planning through post-trip. No commitment.") `[OBSERVED — TripPassModal.tsx:17-36,100-104]`.
  - But `TripPassModal` is **only mounted from the marketing `PricingSection`**
    `[OBSERVED — only import: src/components/conversion/PricingSection.tsx:3,597]`. The in-app upsell
    is `PlusUpsellModal` — **subscriptions only**, annual-defaulted toggle, "Start Free Trial" /
    "Maybe Later" `[OBSERVED — PlusUpsellModal.tsx:14,243-260]` — and it's wired into
    `TripDetailDesktop`/`EventDetail`/`ProTripDetailDesktop` but **not `MobileTripDetail.tsx`**
    `[OBSERVED — grep: no Upsell/TripPass references in src/pages/MobileTripDetail.tsx]`. On her iPhone,
    the limit walls point at `/settings` (concierge chip `upgradeUrl: '/settings'`) or a toast.
  - Discovered in passing: `ProTripDetailDesktop.tsx:571` wires the upsell trigger as
    `onShowTripsPlusModal={() => setShowTripsPlusModal(false)}` — the open-handler **closes** the modal;
    that surface can never show the upsell `[OBSERVED — src/pages/ProTripDetailDesktop.tsx:571]`.
  - In the Capacitor iOS app, `APPLE_IAP_ENABLED = false` → "Subscribe on web" with no link-out allowed
    (App Store 3.1.1) `[OBSERVED — ground-truth §7]` — a literal dead end. On Safari/PWA, Stripe
    checkout works `[HYPOTHESIS — needs live test]`.
  - Neither upsell surface mentions payment splits or the photo cap — the two limits a bachelorette
    actually hits `[OBSERVED — PlusUpsellModal.tsx feature lists; TripPassModal.tsx:26-53]`.
- **Verdict:** ❌ The persona most willing to pay once is shown a subscription pitch (or nothing, on
  mobile), while the one-time pass she'd buy is stranded on the marketing page.

## D. Feature-by-Feature Findings

| Feature                        | Expected goal                              | Tried                                | What happened (per code)                                                                                                                                                                                                                                                                                                | Friction                                                | Bug/UX issue                                                                                                                                                                                                                                 | Severity                        | Revenue impact                                  | Retention impact                           | Recommended fix                                                                                                                    |
| ------------------------------ | ------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Invite link / join             | 8 guests in, zero effort                   | Shared `/join/{token}` in group text | Rich unfurl + pre-auth preview + auto-join after auth `[OBSERVED — JoinTrip.tsx:232-245,374-386]`                                                                                                                                                                                                                       | Account wall before any itinerary content               | Placeholder spec copy in production UI ("standard Chravel dark auth flow… same dark modal") `[OBSERVED — JoinTrip.tsx:914-933]`; "Request to Join"/"Member Approval" shown even when approval is off `[OBSERVED — JoinTrip.tsx:948,961-971]` | **High**                        | High — invite is the funnel                     | High                                       | Condition CTA + approval box on `inviteData.invite.require_approval`; replace leaked copy; add read-only no-account itinerary view |
| Guest (no account)             | See the plan from one tap                  | Guest opens link, won't sign up      | Preview card only; `consumer_guest` = NO resource access `[OBSERVED — ground-truth §8]`                                                                                                                                                                                                                                 | Total value cliff                                       | By design, but lethal for this persona                                                                                                                                                                                                       | **Critical (product)**          | High                                            | High — 3–4 of 8 guests never activate      | Public read-only trip view (itinerary + places) behind the invite token                                                            |
| Join → dashboard               | Trip visible after joining                 | Guest joins                          | Open bug: approved member's trip missing from dashboard `[OBSERVED — ground-truth §10.6]`                                                                                                                                                                                                                               | "It's not working" texts                                | Open high-sev bug                                                                                                                                                                                                                            | **High**                        | Med                                             | High                                       | Fix `trip_members.status` drift per DEBUG_PATTERNS entry                                                                           |
| Polls                          | Decide dinner/activities/outfits/budget    | 4 polls                              | 2–10 options, anonymous, deadline, vote change, realtime `[OBSERVED — CreatePollForm.tsx]`                                                                                                                                                                                                                              | Text-only options                                       | No image options for outfit polls `[OBSERVED — CreatePollForm.tsx:34]`                                                                                                                                                                       | Low                             | Low                                             | Med                                        | Image attachments on poll options                                                                                                  |
| Payments — split limit         | Log 10+ shared costs; expect free cap of 3 | 10+ splits                           | **Limit defined in config/pricing but never enforced** `[OBSERVED — featureTiers.ts:67, entitlements.ts:272, zero call sites in payments/edge code]`                                                                                                                                                                    | None (that's the problem)                               | Pricing/code contract drift; best upgrade trigger never fires; future enforcement would break live trips                                                                                                                                     | **High**                        | **High — direct conversion leak**               | Low                                        | Enforce at creation with in-context Trip Pass upsell + grandfathering for existing trips                                           |
| Payments — settle-up           | Get paid back                              | Settle Sunday night                  | Venmo/CashApp/PayPal deeplinks from saved handles `[OBSERVED — PersonBalanceCard.tsx:46-51]`; manual mark-paid otherwise; **no in-app money movement** `[OBSERVED — ground-truth §6]`                                                                                                                                   | Each guest must pre-save her handle                     | **Settlement double-credit race; missing idempotency** `[OBSERVED — ground-truth §10.1]`                                                                                                                                                     | **Critical**                    | Med                                             | High — money errors kill trust permanently | Atomic settle RPC + idempotency keys; prompt handle setup at join                                                                  |
| Payments — dead mock component | —                                          | —                                    | Unused `PaymentMessage.tsx` fabricates Venmo/CashApp handles from display names `[OBSERVED — PaymentMessage.tsx:38-50]`                                                                                                                                                                                                 | —                                                       | Dead code that mis-routes money if ever revived                                                                                                                                                                                              | Med (latent)                    | —                                               | —                                          | Delete the component                                                                                                               |
| Media                          | Group photo dump                           | 10 phones upload                     | Free = **5 photos/trip counted trip-wide vs uploader's tier** `[OBSERVED — uploadService.ts:80-111; featureTiers.ts:61]`; host upgrade doesn't unlock guests                                                                                                                                                            | Wall at hour one                                        | Group-hostile limit design; cap undisclosed pre-hit; drift vs ground-truth §7 table (no photo cap listed)                                                                                                                                    | **Critical (for this persona)** | High — punitive walls don't convert, they evict | **Critical**                               | Per-user counts, or trip media limit keyed to _trip owner's_ tier; raise free cap to ≥50; disclose in pricing                      |
| AI Concierge                   | Restaurants/nightlife/schedule             | ~15 queries                          | Real Places/travel-time/save/reservation-draft/browse tools `[OBSERVED — toolRegistry.ts:140,259,298,508,814]`; "X/10 Asks" chip `[OBSERVED — useConciergeUsage.ts]`                                                                                                                                                    | 10 asks gone in one session; upgrade link → `/settings` | Limit-hit routes to settings, not checkout; JSON-mandate/preference-injection quirks `[OBSERVED — ground-truth §10]`                                                                                                                         | Med                             | High — best hook, weakest conversion handoff    | Med                                        | Route limit-hit to Trip Pass modal in-context                                                                                      |
| Itinerary export               | PDF for non-adopters                       | Export final itinerary               | Free per config: no PDF `[OBSERVED — ground-truth §7]`; upsell modal claims free includes "1 PDF export per trip" `[OBSERVED — PlusUpsellModal.tsx:165]`                                                                                                                                                                | Discovered at crunch time                               | Limit-copy contradiction                                                                                                                                                                                                                     | Med                             | Med                                             | Med                                        | Reconcile copy with `billing/config.ts`; consider 1 free PDF as documented                                                         |
| Notifications                  | Right pings, not spam                      | 10-person event volume               | Categories + push, **no per-trip mute, no batching** `[OBSERVED — ground-truth §6, §10.4]`                                                                                                                                                                                                                              | Guests nuke push globally                               | Documented gap                                                                                                                                                                                                                               | High                            | Low                                             | High                                       | Per-trip mute + digest batching                                                                                                    |
| Upgrade surfaces               | One-time pass for one weekend              | Looks to pay once                    | Trip Pass only on marketing `PricingSection` `[OBSERVED — PricingSection.tsx:3,597]`; in-app = subscription-only `PlusUpsellModal`, absent from `MobileTripDetail` `[OBSERVED — grep]`; Pro-desktop trigger wired to close `[OBSERVED — ProTripDetailDesktop.tsx:571]`; iOS IAP disabled `[OBSERVED — ground-truth §7]` | Mobile user with money in hand finds no buy button      | Multiple wiring gaps                                                                                                                                                                                                                         | **High**                        | **High — direct**                               | Med                                        | Mount Trip Pass modal at every limit wall, mobile first; fix the `false` handler                                                   |

## E. Emotional Reaction

- **Confident:** trip creation, polls, tasks, places. The dark/gold aesthetic and trip cover crop read
  premium; the invite unfurl with the bride's photo and "Trip starts in 3 weeks" is the screenshot she'd
  brag about. `[OBSERVED copy/flows above]`
- **Impressed:** the concierge actually searching real places, computing hotel→restaurant travel times,
  and producing a "Save to Trip?" card — that's the first moment it beats Google + group text.
- **Confused:** guests reporting "it says a member has to approve me?" when she never enabled approval;
  "standard Chravel dark auth flow" reading like a bug; upsell modal claiming a free PDF the pricing
  table denies.
- **Annoyed:** 5-photo album wall on night one; concierge hitting 0/10 mid-planning and pointing her at
  Settings; no way to mute one trip's firehose.
- **Would abandon over:** the photo cap (instant retreat to iCloud Shared Album) and any settle-up money
  error (`[OBSERVED — ground-truth §10.1]` race). Media + money are the two things she will not forgive.
- **The 8 guests:** 4–5 join (the preview is genuinely persuasive), 3–4 never make it past the account
  wall. Joiners like polls and the schedule; none of them can meaningfully add photos; the group text
  survives as the real chat. Guests' verdict: "cute app, why couldn't I just see the schedule without
  signing up?" — they are net-neutral evangelists at best. `[SIMULATED RISK]` overall;
  permission cliff itself `[OBSERVED — ground-truth §8]`.

## F. Conversion Scores

| Metric                | Score    | Justification                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Activation**        | **7/10** | Solo setup is fast and premium-feeling (trip, schedule, polls, concierge all deliver pre-invite) `[OBSERVED flows §C1–C8]`. Docked for 9-screen onboarding and Smart Import being paywalled at first touch.                                                                                                                                                                                                  |
| **Invite conversion** | **5/10** | Best-in-class unfurl + preview + auto-join `[OBSERVED — JoinTrip.tsx]`, but hard account wall, zero no-account value `[OBSERVED — ground-truth §8]`, false approval messaging, leaked spec copy, and a known join→dashboard bug `[OBSERVED — §10.6]`.                                                                                                                                                        |
| **Day-7 retention**   | **4/10** | Mid-trip the schedule/polls/ledger work; but media (the post-trip magnet) is capped at 5 group photos `[OBSERVED — uploadService.ts]`, chat forks back to iMessage, and notification spam has no per-trip mute `[OBSERVED — §10.4]`.                                                                                                                                                                         |
| **Paid conversion**   | **3/10** | The split limit — her most natural trigger — is unenforced and never prompts `[OBSERVED — no call sites]`; the photo wall prompts but reads punitive and doesn't fix the group even if she pays `[OBSERVED — uploadService.ts:56-110]`; Trip Pass is unreachable in-app `[OBSERVED — PricingSection-only mount]`; mobile trip view has no upsell mount; native iOS purchase is a dead end `[OBSERVED — §7]`. |
| **NPS**               | **−5**   | Promoter energy from concierge + polls + invite preview, cancelled by detractor energy from the photo cap and payments-that-don't-pay. She'd say "promising, not ready for _my_ group" to the next MOH.                                                                                                                                                                                                      |

**Would she pay?** Yes — **once**. The Explorer Trip Pass ($39.99/45 days) is psychologically perfect
for a one-off weekend ("No commitment. Keep your exports forever." `[OBSERVED — TripPassModal.tsx:102-103]`),
and $4/head split across the group is a no-brainer _if_ it visibly unlocked the group's album and
unlimited asks during the trip window. A $9.99/mo subscription is a hard no — she plans one of these
a year and resents subscriptions by profile.

**What creates willingness to pay:** (1) unlimited group photo album, (2) unlimited concierge during
the trip window, (3) PDF/itinerary export for the holdout guests, (4) split-count headroom — in that
order. Note that today's upsell surfaces sell none of #1 and #4 `[OBSERVED — PlusUpsellModal.tsx,
TripPassModal.tsx feature lists]`.

**What limit actually triggers upgrade:** As shipped, the **5-photos-per-trip wall** is the only one
she reliably hits with a prompt (`MediaCountExceededError` copy: "Upgrade for unlimited uploads"
`[OBSERVED — uploadService.ts:108]`) — and it fires at the worst emotional moment (Friday night,
mid-party) with no purchase surface mounted on mobile. The **3-splits limit never triggers because it
is not enforced** `[OBSERVED]` — the best natural trigger in the product (10+ splits is guaranteed
volume for this persona) is currently a no-op.

**CTA natural vs annoying:** Natural — a Trip Pass card at the moment a wall is hit, framed as
"unlock NASH BASH for everyone, $39.99 once." Annoying — the current annual-defaulted "Start Free
Trial" subscription modal (`PlusUpsellModal`) with a 14-day trial for a 3-day event, and the concierge
chip dumping her into `/settings` `[OBSERVED — useConciergeUsage.ts:368]`.

**Does it beat group text + Google Doc + Venmo + Notes + Instagram?** On decisions (polls), schedule,
and place intel: yes, clearly. On chat: only with 100% guest adoption, which the account wall prevents.
On money: it's a nicer ledger but still Venmo underneath, with a documented double-credit race on top.
On photos: it loses outright to a free iCloud Shared Album at the free tier. **Net: she uses it as her
command center, the group half-adopts it, and nobody pays — unless the five fixes below land.**

## G. Top 5 Fixes

1. **Replace the no-account dead end with a token-gated read-only trip view** (itinerary + places +
   final schedule behind `/join/{token}`, no auth) **because** 3–4 of Mack's 8 guests failed at the
   _see the plan from one tap_ task (`consumer_guest` = NO resource access
   `[OBSERVED — ground-truth §8]`), **causing** the viral loop to cap at ~50% of every invited group
   and the group text to remain the system of record.

2. **Replace the trip-wide-count-vs-uploader-tier media check with per-user counts (or key the trip's
   media allowance to the trip owner's tier) and raise the free photo cap** (`uploadService.ts:80-111`,
   `featureTiers.ts:61`) **because** Mack's group failed at the _shared photo album_ task five photos
   into Friday night — and discovered that even paying doesn't unlock her guests — **causing** the
   stickiest post-trip artifact (and Day-7 retention) to be handed to iCloud, and the upgrade prompt to
   read as punishment instead of value `[OBSERVED]`.

3. **Replace the unenforced 3-splits config with real enforcement that opens `TripPassModal`
   in-context (mounted in `MobileTripDetail` first)** **because** Mack logged 10+ splits without ever
   seeing a purchase surface — the limit exists only in `featureTiers.ts:67`/`entitlements.ts:272`
   and pricing copy, with zero call sites `[OBSERVED]` — **causing** the product's highest-intent
   monetization moment (guaranteed 10+ splits per bachelorette) to convert at exactly 0%, while the
   advertised-but-fake limit is a trust/contract liability if ever switched on. Ship with
   grandfathering for in-flight trips.

4. **Replace the placeholder auth copy and unconditional approval messaging on `JoinTrip` with
   production copy and a `require_approval`-conditioned CTA** ("Join Trip" vs "Request to Join";
   hide the "Member Approval" box when approval is off) **because** guests failed at the _trust the
   join flow_ task — they read internal spec text ("standard Chravel dark auth flow… same dark modal"
   `[OBSERVED — JoinTrip.tsx:914-933]`) and were told a review queue existed when it didn't
   `[OBSERVED — JoinTrip.tsx:948,961-971]` — **causing** drop-off and "is this app legit?" texts at the
   single most valuable screen in the funnel.

5. **Replace manual mark-as-paid settlement with an atomic, idempotent settle RPC (and delete the dead
   mock-handle `PaymentMessage.tsx`)** **because** ten guests settling concurrently on Sunday night is
   the documented double-credit race profile (`[OBSERVED — ground-truth §10.1]`; fabricated-handle dead
   code at `PaymentMessage.tsx:38-50`), **causing** the one failure mode — wrong money — that turns a
   promoter MOH into a one-star App Store review and poisons the next ten bachelorettes in her circle.
