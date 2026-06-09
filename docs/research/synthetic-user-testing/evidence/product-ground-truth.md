# Chravel Product Ground Truth — Brief for Synthetic Persona Testing

Compiled 2026-06-09 from three codebase exploration passes (feature inventory, monetization surface,
known-issues register). This is the canonical input for persona agents: test the product described here,
not an imagined one. Where this brief and other UI copy disagree, the file paths cited here win.

---

## 1. What Chravel is

AI-powered group travel/event/logistics coordination. React 18 SPA (Vite) on Vercel, Supabase backend
(Postgres + RLS + Edge Functions), Stream Chat, Gemini AI concierge, Stripe (web) / RevenueCat (iOS),
Capacitor iOS wrapper of the same web app. ~35 routes, ~95 edge functions.

## 2. Navigation & surfaces

- **Mobile:** bottom `NativeTabBar` — Trips · Pro/Events · Recs · More. **Desktop:** top nav + header.
- **In-trip tabs:** Chat, Calendar, Media, Payments, Places, Tasks, Polls, Concierge; Pro/Event trips add
  Team and Broadcasts.
- Key routes: `/` dashboard · `/auth` · `/trip/:tripId` (+ `/trip/:tripId/preview`, `/t/:tripId`) ·
  `/join/:token`, `/j/:code` · `/event/:eventId` · `/tour/pro/:proTripId` · `/profile` · `/settings` ·
  `/organizations` · `/demo` · SEO landing pages (`/trip-planner`, `/group-trip-planner`, …).
- Files: `src/App.tsx`, `src/pages/Index.tsx`, `src/pages/{TripDetailDesktop,MobileTripDetail}.tsx`.

## 3. Auth & onboarding

- Email+password, Google OAuth, Apple Sign-in; email verification required post-signup; password reset.
  Invite context preserved through OAuth redirects. Files: `src/pages/AuthPage.tsx`, `src/components/AuthModal.tsx`.
- **9-screen onboarding carousel** (Welcome → Chat → Calendar → Places → Tasks → Polls → Payments →
  Concierge → CTA), skippable; completion stored in user_metadata. `src/components/onboarding/`.
- Unauthenticated visitors see the marketing landing (`src/MarketingApp.tsx`,
  `src/components/landing/FullPageLanding.tsx`) with pricing, FAQ, sign-up modal. Demo mode
  (`demoView: 'off'|'marketing'|'app-preview'`) exists; app-preview grants full mock access.

## 4. Trip creation (`src/components/CreateTripModal.tsx`)

- Types: **Consumer** (default), **Pro** (categories: Touring, Sports, Work, School, Productions,
  Celebrations, Other — each with its own roster terminology), **Event** (large-attendee).
- Required: title (unique per user), start/end dates, timezone. Optional: location, description,
  cover photo (crop modal), trip color (pro).
- Pro trip creation and Event creation are **gated to Frequent Chraveler tier and above** (see §10).

## 5. Invites (`src/pages/JoinTrip.tsx`, `InviteModal`)

- Shareable link `/join/{token}` or short code `/j/{code}`; optional expiration, max uses,
  require-approval toggle. Share via copy/SMS/email/native share.
- Invitee sees a trip preview (name, dates, destination, cover, member count, "Trip starts in X days")
  before auth; then sign-in/create-account gate; then join or approval queue.
- 7 typed error states with recovery CTAs (`src/types/inviteErrors.ts`): AUTH_REQUIRED, APPROVAL_PENDING,
  APPROVAL_REJECTED, TRIP_FULL, ALREADY_MEMBER, ACCOUNT_MISMATCH, TRIP_ARCHIVED.

## 6. Feature set (all implemented unless noted)

| Feature | Details | Key files |
|---|---|---|
| **Chat** | Stream Chat SDK; threads, reactions, pins, mentions, link unfurl, search, system messages; per-role channels + broadcasts on Pro | `src/features/chat/` |
| **AI Concierge (text)** | 38 tools / 18 query classes (places, flights/hotels deeplinks, itinerary writes, recommendations, expense parsing, Q&A on trip context); AI writes go through a **pending-action confirm card** ("Save to Trip?") | `src/components/AIConciergeChat.tsx`, `src/features/concierge/` |
| **AI Concierge (voice)** | Gemini Live / Vertex; gated to Frequent Chraveler+. See known issues §11 — architecture currently broken | `supabase/functions/` voice paths |
| **Calendar** | Month/day/list views; event create with place autocomplete; Google Calendar sync (Explorer+); Smart Import feeds it | `src/features/calendar/` |
| **Smart Import** | Gmail OAuth, PDF/ICS/CSV/images, links, screenshots, raw text; state machine ingest→parse→extract→validate→preview→commit with cherry-pick and duplicate detection | `src/features/smart-import/` |
| **Places / Basecamp** | Google Places search/save; Basecamp = trip home base used for distances and concierge context; map + list views | `src/components/PlacesSection.tsx`, `BasecampSelector.tsx` |
| **Polls** | Options, auto/manual close, anonymous option, change vote, realtime counts; poll-as-task mode | `src/components/poll/` |
| **Tasks** | Assignment (multi), due dates, filters (mine/unassigned/overdue), poll mode | `src/components/todo/` |
| **Payments** | Log expense, equal/custom split, who-owes-whom summary, settle-up (manual + **Venmo deeplink** — no in-app money movement), receipts | `src/components/payments/` |
| **Media** | Photos/videos/links/files; grid + lightbox; compression pipeline; share-sheet ingestion on iOS | `src/components/UnifiedMediaHub.tsx` |
| **Notifications** | In-app dialog with categories; PWA/native push opt-in; preferences. **No per-trip mute, no batching** (known gap) | `src/components/home/NotificationsDialog.tsx` |
| **Pro surfaces** | Roster + roles + org chart, role-based channels, broadcasts (recipient targeting, delivery tracking), join-request approval, room assignments, day-sheet style schedule; per-diem/compliance/settlement **partially stubbed** | `src/components/pro/admin/` |
| **Events** | RSVP states, attendee roles, agenda/lineup, broadcasts, attendee caps by tier | `src/pages/EventDetail.tsx` |
| **Profile/Settings** | Profile stats, archived trips, notification prefs, integrations (Gmail, GCal), billing, privacy | `src/pages/{ProfilePage,SettingsPage}.tsx` |

Empty/loading/error states exist throughout (skeletons; "No trips yet", "All settled up!", offline
indicator, "Couldn't Load Trip", concierge status chips including Limited/Degraded/Timeout).

## 7. Tiers & pricing — CANONICAL (`src/billing/config.ts`, `src/billing/entitlements.ts`)

| | Free | Explorer $9.99/mo · $99/yr | Frequent Chraveler $19.99/mo · $199/yr | Pro Starter $49/mo | Growth $99/mo | Enterprise custom |
|---|---|---|---|---|---|---|
| Trips | **3 active** | ∞ | ∞ | ∞ | ∞ | ∞ |
| AI queries | **10 /user/trip** | 25 /user/trip | ∞ | ∞ | ∞ | ∞ |
| Storage | **500 MB** | 50 GB | ∞ | ∞ | ∞ | ∞ |
| Payment splits | 3 /trip | 10 /trip | ∞ | ∞ | ∞ | ∞ |
| Events | 3 lifetime | 3 lifetime | ∞ (100 attendees) | ∞ (100) | ∞ (200) | ∞ |
| PDF export / GCal sync | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Voice concierge | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Pro trip creation | 1 free trial | ✗ | 1/month | ∞ | ∞ | ∞ |
| Channels/roles/roster | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Logistics | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Approvals/QuickBooks/compliance | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Seats | 1 | 1 | 1 | 50 | 100 | 250 |

- **Trip Passes** (one-time): Explorer 45 days $39.99 · Frequent Chraveler 90 days $74.99.
- Paywall surfaces: `PlusUpsellModal.tsx` ("Start Free Trial", 14-day, "Maybe Later"),
  `TripPassModal.tsx` ("Annual Explorer pays for itself after ~3 trips"), `PricingSection.tsx`
  ("Start free. Upgrade when your trip gets serious."), `ConsumerBillingSection.tsx`.
- **Pro trial CTAs are `mailto:` links** (support@/billing@chravelapp.com) — no self-serve Pro checkout.
- **`APPLE_IAP_ENABLED = false`** → on iOS, consumer subscription says "Subscribe on web" (App Store
  rule 3.1.1 means the app cannot even link out for digital goods without entitlement). Subscription
  management on iOS routes to Apple settings.
- ⚠️ **Limit-copy drift to verify per surface:** some UI copy reads "10 AI queries/month", "100 MB",
  "5 trips" while the billing config says 10/user/trip, 500 MB, 3 trips. If a persona's flow touches a
  limit string, check the actual component and report drift as a finding.

## 8. Permission model (`src/types/permissionMatrix.generated.ts`)

- consumer_member: full read/write/delete on tasks/polls/calendar/basecamp/links.
- **consumer_guest: NO access to any resource** — guests must become members to get value.
- pro_admin / event_organizer: full + admin. pro_editor: write, basecamp read-only.
  pro_viewer / event_attendee: read-only (polls partially writable for pro_viewer).
- Memory rule: trip existence ≠ access; membership is RLS-checked.

## 9. Analytics state (see `posthog-funnel.md`)

PostHog has ingested **zero events ever** — production telemetry is disabled (`VITE_POSTHOG_API_KEY`
unset) despite a complete typed event map in `src/telemetry/types.ts`. All funnel claims must be
labeled hypothesis, not observation.

## 10. Known issues register (citable as `[OBSERVED]` with these sources)

### Critical, open
1. **Payment settlement double-credit race** — settlement mutation not atomic; concurrent requests can
   double-credit (PLATFORM_AUDIT_CONSTITUTION.md). Idempotency keys missing on chat/payments/calendar
   mutations → retries can duplicate.
2. **Voice concierge realtime path disabled product-wide** — Supabase Edge Functions don't support
   WebSocket upgrades, so the Gemini Live proxy as designed times out (AUDIT_CONCIERGE_LIVE.md). The
   current mitigation: `VOICE_PRODUCT_PATH = 'dictation-only'` in
   `supabase/functions/_shared/voiceProductPath.ts` — realtime voice returns "Realtime voice is
   disabled. Chravel Concierge voice currently supports dictation only." So the marquee Frequent
   Chraveler "voice concierge" entitlement currently sells **dictation-only**, not live voice.
   Historically voice declared 31 tools with only ~19 implemented → silent tool failures
   (DEBUG_PATTERNS.md, TEST_GAPS.md).
3. **Security:** wildcard CORS on 26 edge functions; demo account in FOUNDER_EMAILS (super-admin);
   hardcoded anon key fallback; jsPDF CVE; seed-demo-data unauthenticated (SECURITY_AUDIT_REPORT.md).

### High, open
4. **Notification fanout blocks the INSERT transaction** at event scale (4,000 members → 12,000 rows
   synchronously); no per-trip/channel mute; no batching/grouping (NOTIFICATION_AUDIT.md).
5. **No hot-trip realtime isolation** — one big trip saturates realtime (PLATFORM_AUDIT_CONSTITUTION.md).
6. **Dashboard member-trip missing after join approval** (trip_members.status column drift) —
   user approved, notified, but trip absent from dashboard (DEBUG_PATTERNS.md).
7. **Storage quotas advisory-only**; media bucket not signed-URL enforced.
8. Smart Import replay/idempotency only partially tested — retries can duplicate or corrupt shared trip
   data (TEST_GAPS.md).

### Recently fixed — cite as fragility/regression-watch, not open bugs
- Trip Not Found flash during auth hydration; marketing bootstrap trapping TestFlight cold-starts.
- Chat message loss on websocket reconnect (backfill added); read-receipt write storms; reaction refetch storms.
- Invite CTA loop after auth; trip preview without active invite code; share-proxy raw JSON on 503.
- Cover-photo upload pipeline drift (3 paths); media tiles "Unable to preview" for chat uploads.
- Mobile chat horizontal overflow stealing Media/Payments tab taps; landscape grid issues;
  pending-action confirm "Unknown tool" (only 3 of 70+ tools handled — now expanded).
- Mock-ID tier gate that disabled consumer-only features on all real trips.

### Design-level frictions (citable)
- Concierge "Action Plan JSON" mandate frequently ignored by model; preference injection on irrelevant
  queries (DEBUG_PATTERNS.md).
- Pro logistics (per-diem, compliance, settlement) partially stubbed.
- No in-app money movement — settle-up is Venmo deeplink/manual only.

## 11. Evidence discipline for persona reports

Label every claim:
- `[OBSERVED — <file or audit doc>]` — verified in code/docs (you may and should open files yourself).
- `[SIMULATED RISK]` — realistic persona friction inferred from the real flow, but not a verified defect.
- `[HYPOTHESIS — needs live test]` — requires a running app or real users to confirm.

Never invent a bug. Never soften one that's documented.
