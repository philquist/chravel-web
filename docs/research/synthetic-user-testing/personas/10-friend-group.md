# Persona 10: Maya Chen — Friend Group Vacation Organizer

## A. Profile

- **Name:** Maya Chen
- **Age range:** 28 (24–32 band)
- **Tech comfort:** High — iPhone 15, lives in iMessage/Instagram, uses Splitwise, Google Maps lists, Partiful, shared Apple albums
- **Planning style:** "The one who always plans." She made the spreadsheet for the last 3 trips. The other 7 friends contribute one Venmo payment and 40 memes each.
- **Pain points:** 200-message group-text threads where the flight info scrolls away; chasing people for money; nobody reads the itinerary; deciding restaurants by attrition.
- **Budget sensitivity:** Medium — pays $9.99/mo for things that demonstrably save her hours; cancels anything she forgets she has.
- **Why she'd adopt:** One link that replaces the spreadsheet + Splitwise + Google Maps list, and makes her look organized.
- **Why she'd reject:** Friends won't switch from the existing group text; if the app is empty until everyone joins, it's just one more place to maintain; any signup friction on the friend side kills it.

**Scenario tested (code-grounded simulation):** Maya creates "Tokyo 2026" (8 people, 9 days), invites 7 friends, attempts flights/hotel/places/polls/payments/AI on iPhone (PWA/Capacitor), free tier.

---

## B. Jobs-to-be-Done

1. When I'm herding 8 people toward one trip, I want one shared link with dates, flights, and the plan, so I can stop re-answering "wait, what day do we land?"
2. When I front the Airbnb and the izakaya bill, I want splits tracked automatically and visible to everyone, so I can get paid back without being the nag.
3. When the group can't pick between Shibuya and Shinjuku nights, I want a poll that closes itself, so decisions happen without 60 messages.
4. When I find a place on Instagram/Google, I want to save it to a shared trip map in two taps, so good ideas don't die in the chat scroll.
5. When the trip is 2 weeks out, I want the app to nudge the group about unfinished tasks and unpaid balances, so I'm not the only engine of the trip.

---

## C. Full User Journey (16 steps)

### 1. Discovery / landing

- **Tried:** Opens chravelapp.com on iPhone from a TikTok/blog mention.
- **What code says:** Unauthenticated visitors get the marketing landing with pricing, FAQ, sign-up modal; demo mode exists with full mock app-preview [OBSERVED — product-ground-truth.md §3, `src/MarketingApp.tsx`]. Onboarding's final screen also offers "Explore demo trip" as an alternative to creating one [OBSERVED — `OnboardingCarousel.tsx:171-175,193-196`].
- **Friction:** "Plan group trips without the chaos" (welcome screen copy) is exactly her pitch — good. [SIMULATED RISK] She skims pricing, sees "Start free," doesn't register the free caps.
- **Verdict:** Positive. Proceeds.

### 2. Sign-up / onboarding — screens and taps to first value

- **Tried:** Sign up with Google, complete onboarding, reach an actionable surface.
- **What code says:** Email verification required post-signup (email path); Google OAuth available [OBSERVED — ground-truth §3]. Then a **10-screen onboarding carousel** — `TOTAL_SCREENS = 10`: Welcome → Chat → Calendar → Concierge → Media → Payments → Places → Polls → Tasks → Final CTA — while the file's own doc comment still says "Premium 5-screen product tour" and the ground-truth brief says 9 [OBSERVED — `OnboardingCarousel.tsx:1-7,37,50-114`]. Skippable via "Skip tour" on every screen [OBSERVED — `OnboardingCarousel.tsx:247-253`]. Final screen CTA goes straight into Create Trip [OBSERVED — `OnboardingCarousel.tsx:166-169`].
- **Tap count:** OAuth (2 taps) → 10 onboarding screens (9 "Continue" taps if not skipped; 1 if skipped) → "Create a trip" → Create Trip modal. **Best case ~4 taps to the create modal; dutiful case ~12.**
- **Friction:** 10 marketing screens before any value is a lot for a high-intent organizer; the tour previews every tab she's about to see again as real tabs. [SIMULATED RISK] She skips at screen 3, learning nothing about Basecamp — which matters later (step 7).
- **Verdict:** Tolerable; skip path saves it. Onboarding ends at the right place (Create Trip).

### 3. Trip creation (Tokyo, 8 people)

- **Tried:** Create "Tokyo 2026," Mar 20–29, Tokyo, cover photo.
- **What code says:** Consumer is the default type; required: unique title, start/end dates, timezone; optional location, description, cover photo with crop [OBSERVED — ground-truth §4, `CreateTripModal.tsx`]. Free tier allows 3 active trips [OBSERVED — ground-truth §7]. Create Trip is reachable from dashboard and from onboarding CTA [OBSERVED — `Index.tsx:678,1079,1326`].
- **Friction:** Minimal. Timezone-required is mildly odd for a consumer ("Asia/Tokyo" — fine). [SIMULATED RISK] None blocking.
- **Verdict:** Best moment of the product so far. ~60 seconds to a real trip object.

### 4. Inviting 7 friends — and the friend-side journey

- **Tried (organizer):** Find the invite. On mobile the trip header has back / title / three-dot. **Invite lives inside the three-dot overflow sheet** (`onInvite` on `MobileHeaderOptionsSheet`), not as a visible button [OBSERVED — `MobileTripDetail.tsx:591-600,633-641`]. So: trip → ⋮ → Invite → InviteModal → share via copy/SMS/native share. The app's single most important growth action is 3 taps deep behind an unlabeled icon. [SIMULATED RISK] A first-time organizer shares the _preview_ link via the separate "Share" action instead of the _join_ link — both live in the same sheet (`onShare` builds a preview link, `onInvite` builds a join token) [OBSERVED — `MobileTripDetail.tsx:258-294,633-641`].
- **Friend-side funnel, per the 7 friends (link → preview → auth → join → trip):**
  1. **Link tap → preview:** works pre-auth — trip name, dates, cover, member count, "Trip starts in X days" [OBSERVED — ground-truth §5]. Good hook. _Drop-off A (~1 friend):_ opens it in the Instagram in-app browser, sees a sign-in wall next, closes. [SIMULATED RISK]
  2. **Auth gate:** full account creation + email verification for the email path [OBSERVED — ground-truth §3]. _Drop-off B (~2 friends):_ "I'll do it later." Verification email is the classic graveyard. [SIMULATED RISK] Also: JoinTrip.tsx ships leaked spec copy ("standard Chravel dark auth flow") and shows "Request to Join" / "Member Approval" **unconditionally**, even when Maya never enabled require_approval [OBSERVED — prior persona verification, JoinTrip.tsx ~914-933]. Friends who do continue believe they're entering an approval queue for a casual friend trip — chilling and wrong. _Drop-off C (~1 friend)._
  3. **Join → dashboard:** there is a documented bug where a member's trip is **missing from their dashboard after join approval** (trip_members.status column drift) — user approved and notified, trip absent [OBSERVED — ground-truth §10.6, DEBUG_PATTERNS.md]. _Drop-off D:_ a friend who joins, gets the notification, opens the app, and sees "No trips" is gone forever.
  4. **Joined → empty trip:** lands on the **Chat tab by default** [OBSERVED — `MobileTripDetail.tsx:54-60`] which is empty (see step 12). _Drop-off E:_ "cool, it's a worse group chat" → returns to iMessage.
- **Verdict:** This is the funnel that decides the company, and it has a buried entry point, a falsely-threatening approval screen, a known post-join data bug, and an empty-room landing. **Realistic outcome: 4–5 of 7 friends become active members.** [SIMULATED RISK aggregate; component defects OBSERVED as cited]

### 5. Adding places / flights / hotel / activities

- **Tried:** Forward the ANA flight confirmation; add the Shinjuku hotel; pin 10 restaurants.
- **What code says:** Smart Import (Gmail OAuth, PDF/ICS/CSV/images, links, text) exists with a real ingest→parse→preview→commit pipeline [OBSERVED — ground-truth §6]. **But every consumer entry point is Explorer+ gated:** the calendar Import button shows a paywall toast ("Import schedules from links and files instantly… Recommended plan: Explorer" → "View Plans") for free users [OBSERVED — `MobileGroupCalendar.tsx:96-153`], and the concierge attachment-intent dropdown disables "Extract events (Smart Import) — Explorer+" with an error toast on free [OBSERVED — `AIConciergeChat.tsx:434-446`]. So **free Maya types her flights and hotel in manually** via calendar event create (which does have place autocomplete) [OBSERVED — ground-truth §6].
- **Friction:** The single best "wow this saved me time" moment — paste your confirmation, watch the itinerary build itself — is paywalled before the user has experienced it once. [SIMULATED RISK] Manual entry of 2 flights + hotel + 5 activities ≈ 15 minutes of form-filling; her spreadsheet was honestly comparable.
- **Verdict:** Functional but charmless on free. Smart Import as a _first-taste_ feature is locked exactly when it would convert her.

### 6. AI Concierge (10 free queries/user/trip)

- **Tried:** "Find 5 great hotels near our base camp," "best ramen near Shinjuku," "build a day plan for Mar 22."
- **What code says:** Empty state shows strong example prompts and a "Group-aware" badge [OBSERVED — `AIConciergeChat.tsx:350-369`]. 38 tools; AI writes go through a "Save to Trip?" confirm card; pending actions auto-promote even if she switches tabs [OBSERVED — ground-truth §6; `MobileTripDetail.tsx:48-51`]. **Quota is invisible:** `useConciergeUsage` computes "X/10 Asks" status-chip messages (`useConciergeUsage.ts:334-349`) but the only production consumer destructures usage away as `_usage` — no counter renders anywhere; only a test mocks the chip [OBSERVED — `AIConciergeChat.tsx:46-50`, `src/components/__tests__/AIConciergeChat.test.tsx:83`, grep: no other call sites]. On query #11 she gets a **plain text assistant message** — "you've reached your Concierge limit for this trip on the free plan… Recommended plan: Frequent Chraveler." — with **no tappable CTA**; the paywall config's destination is `/settings`, not checkout, and is only used elsewhere [OBSERVED — `useConciergeMessages.ts:42-54`, `featurePaywall.ts:48-54`].
- **Friction:** (a) 10 queries is genuinely enough to demo value _if she knew she had 10_ — instead she budget-burns blind and hits a cold wall mid-planning. (b) The limit message recommends the **$19.99 Frequent Chraveler** plan, skipping the $9.99 Explorer tier that already gives 25/trip [OBSERVED — `featurePaywall.ts:52` vs ground-truth §7] — a price-anchoring own-goal. (c) Voice toggle is shown (`isVoiceEligible={true}` hardcoded [OBSERVED — `AIConciergeChat.tsx:487`]) while realtime voice is product-wide dictation-only [OBSERVED — ground-truth §10.2].
- **Verdict:** The concierge itself is the best feature in the app; the quota UX around it is the worst monetization surface in the app.

### 7. Places / Basecamp

- **Tried:** Set the hotel as Basecamp; build the restaurant list.
- **What code says:** Places tab = two sub-tabs: **"Base Camps"** and **"Explore"** (links panel); trip + personal basecamps with realtime sync and "updated by another member" toasts [OBSERVED — `PlacesSection.tsx:189-246,96-159`]. Basecamp feeds distances and concierge context [OBSERVED — ground-truth §6]. Saved concierge places navigate here via `onNavigateToPlaces` [OBSERVED — `AIConciergeChat.tsx:60-69`].
- **Friction:** [SIMULATED RISK] "Basecamp" is insider vocabulary — she skipped the tour, taps Places expecting a Google-Maps-style saved list, and finds "Base Camps / Explore." Her saved ramen spots live under "Explore," a label that reads like a discovery feed, not "our list." Dev `console.log` left in the realtime path [OBSERVED — `PlacesSection.tsx:116,126`] — cosmetic, but violates repo rules.
- **Verdict:** Mechanically better than a Google Maps list (shared, synced, feeds the AI); discoverability of that fact is poor.

### 8. Polls

- **Tried:** "Saturday night: Golden Gai vs teamLab vs Robot Restaurant," auto-close.
- **What code says:** Options, auto/manual close, anonymous voting, change-vote, realtime counts; the mobile Polls tab renders `CommentsWall` [OBSERVED — ground-truth §6; `MobileTripTabs.tsx:495-496`]. Concierge can create polls by prompt [OBSERVED — `AIConciergeChat.tsx:357` example copy].
- **Friction:** [SIMULATED RISK] Only the 4–5 joined friends can vote; she screenshots the poll back into iMessage for the rest — the app becomes an input to the group text instead of its replacement. Component name `CommentsWall` for polls hints at a legacy surface; behavior per ground truth is complete.
- **Verdict:** Better than the incumbent (counting "🍜" reacts in iMessage). One of the two clearest wins.

### 9. Tasks

- **Tried:** "Book teamLab tickets" → Devon, "JR Pass research" → Priya, due dates.
- **What code says:** Multi-assignment, due dates, mine/unassigned/overdue filters, poll mode [OBSERVED — ground-truth §6].
- **Friction:** [SIMULATED RISK] Assignment only works for joined members; her two laggard friends can't be assigned anything, so the task list silently becomes "Maya's list," recreating the original problem. No proven nudge loop for overdue tasks (see step 13).
- **Verdict:** Solid feature, value scales with join rate — which step 4 capped.

### 10. Budget / payments / splits

- **Tried:** Log Airbnb ¥180,000 split 8 ways; later, dinner splits; settle up.
- **What code says:** Create payment with equal/custom split, balances summary, per-person cards, outstanding, history; settle-up is **manual or Venmo deeplink — no in-app money movement** [OBSERVED — `PaymentsTab.tsx:146-267`; ground-truth §6, §10 design frictions]. The free "3 splits/trip" cap has **zero enforcement call sites** [OBSERVED — prior persona verification], so she logs 12 expenses without friction or upsell. Known critical: settlement mutation is not atomic — concurrent settle requests can double-credit [OBSERVED — ground-truth §10.1].
- **Friction:** Venmo deeplink is honestly fine for this persona (it's what they'd use anyway). But vs Splitwise: no recurring, no currencies-on-arrival simplification surfaced (CurrencySelector exists [OBSERVED — payments dir listing]), and the double-credit race is exactly the "two friends both tap settle" scenario an 8-person trip produces. [SIMULATED RISK] One double-credit incident in a friend group is a trust-ending event for the whole category.
- **Verdict:** At parity with Splitwise for tracking; the unenforced cap means payments generate **zero conversion pressure** while being the stickiest feature.

### 11. Media

- **Tried:** Shared album for the trip; friends dump photos.
- **What code says:** Photos/videos/links/files, grid + lightbox, compression, iOS share-sheet ingestion [OBSERVED — ground-truth §6]. Free media: **5 photos counted TRIP-WIDE against each uploader's tier** (uploadService.ts:80-111) — the organizer upgrading does not unlock guests [OBSERVED — prior persona verification]. Storage quotas advisory-only [OBSERVED — ground-truth §10.7].
- **Friction:** An 8-person Tokyo trip produces 500+ photos. A 5-photo-per-tier wall on the _whole trip's_ count means a free friend hits the wall on someone else's photos, and Maya paying $9.99 doesn't fix her friends' walls — the worst possible group-product semantics. Apple shared albums are free and infinite. [SIMULATED RISK] Media tab gets abandoned for an iCloud shared album by day 2 of the trip.
- **Verdict:** Loses to the free incumbent as configured.

### 12. Chat — vs. the existing group text (cold-start)

- **Tried:** Use trip chat instead of the iMessage thread.
- **What code says:** Chat is the **default tab** on every trip open [OBSERVED — `MobileTripDetail.tsx:54-60`], Tier-1 pre-mounted for warmth [OBSERVED — `MobileTripTabs.tsx:170`]. Stream-backed with threads, reactions, pins, mentions, unfurl [OBSERVED — ground-truth §6].
- **Friction:** The group text has 4 years of history, all 8 people, and zero activation energy. Trip chat starts with 0 messages and 4–5 of 8 people. Making the empty room the **landing tab** maximizes exposure to the weakest cold-start surface; her actual artifacts (calendar, places, payments) are one swipe away but unseen. [SIMULATED RISK] Chat never reaches critical mass; it becomes the notification channel for system messages about payments/polls — which is fine, but then it shouldn't be the front door.
- **Verdict:** Feature-rich but structurally unwinnable vs iMessage in week 1. Default-tab choice compounds it.

### 13. Notifications

- **Tried:** Expect friends to get nudged about the poll and unpaid balances.
- **What code says:** In-app notification dialog with categories, PWA/native push opt-in, preferences; **no per-trip mute, no batching** [OBSERVED — ground-truth §6, §10.4]. Notification fanout blocks the INSERT at scale (not her 8-person problem) [OBSERVED — §10.4].
- **Friction:** [SIMULATED RISK] For passives, no batching means either silence (never opted into push) or a firehose (every chat message) — both produce mute-and-forget. No per-trip mute means the one friend in two trips gets everything or nothing.
- **Verdict:** Exists, but not engineered as the re-engagement weapon this persona needs.

### 14. Reviewing the final itinerary

- **Tried:** One screen with the whole plan, shareable.
- **What code says:** Calendar month/day/list views; PDF "Recap" export from trip info drawer / options sheet — full pipeline with section picking, real data fetch, iOS-compatible download [OBSERVED — `MobileTripDetail.tsx:146-255`]. PDF export is **Explorer+** [OBSERVED — ground-truth §7].
- **Friction:** The free path is "open the calendar tab"; fine. [SIMULATED RISK] The PDF gate here is a _reasonable_ paywall placement — end-of-planning, organizer-only, high pride moment — arguably the best natural conversion point in the product, but it's framed as "Recap" (memories) rather than "send the itinerary to everyone."
- **Verdict:** Adequate. The export gate is the most legitimate paywall she meets.

### 15. Returning 2 weeks later — re-engagement hooks

- **Tried:** Does anything pull her or the friends back?
- **What code says:** `daily-digest`, `payment-reminders`, `event-reminders`, `send-email-with-retry` edge functions exist [OBSERVED — `supabase/functions/` listing]. But `daily-digest` is a **request-driven GET/POST** keyed on `user_id` — it serves a digest when asked, i.e., it's an in-app surface, not an outbound email loop [OBSERVED — `daily-digest/index.ts:37-60`]. Whether payment/event reminders are cron-scheduled and actually deliver email/push is unverified here [HYPOTHESIS — needs live test / cron config check]. PostHog has ingested zero events ever, so no one can even measure week-2 return [OBSERVED — ground-truth §9].
- **Friction:** Session resume is good (active tab persisted per trip in sessionStorage [OBSERVED — `MobileTripDetail.tsx:71-76`]; concierge shows "Picked up where you left off" [OBSERVED — `AIConciergeChat.tsx:377-385`]). But nothing demonstrably _initiates_ the return. For a passive-friend product, outbound is the product.
- **Verdict:** Re-engagement is the largest unbuilt (or at least unproven) system for this persona.

### 16. Pay-or-upgrade moment

- **Tried:** What finally asks her for money, and can she say yes?
- **What code says:** The limits she actually hits: concierge 10 queries (invisible until hit, dead-end message, recommends the wrong tier — step 6); Smart Import (gated before first taste — step 5); media 5-photo trip-wide weirdness (step 11); PDF export (step 14). Splits cap: unenforced — never fires [OBSERVED — prior persona verification]. The **Trip Pass** ($39.99/45-day Explorer) — the perfect SKU for a one-off Tokyo trip — is **only purchasable from the marketing pricing page**, not from any in-app limit wall [OBSERVED — prior persona verification]. The concierge wall's configured destination is `/settings` [OBSERVED — `featurePaywall.ts:48-54`]; on iOS, `APPLE_IAP_ENABLED = false` means the app can only say "Subscribe on web" [OBSERVED — ground-truth §7].
- **Friction:** On her iPhone, the realistic chain is: hit invisible quota → plain text message, no button → (if persistent) find Settings → "Subscribe on web" → Safari → pricing page → only there discover the Trip Pass. That's 5+ context switches to give them money.
- **Verdict:** She would have paid $39.99 for a Trip Pass at the concierge wall on day 2. The product never offers it there. No purchase.

---

## D. Feature-by-Feature Findings

**Mobile in-trip tab count: 8 for consumer trips** — Chat, Calendar, Concierge, Media, Payments, Places, Polls, Tasks, in a horizontally scrolling pill bar; **default tab = Chat** (URL `?tab=` then sessionStorage then `'chat'`) [OBSERVED — `MobileTripTabs.tsx:257-266`, `MobileTripDetail.tsx:54-60`]. On an iPhone-width viewport ~4–5 pills are visible; Polls and Tasks — her two best group features — live off-screen right [SIMULATED RISK]. 8 tabs is at the upper bound but defensible _if_ the default tab showcased aggregate value (an overview/itinerary), which Chat-by-default does not. Tier-1 pre-mount (chat/calendar/concierge) + idle-mount Tier 2 makes switching fast [OBSERVED — `MobileTripTabs.tsx:165-224`].

| Feature               | Expected goal         | Tried            | What happened (per code)                                                                                                                                                                                                                                                                                                       | Friction                        | Bug/UX issue                                                                | Sev                 | Revenue impact                              | Retention impact         | Recommended fix                                                                             |
| --------------------- | --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------- | ------------------- | ------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| Onboarding            | Reach value fast      | Tour → create    | 10 screens (file claims 5, brief says 9); skippable; ends at Create Trip [OBSERVED — OnboardingCarousel.tsx:1-7,37]                                                                                                                                                                                                            | 9 Continue taps if dutiful      | Drifted screen count = nobody owns this surface                             | Med                 | Low                                         | Med (pre-value drop-off) | Cut to 4 screens; deep-link tour cards into the real demo trip                              |
| Trip creation         | Trip in <2 min        | Tokyo trip       | Clean modal, sane required fields [OBSERVED — ground-truth §4]                                                                                                                                                                                                                                                                 | Timezone field                  | —                                                                           | Low                 | —                                           | +                        | Keep                                                                                        |
| Invites (organizer)   | One obvious share CTA | Find invite      | Invite buried in ⋮ overflow sheet; sibling "Share" sends preview-not-join link [OBSERVED — MobileTripDetail.tsx:591-641,258-294]                                                                                                                                                                                               | 3 taps + icon hunt              | Growth action hidden; two near-identical share actions                      | **High**            | High (indirect)                             | High                     | Persistent "Invite friends" button in header/empty states until member_count > 1            |
| Invites (friend side) | 1-tap join            | 7 friends        | Preview good; then auth wall + unconditional "Request to Join / Member Approval" + leaked spec copy [OBSERVED — prior verification, JoinTrip.tsx ~914-933]; post-approval trip can be missing from dashboard [OBSERVED — ground-truth §10.6]                                                                                   | Verification email graveyard    | False approval gate; dashboard-missing bug                                  | **Critical**        | High                                        | **Critical**             | Fix copy conditionality; fix trip_members.status drift; guest-mode preview of trip contents |
| Concierge             | AI demo → habit       | 10+ queries      | Great empty-state prompts; confirm cards; **no quota counter rendered** (`_usage` discarded; chip computed but unused) [OBSERVED — AIConciergeChat.tsx:46-50; useConciergeUsage.ts:334-349]; limit = plain text, no CTA, recommends $19.99 tier over $9.99 [OBSERVED — useConciergeMessages.ts:42-54; featurePaywall.ts:48-54] | Blind budget burn               | Quota invisible; dead-end wall; wrong tier anchor; `/settings` not checkout | **High**            | **Critical** (best wall, worst funnel)      | Med                      | Render the existing chip; make limit message a tappable Trip Pass/Explorer checkout card    |
| Smart Import          | Flights in 1 paste    | ANA email        | All entry points Explorer+ gated: calendar button paywall-toasts; concierge intent disabled on free [OBSERVED — MobileGroupCalendar.tsx:96-153; AIConciergeChat.tsx:434-446]                                                                                                                                                   | Manual entry only on free       | Magic moment paywalled before first taste                                   | High                | High (blocks the "aha" that sells Explorer) | Med                      | 2–3 free imports per trip, then gate                                                        |
| Places/Basecamp       | Shared map list       | Save 10 spots    | "Base Camps" + "Explore" sub-tabs; realtime sync; feeds concierge [OBSERVED — PlacesSection.tsx:189-246]                                                                                                                                                                                                                       | Jargon labels                   | `console.log` in committed code (lines 116,126)                             | Low                 | —                                           | Med                      | Rename Explore → "Saved Places"; first-run tooltip for Basecamp                             |
| Polls                 | Decide together       | Saturday night   | Full-featured, realtime, AI-creatable [OBSERVED — ground-truth §6]                                                                                                                                                                                                                                                             | Off-screen tab position         | Mobile polls renders `CommentsWall` (naming debt)                           | Low                 | —                                           | +                        | Surface poll cards in chat + push                                                           |
| Tasks                 | Distribute work       | Assign 7 friends | Multi-assign, filters [OBSERVED — ground-truth §6]                                                                                                                                                                                                                                                                             | Can't assign non-joined friends | —                                                                           | Low                 | —                                           | Med                      | Assignable placeholder members pre-join                                                     |
| Payments              | Splitwise-killer      | 12 expenses      | Full split/balance/settle UI; Venmo deeplink [OBSERVED — PaymentsTab.tsx]; 3-split cap unenforced [OBSERVED — prior verification]; settlement double-credit race [OBSERVED — ground-truth §10.1]                                                                                                                               | None (that's the problem)       | Race = double-credit between friends; cap generates no upsell               | **Critical** (race) | Med (cap never fires)                       | High if race fires       | Idempotency key + atomic settle; decide cap: enforce softly or delete from pricing table    |
| Media                 | Shared album          | Photo dump       | 5 photos free counted trip-wide per uploader; organizer upgrade doesn't unlock guests [OBSERVED — prior verification]; quotas advisory-only [OBSERVED — §10.7]                                                                                                                                                                 | Wall on others' photos          | Group-hostile limit semantics                                               | High                | Negative (teaches "upgrading doesn't help") | High                     | Per-user count or pooled-by-trip-owner-tier                                                 |
| Chat                  | Replace group text    | Adopt for trip   | Stream-powered, rich; default tab; empty on arrival [OBSERVED — MobileTripTabs.tsx, MobileTripDetail.tsx:54-60]                                                                                                                                                                                                                | Cold start vs iMessage          | Default tab = weakest surface                                               | Med                 | —                                           | High                     | Default first-visit tab → Calendar/overview; seed chat with system welcome + itinerary card |
| Notifications         | Re-engage passives    | Expect nudges    | Categories, push opt-in; no batching, no per-trip mute [OBSERVED — §6, §10.4]                                                                                                                                                                                                                                                  | Firehose or silence             | —                                                                           | Med                 | —                                           | High                     | Daily batched digest push per trip                                                          |
| Export/recap          | Share final plan      | PDF              | Full client pipeline; Explorer+ gate [OBSERVED — MobileTripDetail.tsx:146-255; §7]                                                                                                                                                                                                                                             | Paywall, but well-placed        | —                                                                           | Low                 | + (good gate)                               | Low                      | Reframe as "Send itinerary to the group"                                                    |
| Re-engagement         | Pull group back       | Wait 2 weeks     | daily-digest is request-driven, not outbound [OBSERVED — daily-digest/index.ts:37-60]; reminder crons unverified [HYPOTHESIS]; zero analytics to measure [OBSERVED — §9]                                                                                                                                                       | Nothing initiates return        | Biggest missing system                                                      | **High**            | High                                        | **Critical**             | Scheduled weekly trip email (countdown, unpaid balances, open polls)                        |
| Upgrade path          | Take her money        | Hit walls        | Concierge wall dead-ends; Trip Pass absent in-app [OBSERVED — prior verification]; iOS = "Subscribe on web" [OBSERVED — §7]                                                                                                                                                                                                    | 5+ context switches to pay      | No wall sells the right SKU                                                 | **Critical**        | **Critical**                                | —                        | Trip Pass purchase card at concierge/media/import walls (web); contextual copy on iOS       |

---

## E. Emotional Reaction

- **Confident:** Trip creation, calendar entry, logging payments — the organizer's solo loop is smooth and fast.
- **Impressed:** Concierge first 10 queries (hotel cards near Basecamp, poll creation by prompt, "Save to Trip?" cards) — this is the moment she screenshots to the group text. Skeleton states and tab warmth feel premium [OBSERVED — MobileTripTabs tiering].
- **Confused:** "Base Camps / Explore" labels; why "Member Approval" appears on her friends' join screens when she never turned approval on; why the concierge just… stopped, with no counter and no button.
- **Annoyed:** Smart Import teased then gated; invite hidden in the ⋮ menu; her upgrade not helping friends' media walls; being told to subscribe to a $19.99 plan by a chat message with no link.
- **Would abandon:** If a friend says "it told me my join needs approval?" or if a settle-up ever double-credits. The media wall pushes the group to iCloud albums by trip day 2.
- **Would invite others:** Yes — she already did, that's the persona. The question is whether the _friends_ stay, and the code says most touchpoints push passives back to iMessage.

**Net:** Impressed organizer, under-served group. The app currently sells to Maya and accidentally repels the seven people who determine whether she keeps using it.

---

## F. Conversion Scores

- **Activation: 7/10.** Single-player value is real: trip + calendar + places + AI in one sitting, ~4 taps from signup to create if she skips the tour. Docked for 10-screen tour and manual-only flight entry on free. **Key question answered: yes, the organizer gets meaningful value before friends join** — the concierge + calendar + places loop works solo. But the product's _retention_ design assumes the group arrives.
- **Invite: 4/10.** She sends invites despite the buried CTA (high intent), but the friend-side funnel leaks at four observed/cited points (auth wall, false approval copy, dashboard-missing bug, empty-chat landing). [SIMULATED RISK] 4–5 of 7 convert; ≤3 become weekly actives.
- **Day-7 retention: 5/10 (organizer), 2/10 (friends).** Maya returns to finish planning (sessionStorage resume helps). Friends have no outbound pull — digest is request-driven, reminder crons unverified, no batched push [OBSERVED/HYPOTHESIS as cited in C.15]. And no one can measure it: PostHog has zero events [OBSERVED — §9].
- **Paid conversion: 2/10.** Willingness to pay exists; the machinery doesn't. The only limits that fire are the concierge wall (invisible quota → dead-end text recommending the wrong tier) and the media wall (which teaches that upgrading _doesn't_ fix the group's problem). Splits cap never fires. Trip Pass — the obviously-correct SKU for "one Tokyo trip" — is unreachable from inside the app. iOS adds "Subscribe on web."
- **NPS: −5.** Promoter energy from the concierge and polls; detractor energy from friend-side embarrassments ("why does your app say I need approval?"). She'd say "really promising, slightly janky for the group" — a 6 or 7, i.e., passive.

**Would she pay?** Yes — **Trip Pass over subscription.** "The one who always plans" takes 1–2 big trips a year; $39.99 once beats $9.99/mo she'll forget to cancel. **What creates willingness:** Smart Import demonstrated (not gated), an itinerary PDF/share at the end, and unlimited concierge during the planning crunch. **What limit actually triggers:** only the concierge 10-query wall — and it currently dead-ends. **Natural CTA:** PDF-export gate at step 14 and a Trip Pass card at the concierge wall. **Annoying CTA:** the media wall (punishes guests for her tier), the Smart Import gate before first taste, and any `/settings` redirect posing as a purchase flow.

---

## G. Top 5 Fixes

1. **Replace the dead-end concierge limit message with an in-chat purchase card (Trip Pass $39.99 / Explorer $9.99, tappable, web checkout)** — because Maya hit her only real limit blind (quota chip computed in `useConciergeUsage.ts:334-349` but never rendered; plain-text wall in `useConciergeMessages.ts:42-54` recommending the $19.99 tier with no link), causing the product's highest-intent monetization moment to convert at ~zero.
2. **Replace the unconditional "Request to Join / Member Approval" JoinTrip copy (and leaked spec text) with state-aware copy, and fix the post-approval dashboard-missing bug (trip_members.status drift)** — because Maya's friends failed at the one-tap join that the entire group product depends on, causing direct viral-loop loss and "your app is broken" social damage to the organizer [OBSERVED — JoinTrip.tsx ~914-933; ground-truth §10.6].
3. **Replace the ⋮-buried invite with a persistent "Invite your group" CTA (header button + banner on every tab while member_count == 1)** — because Maya had to hunt an overflow menu for the app's most important action, and the adjacent "Share" action sends a preview link instead of a join link [OBSERVED — MobileTripDetail.tsx:591-641, 258-294], causing avoidable top-of-funnel loss on every new trip.
4. **Replace the trip-wide-per-uploader-tier 5-photo media cap with per-user (or organizer-pooled) counting, and make the first-visit default tab Calendar/overview instead of empty Chat** — because Maya's friends hit an upload wall on photos they didn't take and landed in an empty room that loses to iMessage by default [OBSERVED — uploadService.ts:80-111 (prior verification); MobileTripDetail.tsx:54-60], causing the group to fall back to iCloud albums and the group text — i.e., churn of the whole pod.
5. **Replace "no outbound loop" with a scheduled per-trip weekly digest (countdown + open polls + unpaid balances + unassigned tasks) via the existing send-email-with-retry/push infra, and turn on PostHog** — because nothing in the code initiates a return visit (daily-digest is request-driven [OBSERVED — daily-digest/index.ts:37-60]) and zero analytics events exist to even detect the drop-off [OBSERVED — ground-truth §9], causing silent week-2 death of trips that were successfully created and invited.

---

_Evidence labels used throughout: [OBSERVED — cite] = verified in code/docs this session or via the ground-truth brief / prior-persona verifications; [SIMULATED RISK] = realistic persona friction inferred from real flows; [HYPOTHESIS — needs live test] = requires a running app or real users._
