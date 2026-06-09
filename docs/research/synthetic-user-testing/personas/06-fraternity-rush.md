# Persona 6: Tucker "T-Bone" Maddox — Fraternity Rush Week Chair

> Chaos-stress-test persona. 60 active brothers + ~80 rushees, 4–6 events/day across campus,
> constant last-minute changes, pranks, spam, lost links. 100% mobile. Evidence labels:
> `[OBSERVED — cite]`, `[SIMULATED RISK]`, `[HYPOTHESIS — needs live test]`. Primary source:
> `docs/research/synthetic-user-testing/evidence/product-ground-truth.md` ("ground-truth").

## A. Profile

- **Name / role:** Tucker "T-Bone" Maddox, Rush Chair, Sigma-something, big state school.
- **Age range:** 20 (junior).
- **Tech comfort:** High but **zero patience** — lives in GroupMe/Snap/Instagram; if an app needs
  more than ~30 seconds to show value he closes it. Has never read an onboarding carousel in his life.
- **Planning style:** Chaotic, last-minute, verbal-first. The "schedule" is a screenshot of a Notes
  app page until Wednesday of rush week. Changes venues 2 hours before events.
- **Pain points:** GroupMe is one undifferentiated firehose; rushees lose the schedule; nobody knows
  who's on setup duty; brothers spam memes over critical announcements; invite links get screenshotted
  and reposted publicly.
- **Budget sensitivity:** EXTREME. Will not spend $1 of his own money on software. The chapter
  treasury _might_ approve a one-time expense if the treasurer signs off, but a personal $9.99/mo
  subscription is dead on arrival.
- **Why adopt:** One link that gives every rushee the live schedule + map; broadcast-grade
  announcements; tasks so setup crews stop no-showing.
- **Why reject:** Any sign-up friction for rushees, notification spam that makes brothers mute the
  whole app, or a paywall that hits mid-week.

## B. Jobs-to-be-Done

1. When I am **building the rush week schedule the night before it starts**, I want to **dump 25
   events across 7 days with locations into one shared calendar**, so I can **stop answering "where's
   tonight's thing" 200 times**.
2. When I am **onboarding 80 rushees who I'll never see again if it's hard**, I want to **drop one
   link in the GroupMe that gets them to the schedule in under a minute**, so I can **keep them in
   the funnel instead of losing them at a login wall**.
3. When I am **changing a venue 90 minutes before an event**, I want to **push one update that
   everyone actually sees**, so I can **avoid 30 guys showing up at the old house**.
4. When I am **assigning setup/cleanup crews**, I want to **assign tasks to specific brothers with
   visible accountability**, so I can **call out who flaked**.
5. When I am **dealing with a prankster brother spamming the chat**, I want to **mute or remove him
   in two taps**, so I can **keep the channel usable for rushees**.

## C. Full User Journey (16 steps)

**1. Discovery.** Tried: lands on marketing page from a brother's link.
What happens: unauthenticated visitors get `src/MarketingApp.tsx` / `FullPageLanding.tsx` with
pricing, FAQ, sign-up modal; demo mode `app-preview` gives full mock access
`[OBSERVED — ground-truth §3]`. Friction: "group travel" framing; rush week is an _event_, and
Tucker has to figure out the Consumer/Pro/Event distinction himself `[SIMULATED RISK]`.
Verdict: PASS — gets the idea, especially via demo preview.

**2. Sign-up / onboarding.** Tried: Google OAuth on phone.
What happens: email+password, Google, Apple; email verification required post-signup; invite context
preserved through OAuth redirects; then a **9-screen onboarding carousel**, skippable
`[OBSERVED — ground-truth §3]`. Friction: Tucker skips the carousel on screen 1; rushees doing
email+password hit a verification step mid-GroupMe-scroll `[SIMULATED RISK]`. Verdict: PASS for
Tucker, FRICTION at rushee volume.

**3. Trip/event creation.** Tried: create "Rush Week 2026".
What happens: `CreateTripModal` offers Consumer (default) / Pro / Event; Event shows "Create New
Event" with organizer name and timezone `[OBSERVED — src/components/CreateTripModal.tsx:403,437,444]`.
Pro is gated to Frequent Chraveler (1 free trial on Free); **Event is the fit and Free gets 3
lifetime events** (`src/billing/entitlements.ts:296-302`); advertised 100/200 attendee caps have
**no enforcement call sites** `[OBSERVED — ground-truth §4]`. Friction: the right choice (Event)
is the third tab, not the default; choosing Consumer instead silently changes the whole permission
story (see step 12/D). Verdict: PASS — one free Event covers rush week; 3 lifetime events covers
fall + spring rush + one formal, then wall.

**4. Inviting 60 brothers + 80 rushees via GroupMe link.** Tried: generate link, paste in GroupMe.
What happens: shareable `/join/{token}` or `/j/{code}`; invitee sees trip preview (name, dates,
cover, member count) before auth, then sign-in gate, then join or approval queue
`[OBSERVED — ground-truth §5]`. The invite UI exposes exactly two controls: require-approval
(default ON, "All trip types require approval (enforced on backend)") and expire-in-7-days (default
OFF) `[OBSERVED — src/components/InviteModal.tsx:29-33]`. **There is no max-uses control anywhere in
the product UI** — the insert omits `max_uses` entirely (`current_uses: 0`, `expires_at` or null)
`[OBSERVED — src/hooks/useInviteLink.ts:185-195]`. `JoinTrip` _can_ render an `INVITE_MAX_USES`
error (`src/pages/JoinTrip.tsx:784`) and the DB column exists (`types.ts`), but nothing client-side
ever sets it — a leaked rush link is unlimited-use until manually regenerated. Approval semantics:
"Consumer trips: any member can approve. Pro/Event: creator/admins only"
`[OBSERVED — InviteModal.tsx:30]`. Friction: on an Event trip, **Tucker personally approves ~140
join requests on his phone**; on a Consumer trip, any prankster brother can approve anyone
`[SIMULATED RISK]`. And the known bug: **approved members can be missing from their dashboard**
(trip_members.status drift) `[OBSERVED — ground-truth §10.6]` — a rushee gets "approved" and then
can't find the trip. Verdict: FAIL at this volume — approval bottleneck or zero control, pick one.

**5. Multiple events/locations per day.** Tried: 25 calendar entries with venues.
What happens: month/day/list views, event create with place autocomplete; Smart Import can ingest
the Notes-app screenshot of the schedule `[OBSERVED — ground-truth §6]`. Friction: 25 manual entries
on mobile is tedious; Smart Import screenshot path is the savior if he finds it
`[SIMULATED RISK]`; import retries can duplicate shared trip data `[OBSERVED — ground-truth §10.8]`.
Verdict: PASS with effort.

**6. AI Concierge.** Tried: "find late-night food near the house for 40 people."
What happens: 38 tools, writes go through "Save to Trip?" confirm card; **Free = 10 queries/user/trip**
`[OBSERVED — ground-truth §6, §7]`. Friction: 10 queries is gone in one planning session; voice is
dictation-only despite marketing ("Realtime voice is disabled…") `[OBSERVED — ground-truth §10.2]`.
Verdict: NEUTRAL — nice demo, hits the wall fast, Tucker won't pay to lift it.

**7. Places / Basecamp.** Tried: set the fraternity house as Basecamp, save event venues.
What happens: Basecamp = trip home base used for distances and concierge context; map + list views
`[OBSERVED — ground-truth §6]`. Friction: any of the 60 members can change/delete Basecamp —
consumer_member has wildcard write/delete including basecamp
`[OBSERVED — src/types/permissionMatrix.generated.ts:36-43]`. A prank Basecamp move to the rival
house is two taps `[SIMULATED RISK]`. Verdict: PASS functionally, FAIL on lockdown.

**8. Polls.** Tried: "theme for Thursday: vote."
What happens: options, auto/manual close, anonymous option, change vote, realtime counts
`[OBSERVED — ground-truth §6, src/components/poll/]`. Friction: any member can delete the poll
(wildcard delete) `[OBSERVED — permissionMatrix.generated.ts:40]`. Verdict: PASS — genuinely good
fit for fraternity decision-making.

**9. Tasks + group reminders.** Tried: assign setup crew, set a reminder.
What happens: multi-assignment, due dates, filters (mine/unassigned/overdue), poll mode
`[OBSERVED — ground-truth §6]`. **No reminder/nudge feature exists in the todo components** — grep
for `reminder|nudge` across `src/components/todo/` returns nothing `[OBSERVED — grep, 0 matches]`;
"reminders" exist only as a notification category elsewhere. Friction: Tucker can't schedule "ping
the setup crew at 4pm"; and any brother can delete the task list `[OBSERVED — permission matrix]`.
Verdict: PARTIAL — assignment works, accountability nudges don't exist.

**10. Payments.** Tried: log the keg/food costs, split among brothers.
What happens: equal/custom split, who-owes-whom, settle-up is **Venmo deeplink/manual only — no
in-app money movement**; **Free = 3 payment splits per trip** `[OBSERVED — ground-truth §6, §7]`.
Friction: 3 splits is exhausted by day 2 of rush; the documented **settlement double-credit race**
exists on concurrent settles `[OBSERVED — ground-truth §10.1]`. Verdict: FAIL for this use —
chapter expenses go back to the treasurer's spreadsheet.

**11. Media.** Tried: 60 guys upload event photos/videos.
What happens: grid + lightbox, compression pipeline, share-sheet ingestion on iOS; **Free = 500 MB,
but storage quotas are advisory-only and the bucket isn't signed-URL enforced**
`[OBSERVED — ground-truth §6, §7, §10.7]`. Friction: quota will be blown past day 1 with no hard
block (also a revenue leak for Chravel); any member can presumably remove others' media via the
wildcard delete `[SIMULATED RISK — matrix covers tasks/polls/calendar/basecamp/links; media path
needs live test]`. Verdict: PASS for users, problem for the business.

**12. Chat at 60-person volume.** Tried: one channel, 60 brothers, meme storms.
What happens: Stream Chat with threads, reactions, pins, mentions, search; **per-role channels and
broadcasts are Pro-only** `[OBSERVED — ground-truth §6]` — a Consumer/Event rush trip is one flat
channel for everyone. Moderation exists (see §D). Friction: pinned announcements drown in 400
messages/night; recently-fixed reaction/read-receipt storms are exactly the load 60 reaction-happy
guys generate — regression watch `[OBSERVED — ground-truth §10 "recently fixed"]`; missing
idempotency keys on chat mutations mean retries can duplicate messages on bad campus Wi-Fi
`[OBSERVED — ground-truth §10.1]`. Verdict: PARTIAL — usable, but announcements vs. memes has no
structural separation below Pro.

**13. Notifications (noise!).** Tried: survive night one.
What happens: in-app dialog with categories, PWA/native push opt-in — **no per-trip mute, no
batching/grouping** `[OBSERVED — ground-truth §6, §10.4; grep of NotificationsDialog.tsx shows no
mute control]`. At scale, **notification fanout blocks the INSERT transaction** (documented at
4,000 members → 12,000 synchronous rows) and there is **no hot-trip realtime isolation** — one hot
trip saturates realtime `[OBSERVED — ground-truth §10.4, §10.5]`. At 140 people × 400 messages a
night, every member's only escape is muting Chravel at the OS level `[SIMULATED RISK]`, which kills
the venue-change announcement (JTBD #3). Verdict: FAIL — this is the persona's single biggest
abandon trigger.

**14. Reviewing the week schedule.** Tried: show a rushee "what's tomorrow."
What happens: calendar month/day/list views; Events get agenda/lineup surfaces
(`src/pages/EventDetail.tsx`) `[OBSERVED — ground-truth §6]`. PDF export is Explorer+ — the
"screenshot the schedule and post it" workflow is blocked on Free `[OBSERVED — ground-truth §7]`.
Verdict: PASS in-app, FRICTION for sharing outward.

**15. Mid-week updates.** Tried: venue change at 5pm for a 7pm event.
What happens: edit the calendar event; realtime propagates; but with no broadcast tier below Pro
and no reliable push (step 13), confirmation that 140 people saw it is impossible
`[SIMULATED RISK]`. Concierge itinerary writes need per-user confirm cards — fine for Tucker,
invisible to everyone else. Verdict: PARTIAL — the edit is easy; the _delivery guarantee_ isn't there.

**16. Pay-or-upgrade.** Tried: hits the AI cap, split cap, and 4th-event wall.
What happens: `PlusUpsellModal` ("Start Free Trial", 14-day, "Maybe Later"), Trip Passes (Explorer
45-day $39.99 / FC 90-day $74.99), Pricing copy "Start free. Upgrade when your trip gets serious."
`[OBSERVED — ground-truth §7]`. **Pro-tier CTAs are `mailto:` links — no self-serve checkout**
`[OBSERVED — ground-truth §7]`; a 20-year-old will never email billing@chravelapp.com. Friction:
the natural buyer (chapter treasury) has no purchasable object — no "group/org one-time pass" the
treasurer can expense; Trip Passes are per-user. Verdict: FAIL to convert — he downgrades behavior
instead of upgrading tier.

## D. Feature-by-Feature Findings

| Feature           | Expected goal                 | Tried                    | What happened                                                                                                                                                                                                                                                                                                                                                               | Friction                                                                                                                                                                                                                   | Bug/UX issue                               | Severity                  | Revenue impact                               | Retention impact                | Recommended fix                                                                                    |
| ----------------- | ----------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------- | -------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| Invite links      | One safe link for GroupMe     | Generated + "leaked" it  | Only require-approval (default ON) + 7-day-expiry toggles; **no max-uses in UI** despite DB support; regenerate exists `[OBSERVED — InviteModal.tsx:32-33, useInviteLink.ts:185-195]`                                                                                                                                                                                       | Leaked link = unlimited joins or 140 manual approvals                                                                                                                                                                      | Max-uses dead column; approval bottleneck  | HIGH                      | Medium (event caps unenforced too)           | HIGH                            | Expose max-uses + one-tap "revoke & reissue"; bulk-approve                                         |
| Join/approval     | Rushees get in fast           | 80 rushees join          | 7 typed error states incl. APPROVAL_PENDING, TRIP_FULL `[OBSERVED — ground-truth §5]`; approved member can be missing from dashboard `[OBSERVED — §10.6]`                                                                                                                                                                                                                   | Approved-but-invisible trip is fatal for a one-week event                                                                                                                                                                  | Known status-drift bug                     | CRITICAL                  | High                                         | CRITICAL                        | Fix trip_members.status drift before any event-scale push                                          |
| Permissions       | Chair locks things down       | Prankster test           | **consumer_member: read/write/delete on `*`, admin:false** `[OBSERVED — permissionMatrix.generated.ts:36-43]` — any of 60 brothers can delete any task/poll/calendar event/link/basecamp                                                                                                                                                                                    | No member/viewer split below Pro; no "lock trip" switch                                                                                                                                                                    | Permission-abuse surface by design         | HIGH                      | Medium (forces Pro, but Pro has no checkout) | HIGH                            | Add owner-only-delete or "restricted mode" toggle on consumer/event trips                          |
| Chat moderation   | Kill spam fast                | Mod actions on a spammer | **Tools exist:** `hide_message`, `shadow_ban_user`, `mute_user`, `ban_user` via `stream-moderation-action`, gated to creator/trip_admins/admin-organizer-owner roles, audit-logged `[OBSERVED — src/services/moderationService.ts:4; supabase/functions/stream-moderation-action/index.ts:99-151]`; per-user block + report for everyone `[OBSERVED — TripChat.tsx:44,169]` | Block is client-side filtering of the viewer's own feed; only admins get real moderation — fine, but on Consumer trips "any member can approve" undermines ban (banned guy gets re-approved by a buddy) `[SIMULATED RISK]` | Approval/ban asymmetry                     | MEDIUM                    | Low                                          | MEDIUM                          | On consumer trips, restrict approvals to non-banned-actor admins once any moderation action exists |
| Notifications     | See venue changes, mute memes | Night-one volume         | No per-trip mute, no batching `[OBSERVED — §6, §10.4]`; fanout blocks INSERT at scale `[OBSERVED — §10.4]`; no hot-trip isolation `[OBSERVED — §10.5]`                                                                                                                                                                                                                      | OS-level mute is the only escape → critical announcements die                                                                                                                                                              | Architecture gap                           | CRITICAL                  | High (churn)                                 | CRITICAL                        | Per-trip mute + priority class ("announcement bypasses mute"); async fanout                        |
| Calendar/schedule | 25 events, 7 days             | Manual + Smart Import    | Works; screenshot import exists `[OBSERVED — §6]`; import retries can duplicate `[OBSERVED — §10.8]`                                                                                                                                                                                                                                                                        | Mobile bulk entry tedious                                                                                                                                                                                                  | Idempotency gap                            | MEDIUM                    | Low                                          | MEDIUM                          | "Paste your schedule" bulk-create path surfaced at trip creation                                   |
| Tasks             | Crew accountability           | Assign + nudge           | Assignment/filters good; **no reminders/nudges in todo at all** `[OBSERVED — grep src/components/todo/, 0 matches]`                                                                                                                                                                                                                                                         | Can't ping flakes                                                                                                                                                                                                          | Missing feature vs. persona's mental model | MEDIUM                    | Low                                          | MEDIUM                          | Task due-time push + "nudge assignee" button                                                       |
| Payments          | Chapter costs                 | Split keg costs          | 3 splits/trip on Free `[OBSERVED — §7]`; Venmo deeplink only; settlement double-credit race `[OBSERVED — §10.1]`                                                                                                                                                                                                                                                            | Cap hit day 2                                                                                                                                                                                                              | Race is a real-money bug                   | HIGH (bug)                | Medium                                       | LOW (he reverts to Venmo group) | Atomic settlement + idempotency keys first; rethink split cap as upsell                            |
| Media             | Party photos                  | 60 uploaders             | Works; 500 MB quota advisory-only, bucket not signed-URL enforced `[OBSERVED — §10.7]`                                                                                                                                                                                                                                                                                      | None for users                                                                                                                                                                                                             | Quota leak + access-control gap            | MEDIUM (security/revenue) | High (free unlimited storage)                | n/a                             | Enforce quota server-side + signed URLs                                                            |
| AI Concierge      | Quick answers                 | 10 free queries          | Confirm-card writes are safe `[OBSERVED — §6]`; cap reached in one session; voice = dictation-only `[OBSERVED — §10.2]`                                                                                                                                                                                                                                                     | Cap copy drift risk ("10/month" vs 10/user/trip) `[OBSERVED — §7 ⚠️]`                                                                                                                                                      | Entitlement oversells voice                | MEDIUM                    | Medium (trust)                               | LOW                             | Fix voice copy; per-trip cap meter visible                                                         |
| Events tier       | Free rush event               | Created 1 of 3 lifetime  | 3 lifetime events on Free; attendee caps (100/200) **unenforced** `[OBSERVED — §4]`                                                                                                                                                                                                                                                                                         | 4th event = paywall with mailto-only Pro path                                                                                                                                                                              | Cap enforcement absent                     | MEDIUM                    | High (140 attendees ride free)               | n/a                             | Enforce caps; sell an "Event Pass" SKU                                                             |

**Abuse/moderation assessment (dedicated):** Moderation tooling is real and better than expected —
four-action ladder (hide/shadow-ban/mute/ban) executed server-side with service role, permission
checked against trip creator, `trip_admins`, member role in `['admin','organizer','owner']`, and an
RPC `has_admin_permission`, all written to `admin_audit_logs`
`[OBSERVED — supabase/functions/stream-moderation-action/index.ts:95-151]`. Telemetry emits
`moderation_action` executed/failed events `[OBSERVED — moderationService.ts:30-61]` (though PostHog
has ingested zero events ever, so no one is watching `[OBSERVED — ground-truth §9]`). The holes:
(1) **content-level free-for-all** — moderation governs chat, but consumer_member wildcard delete
governs everything else, so a banned-from-chat prankster can still delete the calendar
`[OBSERVED — permissionMatrix.generated.ts:36-43]`; (2) **no lockdown switch** — no "announcements
only" or read-only mode for the channel below Pro role-channels; (3) **re-entry** — on consumer
trips any member can approve joins, so removal isn't sticky `[OBSERVED — InviteModal.tsx:30]`;
(4) member **block** is personal-feed filtering, not removal `[OBSERVED — TripChat.tsx:835-839]`.
Net: the chair can punish a spammer but cannot _prevent_ chaos.

## E. Emotional Reaction

- **Confident:** during Event creation and calendar build — the demo preview and trip preview link
  are genuinely slick.
- **Impressed:** that mod actions exist at all (GroupMe has nothing), and by the join-link preview
  ("Trip starts in X days") which rushees will actually tap.
- **Confused:** Consumer vs. Pro vs. Event at creation; why "voice concierge" is dictation; why an
  approved rushee says he can't see the trip (`[OBSERVED — §10.6]` would read as "your app lost him").
- **Annoyed:** approving join requests one-by-one between events; no per-trip mute while his phone
  melts; the 3-split payment cap; "email us" as the upgrade path.
- **Would abandon:** the morning after night one, when half the chapter has OS-muted the app and his
  venue change reaches nobody — back to GroupMe `@everyone`.
- **Would invite others:** yes, ironically — the invite link is the best part; he'd burn his free
  Event and tell the next chair "cool calendar, chat is a mess."

## F. Conversion Scores

- **Activation: 7/10** — sign-up, Event creation, link sharing, and calendar all work on the free
  tier; the demo preview lowers the wall. Loses points for the type-picker confusion and the
  approval queue. `[SIMULATED RISK + OBSERVED flows]`
- **Invite: 8/10** — one-link join with pre-auth preview is built for the GroupMe paste; viral
  mechanics are genuinely strong `[OBSERVED — ground-truth §5]`. Capped by the approval bottleneck
  and the approved-but-invisible bug `[OBSERVED — §10.6]`.
- **Day-7 retention: 3/10** — rush week _is_ 7 days, and the notification architecture
  (no per-trip mute, no batching, fanout blocking, no hot-trip isolation) is misaligned with
  exactly this trip shape `[OBSERVED — §10.4, §10.5]`. The single channel + wildcard-delete chaos
  compounds it.
- **Paid conversion: 1/10** — Tucker personally pays $0, ever. The chapter could pay, but there is
  no SKU shaped like a chapter: Trip Passes are per-user, Pro is mailto-only
  `[OBSERVED — ground-truth §7]`, and every cap he hits (splits, AI, storage) has a free workaround
  (Venmo, stop asking, quota unenforced `[OBSERVED — §10.7]`).
- **NPS: −10** — promoters exist (the calendar/invite experience is real), but the night-one
  notification meltdown and prank-deletion stories produce loud detractors in a population of 140.
  `[HYPOTHESIS — needs live test; PostHog has zero events to check against (§9)]`
- **Would anyone pay?** Not Tucker. The **chapter treasury** would pay a one-time $50–100 for a
  "Rush Week event pass" (admin lockdown + announcement priority + >100 attendees + unlimited
  splits) if it's expensable with a receipt — exactly the Trip Pass mechanic, but org-scoped and
  self-serve, not per-user and not `mailto:`.
- **Willingness-to-pay creators:** admin control (lock deletes, announcements-only mode),
  guaranteed-delivery announcements, attendee-cap headroom. Not AI, not storage, not voice.
- **CTA natural vs. annoying:** Natural — Trip Pass framing at the moment he creates his 4th
  lifetime event ("this rush needs a pass"). Annoying — `PlusUpsellModal` "Start Free Trial"
  interrupting him mid-week at the AI/split caps; a 14-day consumer trial means nothing to a
  7-day event `[OBSERVED — §7 paywall surfaces]`.

## G. Top 5 Fixes

1. **Replace the OS-mute death spiral with per-trip mute + an "announcement" priority class that
   bypasses it**, because Tucker failed at _delivering a venue change to 140 people on night two_
   (no per-trip mute, no batching `[OBSERVED — §10.4]`), causing whole-cohort churn after exactly
   one event — the highest-volume trips become the fastest uninstalls.
2. **Replace the invisible/unset `max_uses` with an exposed max-uses + one-tap revoke-and-reissue
   on the invite modal**, because Tucker failed at _containing a rush link reposted publicly_
   (UI writes no `max_uses`; only the dead error path exists
   `[OBSERVED — useInviteLink.ts:185-195; JoinTrip.tsx:784]`), causing uncontrolled joins to a
   trip whose advertised attendee caps are also unenforced `[OBSERVED — §4]` — free riders at scale
   plus a safety/abuse exposure.
3. **Replace consumer_member wildcard delete with a trip-level "restricted mode" (delete = author
   or admin)**, because Tucker failed at _keeping pranksters from nuking the schedule/Basecamp/polls_
   (`read/write/delete: true on '*'` `[OBSERVED — permissionMatrix.generated.ts:36-43]`), causing
   destroyed trust in the system of record — the one thing that has to survive a fraternity.
4. **Replace one-by-one join approval with bulk approve + auto-approve-with-domain/code option, and
   fix the approved-member-missing-from-dashboard drift first**, because Tucker failed at
   _onboarding 140 people between events_ (approval default ON, Event approvals chair-only
   `[OBSERVED — InviteModal.tsx:29-31]`; status-drift bug `[OBSERVED — §10.6]`), causing rushee
   funnel loss at the exact moment of peak viral intent.
5. **Replace the `mailto:` Pro path and per-user Trip Passes with a self-serve, org-expensable
   "Event Pass" SKU (lockdown + priority announcements + attendee headroom, one receipt)**, because
   Tucker failed at _converting at any cap he hit_ — he won't email billing@chravelapp.com and won't
   personally subscribe (`[OBSERVED — §7: mailto CTAs, per-user passes]`), causing $0 capture from a
   140-person, storage-heavy, unenforced-cap deployment that costs Chravel real money
   `[OBSERVED — §10.7 advisory quotas]`.
