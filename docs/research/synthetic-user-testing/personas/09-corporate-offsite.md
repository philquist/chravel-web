# Persona 9: Dana Okafor — Startup Founder Planning Company Offsite

## A. Profile

- **Name / role:** Dana Okafor, co-founder & COO of a 25-person seed-stage B2B SaaS startup ("Relay Systems"), planning a 3-day all-hands offsite in Austin, TX.
- **Age range:** 33–38.
- **Tech comfort:** Very high — lives in Linear, Slack, Notion, Google Workspace, Brex. Evaluates tools in 15 minutes; if onboarding stalls, the tool is dead.
- **Planning style:** Delegation + accountability. Dana assigns owners (EA owns hotel block, Head of Eng owns hack-day agenda, office manager owns dinners) and wants visible task ownership, due dates, and one canonical agenda. Hates "who has the latest version?" threads.
- **Pain points:** Tool sprawl (Notion agenda + Slack channel + Google Sheet of flights + Brex receipts), employees ignoring the offsite doc, expense chaos after the event, looking disorganized in front of the team.
- **Budget sensitivity:** Company card, but ROI-judged. $150–$500 one-off for a 3-day event is a non-decision; a $49–$99/mo recurring SaaS subscription for a twice-a-year event triggers "why is this not usage-based?" scrutiny. Anything requiring a sales call for <$1k is an automatic skip.
- **Why they'd adopt:** One link that replaces the Notion agenda + Slack channel + flight sheet; AI that turns forwarded confirmation emails into a real agenda; employees can join with zero training.
- **Why they'd reject:** Consumer styling/copy in front of employees ("Chraveler", gold premium branding, Venmo settle-up), no reimbursement/expense model finance can use, no self-serve purchase, no SSO/security posture for procurement, and an Organizations feature that doesn't actually connect to trips.

## B. Jobs-to-be-Done

1. When I am announcing the offsite 6 weeks out, I want to send one link with dates, hotel, and agenda, so I can stop answering "what's the schedule?" DMs.
2. When I am delegating logistics, I want to assign owned, dated tasks (hotel block, dinner reservations, AV for sessions), so I can hold people accountable without chasing.
3. When employees book flights, I want their itineraries collected in one place, so the ops lead can arrange airport shuttles without a spreadsheet.
4. When the company pays for dinners and employees front incidentals, I want expenses tracked against the company with receipts, so finance can reimburse and reconcile in one pass — not run peer-to-peer Venmo splits.
5. When the offsite ends, I want the photo pool, decisions, and spend record to persist somewhere useful, so the event has residual value and next offsite starts from a template.

## C. Full User Journey (16 steps)

### 1. Discovery — would Dana take it seriously?
- **Tried:** Googles "offsite planning tool", lands on `/teams`.
- **What code says:** `/teams` renders `src/pages/ForTeams.tsx` (route confirmed in `src/App.tsx:548`). Hero: "Built for Teams That Move… from touring artists to college athletics." Corporate Travel is one of four use-case cards (after Sports Teams and Touring Artists). Benefits promise "Compliance & Reporting — built-in audit trails… real-time analytics" and "Advanced Integrations — Connect with Slack, QuickBooks, Google Workspace" [OBSERVED — src/pages/ForTeams.tsx:20-30,46-50]. The hero screenshot is a sports/parents channels image ("Keep coaches, players, and parents organized") [OBSERVED — ForTeams.tsx:108-116].
- **Friction:** Every CTA on the page — "Schedule a Demo", "Start 14-Day Trial", all three pricing buttons, "Contact Sales" — is a `mailto:support@chravelapp.com` link [OBSERVED — ForTeams.tsx:80-97,193-201,234-241,274-281]. Dana clicks "Start 14-Day Trial", her mail client opens, and she closes it. The Slack/QuickBooks integration claim has **no implementation in `src/`** — "slack"/"quickbooks" appear only in marketing copy, billing feature strings, and a test [OBSERVED — grep across src/: ForTeams.tsx, ReplacesGridData.ts, billing/{types,config,entitlements}.ts, icsBranding.test.ts only]. Compliance/QuickBooks features are Enterprise-tier strings, and Pro logistics (per-diem/compliance/settlement) are partially stubbed [OBSERVED — product-ground-truth.md §7, §10].
- **Verdict:** Page targets her segment by name but reads tour-manager-first, promises integrations that don't exist, and dead-ends into email. Credibility damaged in minute one.

### 2. Sign-up / onboarding
- **Tried:** Signs up with dana@relaysystems.com via Google.
- **What code says:** Google OAuth works for a Google Workspace account (it's standard consumer Google OAuth), plus email+password with verification [OBSERVED — ground truth §3, `src/pages/AuthPage.tsx`]. 9-screen consumer onboarding carousel (Chat → … → Concierge), skippable.
- **Friction:** No SAML/OIDC SSO, no domain capture ("anyone @relaysystems.com auto-joins"), no SCIM. Auth surface is email/Google/Apple only [OBSERVED — ground truth §3; no SSO surface found in src]. Onboarding speaks consumer trip language, not "set up your team."
- **Verdict:** Works for a 25-person startup (Google OAuth is enough at this size), but nothing signals "built for companies."

### 3. Trip creation — which of three paths fits a 25-person, 3-day offsite?
- **What code says:** `CreateTripModal` offers Consumer / Pro / Event. Pro has a **Work** category: "Corporate retreats, executive meetings, sales trips, recruiting events, and business travel" [OBSERVED — src/types/proCategories.ts:81-99]. Costs: Consumer trip is free (3 active trips); Pro creation is gated to Frequent Chraveler ($19.99/mo, 1 Pro trip/month) with 1 free Pro trial on Free; Pro Starter is $49/mo (50 seats) [OBSERVED — ground truth §4, §7]. Organizations (`/organizations`) are a third thing entirely — see step 16 and Section D.
- **Friction (three-way fork, none clean):**
  - **Consumer trip:** free and fully functional, but no roster/roles/broadcasts, and payments are friend-splits.
  - **Pro Work trip:** the designed fit — but the Work category ships with an **empty default roles array** (`roles: []` [OBSERVED — proCategories.ts:86]) while Sports gets Athlete/Coach and School gets Student/Chaperone/Teacher; its terminology labels the team "Attendees / Participant / **Event Lead**" [OBSERVED — proCategories.ts:99] — conference-speak, not company-speak ("Team / Employee / Organizer"). Worse: Pro ops surfaces (roster/schedule/settlement/per-diem) are **hardcoded empty for real trips** (`src/utils/tripConverter.ts:117-130`, verified by prior personas) — the polished Pro demo data (NVIDIA bowling night, Eli Lilly retreat in `src/data/pro-trips/`) doesn't exist for trips Dana creates.
  - **Organization:** a seat/billing container with no connection to trips at all (step 16).
- **Verdict:** Dana burns her single free Pro trial, finds the Team tab empty-by-design, and falls back to a consumer trip that looks like a bachelorette-party planner. The "Work" category is a label, not a product.

### 4. Inviting 25 coworkers
- **Tried:** Posts the invite link in Slack #offsite-austin.
- **What code says:** Shareable `/join/{token}` or `/j/{code}`, optional expiry/max-uses/require-approval; invitees see a trip preview before auth; 7 typed error states [OBSERVED — ground truth §5]. Org-level invites (separate system) are one email at a time, single text field, member/admin role [OBSERVED — src/components/enterprise/InviteMemberModal.tsx:29-95].
- **Friction:** No domain-restricted invite ("only @relaysystems.com"), no CSV/bulk invite, no Google Directory import. Each employee must individually create an account and verify email before joining — a real adoption tax for people who didn't choose the tool. Known regression-watch: approved members missing from dashboard after join approval (trip_members.status drift) [OBSERVED — ground truth §10.6].
- **Verdict:** Link-in-Slack works for 25 people; acceptable but consumer-grade. [SIMULATED RISK] 5–8 of 25 employees stall at account creation/email verification and never join.

### 5. Agenda — flights, hotel, sessions, breakouts, dinner
- **Tried:** Smart Imports the hotel block confirmation and her own flight; builds Day 1–3 agenda with parallel breakout sessions.
- **What code says:** Calendar has month/day/list views, event creation with place autocomplete; Smart Import handles Gmail/PDF/ICS with preview + cherry-pick [OBSERVED — ground truth §6]. There is no session-track/breakout/parallel-agenda concept — every item is a flat calendar event on one shared trip calendar.
- **Friction:** [SIMULATED RISK] Two simultaneous breakouts ("Eng roadmap" + "GTM planning") render as overlapping events with no track grouping or per-group visibility; 25 people each importing their own flight produces 25 separate calendar entries with no arrivals-board rollup (the Pro day-sheet schedule that would serve this is in the hardcoded-empty ops layer). PDF export of the agenda requires Explorer+ [OBSERVED — ground truth §7].
- **Verdict:** Fine for a linear agenda; degrades exactly where offsites differ from vacations (parallel sessions, arrivals logistics).

### 6. AI Concierge
- **What code says:** 38 tools / 18 query classes; flights/hotels deeplinks; itinerary writes behind a "Save to Trip?" confirm card [OBSERVED — ground truth §6]. Free tier: 10 queries/user/trip [OBSERVED — §7].
- **Friction:** "Best team-dinner private rooms near our hotel for 25" is genuinely useful and works against Basecamp context. But 10 free queries/user/trip means employees hit the wall fast, and the upsell shown to *employees* is consumer-priced. Voice concierge — if anyone tries it — is dictation-only product-wide despite being sold as a marquee feature [OBSERVED — ground truth §10.2].
- **Verdict:** Best feature in the product for this persona; quota and consumer upsells dilute it.

### 7. Places / Basecamp
- **What code says:** Basecamp = trip home base (the hotel), drives distances and concierge context; Google Places save/map/list [OBSERVED — ground truth §6].
- **Verdict:** Works as intended; setting the offsite hotel as Basecamp is the cleanest moment in the product. No friction worth reporting.

### 8. Polls — dinner choice
- **What code says:** Options, auto/manual close, anonymous voting, realtime counts [OBSERVED — ground truth §6].
- **Verdict:** "Tuesday dinner: BBQ vs Tex-Mex vs Omakase" works well; anonymous option is actually valuable in a workplace (junior employees vote honestly). Genuine win.

### 9. Role-based tasks
- **What code says:** Tasks support multi-assignment, due dates, mine/unassigned/overdue filters [OBSERVED — ground truth §6]. Roles live in the Pro roster — which is hardcoded empty for real trips (`tripConverter.ts:117-130`), the Work category defines zero default roles [OBSERVED — proCategories.ts:86], and broadcast role-targeting is cosmetic (prior-persona verified).
- **Friction:** Dana can assign tasks to *people* (sufficient for 25), but cannot assign to *roles* ("all session leads") or rely on role-scoped channels — the entire role layer she'd be paying Pro for is non-functional on real trips.
- **Verdict:** Person-level tasks: works. Role-based accountability — the reason to upgrade — does not exist in practice.

### 10. Payments — the corporate dealbreaker
- **Tried:** Wants: "company card paid the dinner; Sarah fronted the team Ubers — track for reimbursement."
- **What code says:** The payments model is consumer expense-splitting: log expense, equal/custom split, who-owes-whom, settle-up via **manual or Venmo deeplink** — no in-app money movement [OBSERVED — ground truth §6, §10]. The word "reimburse" (any form) appears **zero times in `src/`** [OBSERVED — grep `reimburs` → no matches]. There is no payer-entity concept (company vs person), no expense report/export for finance, no approval flow, no receipt bundle. QuickBooks appears only as an Enterprise feature string [OBSERVED — billing config strings]. Known critical: settlement mutation is non-atomic — concurrent settle-ups can double-credit [OBSERVED — ground truth §10.1].
- **Friction:** The only way to model the offsite is "Dana personally owes/is owed by 24 employees via Venmo." That is actively wrong for a company event and embarrassing in front of staff.
- **Verdict:** Hard fail. Finance can't use it; Dana disables the Payments tab mentally and keeps Brex + a spreadsheet.

### 11. Media
- **What code says:** Photos/videos/files, grid + lightbox, compression [OBSERVED — ground truth §6]. Free tier 500 MB; quotas advisory-only [OBSERVED — §7, §10.7].
- **Verdict:** Team photo pool is a real, low-effort win. [SIMULATED RISK] 25 people × 3 days of phone video blows past 500 MB immediately; because quotas are advisory-only it silently works — until the company is asked to pay for storage it already consumed.

### 12. Chat — vs Slack, why switch?
- **What code says:** Stream Chat with threads, reactions, pins, mentions, search [OBSERVED — ground truth §6]. No Slack integration exists despite the /teams page claiming one [OBSERVED — step 1 grep].
- **Friction:** Employees already live in Slack; a second chat tool for 3 days guarantees split conversations. Without even a Slack webhook bridge ("agenda updated" → #offsite-austin), trip chat will be a ghost town. [SIMULATED RISK]
- **Verdict:** Chat is competent but strategically wrong to fight Slack head-on; the missing bridge is the gap.

### 13. Notifications
- **What code says:** In-app categories + push opt-in; **no per-trip mute, no batching/grouping** [OBSERVED — ground truth §6, §10.4].
- **Friction:** 25 employees in one trip = every poll vote, task, and chat message fans out individually. Employees who didn't choose the tool get spammed during a workday and turn off notifications entirely — killing the one channel Dana needs for "bus leaves at 8:45."
- **Verdict:** Notification model is hostile to conscripted users. [SIMULATED RISK] opt-out cascade by Day 2.

### 14. Agenda review (pre-departure)
- **What code says:** Calendar list view works for review; PDF export gated to Explorer+; Google Calendar sync gated to Explorer+ [OBSERVED — ground truth §6–7].
- **Friction:** Dana's two highest-value distribution moves — "PDF the agenda to everyone" and "push it into employees' Google Calendars" — are both paywalled per-user on the consumer ladder. GCal sync being per-user means each employee must individually connect Google and individually be Explorer+; there's no organizer-pays-for-everyone mechanism on a consumer trip.
- **Verdict:** The reliability feature she most needs (agenda in employees' real calendars) is structurally per-seat-consumer-paywalled.

### 15. Post-offsite — residual value
- **What code says:** Trips archive; profile shows stats/archived trips [OBSERVED — ground truth §6]. No trip template/duplicate concept found in the brief or surfaces read; org dashboard holds no trip history (no linkage — step 16).
- **Friction:** The photo pool persists (nice). But spend data is unexportable, the agenda can't become a template for the next offsite, and nothing accrues to the company — it accrues to Dana's personal account.
- **Verdict:** Residual value ≈ a shared photo album. [SIMULATED RISK] no reason to return until the next offsite, and then no compounding benefit when they do.

### 16. Pay-or-upgrade — Pro Starter $49/mo for a 3-day event?
- **What code says:** Pro Starter $49/mo / 50 seats, Growth $99/mo / 100 [OBSERVED — ground truth §7; ForTeams.tsx pricing cards match]. **No self-serve Pro checkout — all Pro trial/purchase CTAs are `mailto:` links** [OBSERVED — ground truth §7; ForTeams.tsx]. Trip Passes (one-time $39.99/$74.99) exist but are consumer-tier passes — they unlock Explorer/Frequent-Chraveler features, not Pro roster/channels [OBSERVED — §7]. The Organizations feature (`/organizations`, `src/components/enterprise/`) offers org profile, logo, billing email, and seat management with owner/admin/member roles and one-at-a-time email invites [OBSERVED — OrganizationSection.tsx, SeatManagement.tsx, InviteMemberModal.tsx] — but the `trips` table has **no `organization_id` column** and no trip-side code references organizations [OBSERVED — src/integrations/supabase/types.ts:4337-4369; grep `organization_id` touches only org/auth/telemetry files]. An organization cannot own, contain, or bill for a trip.
- **Friction:** Seat math fits (25 < 50) but the model doesn't: a monthly subscription with no self-serve purchase, sold via support-email, for a 3-day one-off — when the obvious SKU is a one-time "Offsite Pass" (the consumer Trip Pass proves the billing rails exist). The Organizations feature is overkill *and* underbuilt simultaneously: enterprise chrome (logo upload, seat limits, billing contact) wrapped around nothing.
- **Verdict:** Even a willing buyer cannot pay. Dana emails support@, gets no instant trial, and the moment passes.

## D. Feature-by-Feature Findings

| Feature | Expected goal | Tried | What happened (code) | Friction | Bug/UX issue | Severity | Revenue impact | Retention impact | Recommended fix |
|---|---|---|---|---|---|---|---|---|---|
| /teams landing | Self-serve B2B trial | Clicked "Start 14-Day Trial" | `mailto:` opens email client [OBSERVED — ForTeams.tsx:90-97] | Dead-end for every CTA on the page | No self-serve Pro checkout/trial | **Critical** | Direct: blocks 100% of impulse B2B conversion | High — never returns | Stripe self-serve Pro trial; keep "Contact Sales" only on Enterprise |
| /teams claims | Trust marketing | Read benefits | "Slack, QuickBooks" integrations + "audit trails" claimed; no implementation in src [OBSERVED — grep] | Overpromise discovered at first use | Vaporware copy | High | Erodes paid trust; procurement red flag | High | Remove/asterisk unbuilt integrations until shipped |
| Organizations | Company owns the trip | Created org, invited member | Org = profile/logo/seats/billing fields; `trips` has no `organization_id`; zero trip linkage [OBSERVED — types.ts:4337-4369] | Org membership grants nothing trip-side; dialog even warns removal loses "access to all organization trips" — which can't exist | Enterprise shell disconnected from core product | **Critical** (for B2B story) | Pro/Enterprise tiers undeliverable as described | High | Add `organization_id` to trips + org-owned billing, or hide /organizations until real |
| Pro "Work" category | Corporate-shaped trip | Created Pro Work trip | Category exists with corporate description but `roles: []` and "Attendees/Participant/Event Lead" terminology [OBSERVED — proCategories.ts:81-99]; ops data hardcoded empty for real trips (tripConverter.ts:117-130, prior-verified) | Team tab is empty by design; demo trips (Eli Lilly retreat) show what real trips never get | Demo/reality gap | **Critical** | Kills the $49 upgrade rationale | High | Wire roster/schedule to real trip data; seed Work roles (Organizer, Session Lead, Employee) |
| Payments | Company-pays + reimbursement | Logged dinner expense | Consumer splits + Venmo deeplink only; `reimburs*` = 0 matches in src [OBSERVED]; settlement double-credit race open [OBSERVED — ground truth §10.1] | Models a corporate event as peer debts | Missing domain model + atomicity bug | **Critical** | Finance veto = no company purchase | High | Add payer-entity ("company") + CSV expense export; fix settlement atomicity |
| Invites | 25 joins, low friction | Link in Slack | Works; preview + approval queue [OBSERVED — §5]; org invite is 1-email-at-a-time [OBSERVED — InviteMemberModal] | No bulk/CSV/domain invite; account+verify wall | Adoption tax for conscripted users | Medium | Slows seat expansion | Medium | Domain-allow invite + bulk email paste |
| Calendar/agenda | Sessions + breakouts | Built 3-day agenda | Flat shared calendar; no tracks/parallel-session concept [OBSERVED — §6 + SIMULATED RISK] | Overlapping breakouts unreadable | Missing construct | Medium | Weakens core JTBD | Medium | Event "track/group" tag + grouped day view |
| GCal sync / PDF export | Agenda in employees' calendars | Tried export | Both Explorer+ per-user [OBSERVED — §7] | Organizer can't buy distribution for the group | Paywall shape mismatch | High | Blocks the wow-moment; misprices group value | High | Organizer-pays trip-level unlock (fits Trip Pass rails) |
| Chat | Replace #offsite-austin? | Used trip chat | Competent Stream chat [OBSERVED — §6]; no Slack bridge despite claim | Split-brain with Slack | Strategic gap | Medium | Lowers engagement-driven retention | High | Outbound Slack webhook digest (agenda/task/broadcast events) |
| Notifications | Reach 25 employees reliably | Observed model | No per-trip mute, no batching [OBSERVED — §10.4]; fanout blocks INSERT at scale | Spam → opt-out cascade | Known gap | High | Indirect — kills the channel orgs pay for | High | Per-trip mute + digest batching |
| Concierge | Local logistics for 25 | Asked for group-dinner venues | 38 tools, confirm-card writes [OBSERVED — §6]; 10 free queries/user/trip | Quota + consumer upsell to employees | Quota shape | Low–Med | Upsell moment wasted | Medium | Trip-level AI quota pool purchasable by organizer |
| Media | Team photo pool | Uploaded photos | Works; 500 MB free, quota advisory-only [OBSERVED — §7, §10.7] | Silent overage | Billing integrity gap | Low | Unmonetized usage | Low | Enforce quota with graceful organizer upsell |

## E. Emotional Reaction

- **Minute 0–5 (confident → skeptical):** `/teams` names "Corporate Travel" — good. Then every button opens her email client. "Is this a real company?"
- **Minute 5–20 (impressed despite herself):** Trip creation, Smart Import of the hotel confirmation, Basecamp + concierge dinner recs are genuinely slick. Polls with anonymous voting earn a nod.
- **Minute 20–40 (annoyed):** Pro Work trip's Team tab is empty; payments wants her to Venmo-split with subordinates; "Chraveler" copy and gold premium styling read like a luxury-vacation app in front of her eng team. [SIMULATED RISK] She screenshots the splits screen to a friend with "lol."
- **Would she abandon?** As a *company tool*, yes — at step 10 (payments) if not step 16 (can't buy). She might keep it *personally* for the agenda + photo pool, run finance in Brex, and never tell employees it's "the system."
- **Would employees adopt?** [HYPOTHESIS — needs live test] ~60–70% join via the Slack link; active usage concentrates in polls and media; chat stays in Slack; notification opt-outs climb daily. Adoption is organizer-deep, employee-shallow.

## F. Conversion Scores

- **Activation: 5/10** — consumer trip creation + Smart Import + invites genuinely work [OBSERVED — §4–6]; the corporate-shaped path (Pro Work / Organizations) activates into emptiness.
- **Invite: 6/10** — link/code invites with preview are good [OBSERVED — §5]; docked for account-creation friction, no bulk/domain invite, and the join-approval dashboard-drift regression watch [§10.6].
- **Day-7 retention: 3/10** — a 3-day event ends; no template, no expense export, no org-level accrual; notification spam pushes employees out before Day 3.
- **Paid conversion: 2/10** — willingness exists (the agenda/concierge moment is real) but the purchase path is `mailto:` [OBSERVED — §7, ForTeams.tsx]; price shape (monthly seat sub for a one-off) mismatches; the paid Pro layer is demonstrably hollow for real trips.
- **NPS: −25** — promoters exist (the EA who ran logistics loves it); the buyer is a detractor on payments + purchasability; employees are passives who used it twice.

**Would the company pay?** Not today. **What price/model would work:** a one-off **"Offsite Pass" — $99–$199 flat for one event, up to 50 seats, 30 days**, organizer-paid, unlocking Pro roster/broadcasts + group GCal sync + PDF export + pooled AI quota. The consumer Trip Pass [OBSERVED — §7] proves one-time billing rails already exist; this is a SKU decision, not an engineering platform. Per-seat monthly only makes sense for repeat operators (tours, sports) — Dana is not one. **What creates willingness to pay:** agenda-in-everyone's-calendar, role-based broadcasts that actually deliver, and an expense record finance accepts. **What blocks procurement:** no self-serve purchase, no security/trust page, no DPA/SOC2 mention anywhere, no SAML/SCIM (tolerable at 25 seats; fatal at 100), wildcard CORS on 26 edge functions if anyone technical looks [OBSERVED — §10.3]. **Which CTA works for B2B:** "Start your offsite free — upgrade this trip for $X" inline at the moment of value (export/broadcast), with instant card checkout. Never `mailto:`.

## G. Top 5 Fixes

1. **Replace the `mailto:` Pro trial/pricing CTAs on `/teams` (ForTeams.tsx:80-97,193-281) with self-serve Stripe checkout + instant 14-day Pro trial**, because Dana failed at *paying* — the highest-intent action in the funnel — causing 100% loss of impulse B2B revenue and signaling the company isn't real.
2. **Replace hardcoded-empty Pro ops data (`src/utils/tripConverter.ts:117-130`) with real roster/schedule reads, and seed the Work category with default roles (Organizer, Session Lead, Employee) instead of `roles: []` (proCategories.ts:86)**, because Dana upgraded to a Pro Work trip and found the Team tab — the entire $49 value proposition — empty, causing refund-grade trust collapse at the exact moment of conversion.
3. **Replace the peer-split-only payments model with a "company/organizer pays" payer entity plus CSV expense export (no `reimburs*` concept exists in src — verified zero grep matches)**, because Dana's finance flow ("company card paid, Sarah gets reimbursed") cannot be represented at all, causing a finance veto that blocks every corporate purchase regardless of price.
4. **Replace the disconnected Organizations shell (no `organization_id` on `trips` — types.ts:4337-4369) with either real org→trip ownership/billing or removal of `/organizations` from B2B navigation**, because Dana evaluated it as the procurement answer and found seat management for trips that can't exist, causing the Enterprise tier to be unsellable as described and a credibility hit for everything else.
5. **Replace per-user Explorer-gated Google Calendar sync and PDF export with an organizer-paid, trip-level unlock (reuse Trip Pass one-time billing rails)**, because Dana failed at the single job that justifies the tool — getting the agenda into 25 employees' real calendars — causing the strongest B2B wow-moment to die behind a consumer per-seat paywall and the event to fall back to Notion + Google Calendar.

---

*Evidence labels: [OBSERVED] claims cite `src/pages/ForTeams.tsx`, `src/types/proCategories.ts`, `src/components/enterprise/{OrganizationSection,SeatManagement,InviteMemberModal}.tsx`, `src/hooks/useOrganization.ts`, `src/integrations/supabase/types.ts:4337-4369`, `src/App.tsx:548`, grep results for `reimburs*`/`slack`/`quickbooks`/`organization_id`, and `docs/research/synthetic-user-testing/evidence/product-ground-truth.md` (§3–§10). Prior-persona verified citations: `src/utils/tripConverter.ts:117-130` (Pro ops hardcoded empty), mailto Pro CTAs, cosmetic broadcast role-targeting.*
