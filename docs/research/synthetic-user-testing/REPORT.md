# ChravelApp Synthetic User Testing Report

**Date:** 2026-06-09 · **Method:** 10 independent persona agents, code-grounded simulation against the
production codebase + audit corpus + PostHog · **Branch:** `claude/sweet-thompson-r5edpd`
**Full persona reports:** `personas/01…10-*.md` · **Evidence:** `evidence/product-ground-truth.md`,
`evidence/posthog-funnel.md`

---

## 1. Executive Summary

**Is the app usable?** Yes — for the organizer, alone. Every persona activated: trip creation, calendar,
places, polls, and the text concierge genuinely work in a first session (activation scores 5–7/10 across
all ten). The single-player loop is real and is the product's strongest asset.

**Is the value prop clear?** For organizers, mostly. For everyone the organizer invites, no. The invitee
side is the weakest surface in the product: a mandatory account wall, leaked spec text shipped as UI copy
on the join page, a false "Member Approval" message shown to every invitee regardless of settings, a
zero-permission guest role, and a documented bug where an approved member's trip never appears on their
dashboard. Eight of ten personas independently identified the invite→join→first-value path as the place
the group dies.

**The single biggest finding: willingness to pay exists in 8 of 10 personas, and the purchase machinery
is broken end-to-end.** Advertised limits aren't enforced (payment splits, attendee caps), the enforced
limit is invisible until it dead-ends (concierge counter computed then discarded), limit walls recommend
the wrong tier, the Trip Pass — the correct SKU for 6 of 10 personas — is only purchasable from the
marketing page and unreachable from any in-app limit moment, one upsell modal's open-handler is wired to
`close`, every Pro CTA is a `mailto:` link, and iOS says "Subscribe on web." Paid-conversion scores:
1–6/10 despite high stated willingness.

**Second biggest finding: the paid Pro layer sells placeholder UI.** `tripConverter.ts:117-130` hardcodes
roster, schedule, room assignments, settlement, per-diem, medical, and compliance to empty for every real
trip — they're populated only in demo mocks. The three B2B personas (team ops, touring, corporate) are the
angriest testers (NPS −25 to −40) precisely because the demo writes checks real trips can't cash.

**Third: you are flying blind.** PostHog has ingested **zero events ever**. A complete typed funnel
(`src/telemetry/`) exists in code and is disabled by one unset env var. Every funnel number in this report
is a hypothesis because the company currently has no observed numbers at all.

**Most likely to convert (today):** bachelorette lead, friend-group organizer, luxury planner (small,
cheap fixes unlock a high-LTV professional). **Deprioritize for now:** touring, team ops, corporate (until
the ops layer is real), run club (wrong product shape), fraternity (no buyer).

**Blocking activation:** invitee-side friction + empty-chat first landing. **Blocking paid conversion:**
the seven broken links in the monetization chain listed in §5/§9.

---

## 2. Methodology

- **Swarm design:** 10 persona agents ran independently and in parallel (two batches of five); none saw
  another's report before writing. Later agents received only _verified file-level facts_ from earlier ones
  (e.g., "tripConverter hardcodes ops arrays empty") to avoid re-verification — never opinions or scores.
- **Grounding:** every agent was required to read `evidence/product-ground-truth.md` (canonical feature
  inventory, tier limits from `src/billing/config.ts`, permission matrix, known-issues register compiled
  from 8 audit docs + DEBUG_PATTERNS + LESSONS + TEST_GAPS), then walk its scenarios in the actual source.
- **Evidence tiers (used throughout):**
  - `[OBSERVED]` — verified in code or audit docs, with file:line citations.
  - `[SIMULATED RISK]` — realistic persona friction inferred from real flows; not a verified defect.
  - `[HYPOTHESIS — needs live test]` — requires a running app or real users.
- **Limits of this method (stated plainly):** no agent rendered the UI, measured latency, or executed a
  purchase. Visual polish, animation quality, real AI answer quality, and actual funnel rates are outside
  scope — §6 and §11 define the live tests that close those gaps. Conversely, this method sees things
  human testers can't: unenforced limits, dead code paths, schema drift, and per-line causes for friction.
- **Synthesis discipline:** persona findings not tied to a concrete flow, screen, or code path were
  dropped or downgraded during synthesis. Conflicting persona opinions are reported in §12 as conflicts,
  not averaged away.

## 3. Persona Test Results (summaries — full reports in `personas/`)

| #   | Persona                   | Activation | Invite | Day-7 | Paid  | NPS     | One-line verdict                                                                                                                |
| --- | ------------------------- | ---------- | ------ | ----- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Luxury trip planner       | 6          | 5      | 5     | **6** | −10     | Would convert within one trip if the dead Export button, deliverable branding, and guest wall are fixed                         |
| 2   | Youth-sports mom          | 6          | 4      | 5     | 2     | −5      | Organizer path nearly simple enough; the other-10-parents path is not                                                           |
| 3   | Team logistics (NBA/NFL)  | 6          | 7      | 3     | 2     | −35     | Right skeleton, hollow ops core; would warn peers off live game ops today                                                       |
| 4   | Bachelorette lead         | **7**      | 5      | 4     | 3     | −5      | Beats group text on decisions; loses to iCloud on photos and Venmo on money; would buy a Trip Pass she can't reach              |
| 5   | Wedding couple            | 6          | 4      | 6/3   | 5     | −5      | Beats the group chat, not the wedding website; $74.99 Pass is almost purpose-built, then the 100-attendee label scares them off |
| 6   | Fraternity rush chair     | **7**      | **8**  | 3     | 1     | −10     | Invite/calendar funnel survives chaos; notifications, permissions, and approvals don't survive night one at 140 people          |
| 7   | Run club organizer        | 5          | 5      | 4     | 1     | −20     | Not overbuilt — mis-assembled: every primitive exists, the weekly container doesn't                                             |
| 8   | Touring road manager      | 5          | 6      | 3     | 2     | **−40** | Multi-city basecamps genuinely work; no day sheet, no receipts, stubbed settlement → back to PDFs                               |
| 9   | Corporate offsite founder | 5          | 6      | 3     | 2     | −25     | No reimbursement concept, orgs can't own trips, mailto-only checkout — company cannot pay even when willing                     |
| 10  | Friend-group organizer    | **7**      | 4      | 5/2   | 2     | −5      | Yes, the organizer gets value before friends join; the friend-side funnel leaks at four cited points                            |

**Top fixes per persona** (full lists in §G of each report): P1 dead PDF button + white-label export ·
P2 join-page copy + iOS purchase dead-end · P3 hide hollow ops tabs + per-person broadcast receipts ·
P4 media-cap semantics + Trip Pass at limit walls · P5 wedding-framed 90-day pass + account-optional guest
view · P6 per-trip mute + member-delete lockdown · P7 duplicate-trip button · P8 day-sheet view + honest
voice labeling · P9 reimbursement mode + self-serve Pro checkout · P10 visible concierge quota + invite CTA
out of the overflow menu.

## 4. Cross-Persona Feature Heatmap

Ratings: ✅ Strong fit · 🟡 Useful but flawed · 🟠 Weak fit · ❓ Confusing · ⬜ Not relevant · ❌ Broken

| Feature                      | P1 Lux | P2 Mom | P3 Team | P4 Bach | P5 Wed | P6 Frat | P7 Run | P8 Tour | P9 Corp | P10 Friend |
| ---------------------------- | ------ | ------ | ------- | ------- | ------ | ------- | ------ | ------- | ------- | ---------- |
| Auth / onboarding            | 🟡     | 🟠     | 🟡      | 🟡      | 🟠     | 🟡      | 🟠     | 🟡      | 🟡      | 🟡         |
| Trip creation                | ✅     | 🟡     | 🟡      | ✅      | ❓     | 🟡      | 🟠     | 🟡      | ❓      | ✅         |
| Invite flow                  | 🟡     | 🟠     | 🟡      | 🟡      | 🟠     | ✅      | 🟡     | 🟡      | 🟡      | 🟠         |
| Chat                         | 🟡     | 🟡     | 🟡      | 🟡      | 🟡     | 🟠      | 🟡     | 🟡      | 🟠      | 🟡         |
| AI Concierge                 | 🟡     | 🟡     | 🟠      | ✅      | 🟡     | 🟠      | 🟠     | 🟠      | 🟡      | 🟡         |
| Calendar                     | ✅     | ✅     | 🟡      | ✅      | 🟡     | ✅      | 🟡     | 🟠      | 🟡      | ✅         |
| Smart Import                 | 🟡     | 🟠     | 🟡      | 🟠      | 🟡     | ⬜      | ⬜     | 🟡      | ✅      | 🟠         |
| Places / Basecamp            | ✅     | 🟡     | 🟡      | ✅      | 🟡     | 🟡      | 🟡     | ✅      | 🟡      | ✅         |
| Polls                        | 🟡     | ✅     | 🟡      | ✅      | 🟡     | ✅      | ✅     | 🟡      | ✅      | ✅         |
| Tasks                        | 🟡     | ✅     | 🟡      | 🟡      | 🟡     | 🟠      | 🟡     | 🟡      | 🟡      | 🟡         |
| Payments                     | 🟠     | 🟠     | ❌      | 🟠      | 🟠     | 🟠      | ⬜     | ❌      | ❌      | 🟠         |
| Media                        | 🟡     | 🟡     | 🟡      | ❌      | 🟠     | 🟡      | ✅     | 🟡      | 🟡      | 🟠         |
| Notifications                | 🟡     | 🟠     | 🟠      | 🟠      | 🟠     | ❌      | 🟠     | 🟠      | 🟠      | 🟠         |
| Profile / settings           | 🟡     | 🟡     | 🟡      | 🟡      | 🟡     | 🟡      | 🟡     | 🟡      | 🟡      | 🟡         |
| Subscription / upgrade flow  | 🟠     | ❌     | ❌      | ❌      | ❓     | ⬜      | 🟠     | ❌      | ❌      | ❌         |
| Mobile navigation            | 🟡     | 🟡     | 🟡      | 🟡      | 🟡     | 🟡      | 🟡     | 🟡      | 🟡      | 🟠         |
| Web navigation               | ✅     | ⬜     | ✅      | ⬜      | ✅     | ⬜      | ⬜     | 🟡      | ✅      | 🟡         |
| Performance / loading states | 🟡     | 🟡     | 🟠      | 🟡      | 🟡     | 🟠      | 🟡     | 🟠      | 🟡      | 🟡         |
| Empty states                 | 🟡     | 🟡     | ❌      | 🟡      | 🟡     | 🟡      | 🟡     | ❌      | ❌      | 🟠         |
| Error states                 | 🟡     | 🟠     | 🟡      | 🟡      | 🟡     | 🟡      | 🟡     | 🟡      | 🟡      | 🟡         |

Reading the columns: the B2B personas' ❌ cluster (payments, upgrade flow, empty states) is the hollow-Pro
problem; the consumer personas' ❌/🟠 cluster (payments, media, notifications, upgrade) is the
monetization-machinery problem. Calendar, polls, and places are green nearly everywhere — those are the
load-bearing features. (Loading/skeleton quality and perceived performance are 🟡 by default here —
implemented in code, unverifiable without live testing. ⬜ in Smart Import/Payments rows = persona never
needed it.)

## 5. Top Bugs and UX Issues

### Critical blockers

**C1. The monetization chain is broken in seven places** (composite — each link cited)

- Where: concierge limit wall, payments, media, Trip Pass, Pro checkout, iOS.
- Personas affected: all 10 (paid conversion 1–6 despite stated willingness in 8).
- Expected: hit a real limit → see a relevant offer → pay in place.
- Actual: (a) concierge usage computed but discarded — `AIConciergeChat.tsx:46-50` destructures it as
  `_usage`; no counter renders [OBSERVED]; (b) limit-hit message is plain text, recommends Frequent
  Chraveler $19.99 instead of Explorer $9.99/25-queries, routes to `/settings` not checkout
  (`useConciergeMessages.ts:42-54`, `featurePaywall.ts:48-54`) [OBSERVED]; (c) the 3-splits free cap has
  **zero enforcement call sites** (`featureTiers.ts:67`, `entitlements.ts:272` vs all of
  `src/components/payments/` and `supabase/functions/`) [OBSERVED]; (d) Trip Pass is mounted only on
  marketing `PricingSection.tsx`, never at a limit wall [OBSERVED]; (e)
  `ProTripDetailDesktop.tsx:571` wires the upsell open-handler to `setShowTripsPlusModal(false)` — it can
  never open [OBSERVED]; (f) all Pro/teams CTAs are `mailto:` links (`ForTeams.tsx`, billing section)
  [OBSERVED]; (g) iOS consumer purchase = "Subscribe on web" dead end (`APPLE_IAP_ENABLED=false`)
  [OBSERVED].
- Why it matters: this is the revenue layer. Validation: PostHog `upgrade_prompt_shown → upgrade_completed`
  funnel once telemetry is on.

**C2. Pro tier sells placeholder UI for real trips**

- Where: `src/utils/tripConverter.ts:117-130` hardcodes `roster/roomAssignments/schedule/settlement/
medical/compliance: []` and zeroed per-diem for every real Supabase pro trip; structured ops data exists
  only in demo mocks; `RoomAssignmentsModal` is display-only; touring `ProSchedule` types
  (`pro.ts:128-138`) have zero rendering call sites [OBSERVED — personas 3, 8, 9].
- Personas: 3, 8, 9 (NPS −25…−40). Expected: the tabs the demo shows. Actual: empty states behind a paid
  tier. Why it matters: demo-to-real bait-and-switch mints detractors among the highest-WTP users.
  Fix: hide unbuilt tabs on real trips until functional. Validation: create a real Pro trip; count
  functional tabs.

**C3. Broadcast fanout schema drift**

- Where: migration `20260512160000_canonical_trip_notification_fanout.sql` attaches the canonical fanout
  trigger to `public.trip_broadcasts` — a table absent from all other migrations and generated types —
  and references `NEW.title`/`NEW.content`; the app writes to `public.broadcasts` (column `message`)
  [OBSERVED — persona 3]. Runtime effect (silent non-delivery of broadcast notifications vs failed
  migration) is [HYPOTHESIS — needs live test].
- Personas: 3, 5, 6, 8 (anyone relying on announcements). Why it matters: "bus call moved" not arriving
  is the worst possible failure for the Pro promise. Validation: send a broadcast on a real trip; check
  notifications table + `get_advisors`/migration state.

**C4. Payment settlement double-credit race + missing idempotency** — pre-known
(PLATFORM_AUDIT_CONSTITUTION) and confirmed still open; persona 4's "Sunday-night settle-up" is exactly
the concurrent pattern that triggers it [OBSERVED — register §10.1]. Money-trust is unrecoverable after
one incident.

**C5. Security register items** — wildcard CORS ×26, demo account super-admin, hardcoded key fallback,
jsPDF CVE, unauthenticated seed-demo-data [OBSERVED — SECURITY_AUDIT_REPORT]. Not persona-visible until
they are catastrophically visible.

### High-priority friction

**H1. The invite/join page sabotages the product's most important moment**

- Leaked spec text shipped as UI copy: _"Sign in with the standard Chravel dark auth flow to request
  access to this trip."_ / _"…remain available in the same dark modal."_ (`JoinTrip.tsx:914-933`); CTA
  always reads "Request to Join" with a "A current trip member will review your request" box regardless of
  `require_approval` (`JoinTrip.tsx:948,961-971`) [OBSERVED — personas 2, 4, 10]. Combined with the
  zero-permission `consumer_guest` role and the approved-member-missing-from-dashboard bug [register
  §10.6], the guest funnel leaks at four points. Affects all 10 personas.
- Fix: rewrite copy, gate approval framing on the actual flag, and fix the status-column drift.

**H2. Free media = 5 photos counted trip-wide against each uploader's tier** (`uploadService.ts:80-111`):
a 10-person group shares one 5-photo album and the organizer upgrading does not unlock her guests
[OBSERVED — persona 4]. Kills the shared-album magnet and teaches that paying doesn't help. Fix: count
per-uploader or unlock by trip owner's tier; offer Trip Pass at the wall.

**H3. No per-trip notification mute, no batching, fanout blocks the INSERT at scale** [OBSERVED — register
§10.4-5; personas 2, 3, 6]. The only escape is OS-level mute, which kills the channel entirely.

**H4. Dead "Export PDF" button** on the itinerary view — `ItineraryView.tsx:68-70` is an empty stub
reachable via `GroupCalendar.tsx:274-291`; its Share button also silently no-ops without
`navigator.share` [OBSERVED — persona 1]. A no-op button on the review surface is a trust breaker; the
working export path elsewhere hardcodes "ChravelApp Recap — The Group Chat Travel App" branding on
client deliverables (`exportPdfClient.ts:1062-1081`), and `customization.sectionOrder` is dead code
(alphabetical re-sort after applying it, `exportPdfClient.ts:364-368`).

**H5. Smart Import — the magic moment — is 100% paywalled for free users**: calendar Import button toasts
a paywall, concierge attachment option disabled (`MobileGroupCalendar.tsx:96-153`,
`AIConciergeChat.tsx:434-446`) [OBSERVED — persona 10]. Free users never taste the differentiator.

**H6. Invite controls are weaker than advertised**: `max_uses` is a dead column — UI never sets it
(`useInviteLink.ts:185-195`) and the `INVITE_MAX_USES` error is unreachable; attendee caps (100/200)
advertised in pricing have no enforcement call sites [OBSERVED — personas 5, 6]. A leaked link = unlimited
joins, while honest wedding couples are scared off by a cap that doesn't exist.

### Medium-priority polish

- **M1.** Concierge "Action Plan JSON" mandate ignored / preference injection on irrelevant queries
  [register]. **M2.** Onboarding is 10 screens; the file's own comment says 5 (`OnboardingCarousel.tsx:37`)
  [OBSERVED]. **M3.** Wrong-tier upsell in `trip_cap_event` (recommends Explorer, which has the same
  3-event cap; `featurePaywall.ts:96-101`) [OBSERVED — persona 5]. **M4.** `PaymentMessage.tsx:38-50` dead
  code fabricates Venmo/Zelle handles from display names — latent money-misrouting if ever wired
  [OBSERVED]. **M5.** Invite CTA buried in the ⋮ overflow with a near-identical "Share" sibling that sends
  a preview link, not a join link (`MobileTripDetail.tsx:258-294,633-641`); default tab is empty Chat
  [OBSERVED — persona 10]. **M6.** Offline queue is dead code (`concurrencyUtils.ts:238`) — mutations fail
  fast offline [OBSERVED — persona 8]. **M7.** `consumer_member` wildcard delete on all resources
  (`permissionMatrix.generated.ts:36-43`) — any member can delete the calendar [OBSERVED — persona 6].
  **M8.** ForTeams advertises Slack/QuickBooks integrations with no implementation [OBSERVED — persona 9].
  **M9.** Voice concierge is dictation-only (`voiceProductPath.ts`) while marketed as the Frequent
  Chraveler marquee [OBSERVED]. **M10.** PDF free-limit copy drift ("1 PDF export per trip" in
  `PlusUpsellModal.tsx:165` + `usePdfExportUsage.ts:5` vs ✗ in billing config) [OBSERVED].

### Low-priority

`console.log` in `PlacesSection.tsx:116,126` (repo rule violation) · poll-permission drift between
generated matrix and `useEventPermissions` · "Line-up" tab always visible on events · timezone selector
only renders for Event-type trips · `ProTabsConfig` finance carve-out omits `player`.

## 6. Activation Funnel Diagnosis

⚠️ **No observed funnel data exists — PostHog has ingested zero events ever** (`evidence/posthog-funnel.md`).
Every rate below is [SIMULATED RISK]/[HYPOTHESIS]; the fix for that is one env var
(`VITE_POSTHOG_API_KEY` in Vercel prod) activating the already-typed funnel in `src/telemetry/types.ts`.

| Step                             | Likely drop-off            | Why (cited)                                                                                                                          | Fix                                                                              | Est. impact         |
| -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------- |
| Landing → sign-up                | Moderate                   | Auth wall before any value; SEO pages exist but app is account-first                                                                 | Account-optional trip preview already exists — extend to a "try a demo trip" CTA | Medium              |
| Sign-up → first trip             | Low-Moderate               | 10-screen carousel (`TOTAL_SCREENS=10`) between signup and value                                                                     | Cut to 3–4 screens or make contextual                                            | Medium              |
| First trip → first useful item   | **Low — product strength** | Calendar/places/polls all work solo; concierge gives instant content                                                                 | Protect it; surface concierge on first trip view                                 | —                   |
| First useful item → invite sent  | Moderate                   | Invite buried in ⋮ overflow; confusable "Share" sibling sends preview link                                                           | Promote invite to a primary button post-first-item                               | Medium-High         |
| Invite sent → collaborator joins | **HIGHEST LEAK**           | Account wall + leaked spec copy + false approval framing + dashboard-missing bug (H1)                                                | Fix H1 set; longer-term account-optional viewing                                 | **High**            |
| Joins → first concierge success  | Moderate                   | 10 free queries with invisible counter; Smart Import fully paywalled                                                                 | Wire the counter; 1 free import taste                                            | Medium-High         |
| → first itinerary reviewed       | Moderate                   | Dead Export button on the review surface (H4)                                                                                        | Remove/implement                                                                 | Medium              |
| → first return session           | High                       | No outbound re-engagement: digest is request-driven (`daily-digest/index.ts`), reminder crons unverified; friends land in empty chat | Scheduled digest + "trip starts in 3 days" push                                  | High                |
| → upgrade consideration          | **BROKEN**                 | The seven-link chain in C1                                                                                                           | §9 ship-immediately list                                                         | **Highest revenue** |

## 7. Pricing and Upgrade Feedback

| Persona        | Would pay?       | What                                        | WTP trigger                                | Right CTA                          | Wrong CTA                                     |
| -------------- | ---------------- | ------------------------------------------- | ------------------------------------------ | ---------------------------------- | --------------------------------------------- |
| Luxury planner | **Yes**          | Explorer now; Pro later if white-label      | Unlimited exports + trips                  | Explorer at export wall            | Voice (broken promise); mailto Pro            |
| Sports mom     | Reluctant        | Trip Pass split with parents                | 4th payment split (never fires)            | Pass at split wall                 | iOS "Subscribe on web"                        |
| Team ops       | Yes, org budget  | Growth $99+                                 | Working day-of logistics                   | Self-serve trial + security page   | mailto:; hollow Growth gates                  |
| Bachelorette   | **Yes, once**    | Trip Pass $39.99                            | Splits + photo wall mid-planning           | "Unlock this trip — $39.99" in-app | $19.99/mo subscription framing                |
| Wedding couple | **Yes, once**    | $74.99 90-day pass reframed "Wedding Pass"  | Unlimited photo pool + reliable broadcasts | Pass at storage meter              | 100-attendee label → $99/mo business plan     |
| Fraternity     | Personally never | Chapter could expense a season pass         | Admin lockdown + mute controls             | Expensable org one-off             | Any personal sub                              |
| Run club       | No               | — ($9.99/mo to fix a missing repeat button) | None today                                 | —                                  | Trip-limit wall at week 4 (converts to churn) |
| Touring        | **Yes, easily**  | $49–149/mo                                  | A trustworthy day sheet                    | Self-serve Pro trial               | Demo showing stubbed settlement               |
| Corporate      | Yes, if usable   | One-off "Offsite Pass" ~$99–199             | Reimbursement mode + agenda distribution   | Expensable one-off on invoice      | $49/mo seat sub for a 3-day event             |
| Friend group   | **Yes, once**    | Trip Pass                                   | Concierge wall mid-planning                | Pass inline at the wall            | Plain-text wall routing to /settings          |

**Pattern:** six personas' natural SKU is the **Trip Pass** — the product's least-reachable purchase.
Free tier is generous enough to activate; the issue is never price, always the path.

## 8. Persona Business Potential Ranking

`Score = pain×0.25 + frequency×0.20 + WTP×0.20 + acquisition-ease×0.15 + feature-fit×0.15 + viral×0.05`
(fit = product as it exists today; all 1–10)

| Rank | Persona        | Pain | Freq | WTP | Acq | Fit | Viral | Math                          | **Score** |
| ---- | -------------- | ---- | ---- | --- | --- | --- | ----- | ----------------------------- | --------- |
| 1    | Luxury planner | 7    | 9    | 9   | 5   | 6   | 6     | 1.75+1.80+1.80+0.75+0.90+0.30 | **7.30**  |
| 2    | Bachelorette   | 8    | 4    | 7   | 8   | 8   | 9     | 2.00+0.80+1.40+1.20+1.20+0.45 | **7.05**  |
| 3    | Touring        | 9    | 9    | 8   | 4   | 3   | 5     | 2.25+1.80+1.60+0.60+0.45+0.25 | **6.95**  |
| 4    | Team ops       | 8    | 9    | 9   | 3   | 3   | 3     | 2.00+1.80+1.80+0.45+0.45+0.15 | **6.65**  |
| 5    | Friend group   | 7    | 5    | 5   | 7   | 9   | 9     | 1.75+1.00+1.00+1.05+1.35+0.45 | **6.60**  |
| 6    | Wedding        | 8    | 2    | 8   | 7   | 6   | 9     | 2.00+0.40+1.60+1.05+0.90+0.45 | **6.40**  |
| 6    | Sports mom     | 8    | 7    | 4   | 6   | 6   | 8     | 2.00+1.40+0.80+0.90+0.90+0.40 | **6.40**  |
| 8    | Fraternity     | 6    | 6    | 2   | 7   | 6   | 9     | 1.50+1.20+0.40+1.05+0.90+0.45 | **5.50**  |
| 9    | Corporate      | 6    | 4    | 7   | 5   | 3   | 4     | 1.50+0.80+1.40+0.75+0.45+0.20 | **5.10**  |
| 10   | Run club       | 4    | 8    | 2   | 6   | 3   | 7     | 1.00+1.60+0.40+0.90+0.45+0.35 | **4.70**  |

**Read with time-to-serviceability:** Touring and Team ops rank 3–4 on potential but need the ops layer
_built_ (months). Luxury planner ranks 1 and needs only small fixes (dead button, branding, white-label
toggle — weeks). Bachelorette + friend group + sports mom + wedding are one consumer motion (organizer +
6–12 invitees + one-off pass) and the product is already 80% fit.

## 9. Feature Priority Matrix

`Priority = pain×0.30 + revenue×0.25 + activation×0.20 + retention×0.15 + confidence×0.10`

| Fix                                                                                                                                                                                                                                                     | Pain | Rev | Act | Ret | Conf | **Score** | Bucket                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --- | --- | --- | ---- | --------- | ------------------------ |
| Fix JoinTrip copy + approval framing + dashboard bug (H1)                                                                                                                                                                                               | 9    | 7   | 9   | 6   | 10   | **8.15**  | Ship immediately         |
| Wire concierge counter + correct-tier inline checkout (C1a-b)                                                                                                                                                                                           | 8    | 9   | 7   | 6   | 9    | **7.85**  | Ship immediately         |
| Account-optional guest itinerary view                                                                                                                                                                                                                   | 9    | 7   | 9   | 7   | 5    | **7.80**  | Ship next (design+RLS)   |
| Media cap semantics: organizer upgrade unlocks trip (H2)                                                                                                                                                                                                | 9    | 8   | 5   | 9   | 7    | **7.75**  | Ship next                |
| Smart Import free taste (1 free import) (H5)                                                                                                                                                                                                            | 7    | 8   | 8   | 6   | 8    | **7.40**  | Ship immediately         |
| Remove/implement dead Export PDF + de-brand deliverable (H4)                                                                                                                                                                                            | 8    | 7   | 6   | 7   | 10   | **7.40**  | Ship immediately         |
| Mount Trip Pass at all limit walls + fix broken handler (C1d-e)                                                                                                                                                                                         | 7    | 10  | 5   | 5   | 9    | **7.25**  | Ship immediately         |
| Per-trip notification mute (H3)                                                                                                                                                                                                                         | 9    | 5   | 4   | 9   | 8    | **6.90**  | Ship next                |
| **Enable PostHog (one env var)**                                                                                                                                                                                                                        | 5    | 7   | 8   | 6   | 10   | **6.75**  | **Ship today**           |
| Hide hollow Pro tabs on real trips (C2)                                                                                                                                                                                                                 | 8    | 6   | 5   | 7   | 8    | **6.75**  | Ship immediately         |
| Settlement atomicity + idempotency keys (C4)                                                                                                                                                                                                            | 7    | 8   | 3   | 8   | 8    | **6.70**  | Ship next                |
| Fix trip_broadcasts migration drift (C3)                                                                                                                                                                                                                | 8    | 6   | 4   | 7   | 7    | **6.45**  | Ship next (verify first) |
| Self-serve Pro checkout (replace mailto:)                                                                                                                                                                                                               | 7    | 9   | 4   | 4   | 7    | **6.45**  | Ship next                |
| Enforce splits cap with Pass offer (C1c)                                                                                                                                                                                                                | 5    | 9   | 4   | 5   | 8    | **6.10**  | Ship next                |
| Onboarding 10 → 4 screens — REVERTED BY OWNER DECISION: full 10-screen demo kept, with an explicit "Skip demo" control on every screen instead                                                                                                          | 6    | 4   | 8   | 4   | 9    | **5.90**  | Reverted (owner call)    |
| Duplicate-trip / repeat button                                                                                                                                                                                                                          | 6    | 4   | 4   | 7   | 8    | **5.45**  | Defer                    |
| Day sheet view / reimbursement mode / Wedding Pass SKU                                                                                                                                                                                                  | —    | —   | —   | —   | —    | —         | Defer (post-wedge)       |
| Voice realtime rebuild                                                                                                                                                                                                                                  | —    | —   | —   | —   | —    | —         | Defer (relabel now)      |
| **Kill or hide:** unbuilt Pro tab UI on real trips · 100/200-attendee labels (unenforced) · ForTeams Slack/QuickBooks claims · "voice concierge" marketing (say "voice dictation") · `PaymentMessage.tsx` dead code · demo super-admin · `console.log`s |      |     |     |     |      |           |                          |

## 10. Product Strategy Recommendation

1. **Focus personas (next 2 quarters):** ① Friend-group organizer + bachelorette lead (one motion: the
   organizer plans solo, invites 6–12, buys a Trip Pass at a limit wall — every fix in the
   ship-immediately bucket serves exactly this loop). ② Luxury planner (highest score, weeks-not-months
   to serviceable, recurring revenue, brings new client groups every trip). Sports mom and wedding ride
   the same fixes for free.
2. **Distracting/premature:** Team ops, touring, corporate — the demo promises them an ops layer
   `tripConverter` empties out. Stop selling it before it's built (hide the tabs, fix the marketing
   claims); revisit after the consumer wedge proves retention. Run club needs a different container
   (recurring groups), not more features. Fraternity has no buyer.
3. **Simplify:** onboarding (10→4), the in-trip mobile surface (default tab → Calendar or an overview, not
   empty Chat; invite as a primary CTA), the upsell system (one consistent wall component: show usage →
   name the right tier → checkout in place).
4. **Hide until stronger:** Pro logistics tabs on real trips, voice-concierge branding, attendee-cap
   labels, ForTeams integration claims.
5. **Most important activation moment:** _the first invited friend opens the link and lands in a trip that
   already looks alive._ Everything in H1 plus default-tab choice serves this.
6. **Most important paid-conversion moment:** _mid-planning limit hit (concierge query #10 or photo #6)
   with a visible meter and an inline "Unlock this trip — $39.99 Trip Pass."_ It currently doesn't exist
   anywhere in the product.
7. **Strongest wedge:** consumer group trips (friend/bachelorette/sports-weekend/wedding-adjacent) —
   highest fit-today, viral by construction (every trip imports 6–12 new users through the join page you're
   about to fix), monetized by the one-off Pass that matches how normal people think about a trip.

## 11. Immediate Action Plan (this week)

1. **Today:** set `VITE_POSTHOG_API_KEY` in Vercel prod → analytics on. (Everything else becomes measurable.)
2. Fix JoinTrip: leaked spec copy, conditional approval framing, and the `trip_members.status` dashboard
   drift (H1).
3. Render the concierge usage meter (stop discarding `usage`); replace the limit dead-end with the
   correct-tier inline offer.
4. Mount `TripPassModal` at every limit wall; fix `ProTripDetailDesktop.tsx:571`.
5. Remove or implement the dead Export PDF button; strip "The Group Chat Travel App" branding from the PDF.
6. Give free users 1 Smart Import.
7. Hide unbuilt Pro tabs on real trips; relabel voice as dictation; remove unenforced attendee-cap labels
   and phantom integration claims.
8. Verify the `trip_broadcasts` migration drift against the live DB; fix in a follow-up migration.
9. Then: 5 paid human testers (not 10) running the §6 funnel as a moderated script, compared against this
   report's predictions.

## 12. Final Verdict

Chravel is **a real product with a broken business attached**. The organizer's single-player loop —
create, schedule, places, polls, AI — works today and is better than the group-text status quo. But the
two moments that decide the company's economics — _a friend taps the invite link_ and _the organizer hits
a limit while motivated_ — are respectively sabotaged (leaked placeholder copy, false approval framing,
account wall, dashboard bug) and unbuilt (invisible quotas, unenforced limits, unreachable Trip Pass,
mailto: checkout, iOS dead end). The B2B surface should stop being sold until `tripConverter` stops
emptying it. None of the ship-immediately fixes is large; most are days, one is a single environment
variable. Fix the join page, light up the limit walls, turn on analytics — then spend the $500 on five
real users to verify what this swarm predicted.

---

## Appendix A. Swarm Synthesis (agreement / conflict analysis)

**Universal (8–10/10 personas, independently):** invitee-side friction is the #1 funnel killer ·
monetization chain broken (C1) · notification model unfit for groups >10 · organizer single-player value
is real · analytics dark.

**Majority (5–7):** onboarding too long · payments lose to Venmo without money movement or reliability ·
media caps misdesigned · empty-chat first landing.

**Persona-specific (valid, not generalizable):** day sheets (touring) · reimbursements (corporate) ·
recurrence (run club) · white-label (planner) · member-delete lockdown (fraternity) · guest-type roles
(wedding).

**Conflicts:** _Premium feel_ — bachelorette says premium-feeling; corporate says consumer-gold styling
undermines work; wedding says copy reads B2B. Resolution: design language fits the consumer wedge; stop
worrying about B2B aesthetics until the ops layer exists. _Trip container_ — fine for trips (7 personas),
wrong for recurring (run club) and strained-but-workable for multi-city (touring — dated basecamps
genuinely roll over, the one Pro bright spot). Resolution: don't generalize the container yet.

**Preference noise (discounted in synthesis):** tab order quibbles, color/branding taste outside the
work-context complaint, AI personality preferences, "too many features" generalities without a cited screen.

**Revenue-critical consensus:** C1 (all), H1 (all), H2+H5 (consumer wedge), C2 (B2B trust).

## Appendix B. What still requires live users (hypothesis register)

Real funnel rates (after PostHog on) · perceived AI answer quality + latency · visual/animation polish ·
actual broadcast delivery behavior (C3) · iOS TestFlight cold-start + push behavior · whether week-4
run-club wall converts or churns · upgrade-wall conversion at the new Trip Pass mounts · 60+ member chat
performance under load.
