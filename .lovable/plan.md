# Add 10th Use Case: Business Travel

## Goal
Fill the empty grid slot after "Faith & Church Groups" on the /use-cases hub with a 10th card — **Business Travel** — matching the same Before/After/CTA expandable layout, and publish a full `/use-cases/business-travel-coordination` detail page.

## Why "Business Travel"
- Fills a distinct segment none of the other 9 cover (coworkers on shared work trips, company offsites, client meetings, retreats).
- "Business" is intentionally broader than "corporate" — covers small teams, agencies, contractors, not just corporate HQ workers.
- Natural fit for existing ChravelApp features: contained work chat, shared Calendar, Attachments (decks, receipts, contracts), Tasks (per-person prep), Base Camps (shared HQ + personal hotels), Explorer (client sites, dinner spots), Media (retreat photos).

## Changes

### 1. `src/lib/useCases.ts` — append a new `UseCaseDetail` entry (10th, after Faith & Church Groups)
- `slug: 'business-travel-coordination'`
- `status: 'published'`
- `cardTitle: 'Business Travel & Company Retreats'`
- `cardTagline`: one sentence — coworkers on shared trips get a private workspace for the itinerary, decks, tasks, and dinners without polluting personal texts.
- `cardCtaLabel: 'See ChravelApp for business travel'`
- `seo.title` + `seo.description` (keyword: business travel coordination app / company retreat)
- `h1`: "The coordination app for business trips and company retreats"
- `intro` + 4–5 `body` paragraphs covering:
  - Contained work chat (no leaking into iMessage / personal group texts)
  - Shared Calendar for meeting itinerary, work dinners, flight blocks
  - Attachments for decks, contracts, expense receipts, travel confirmations
  - Tasks per person (prep the deck, book the client reservation, print handouts)
  - Base Camps — office/venue as shared HQ, each colleague's personal hotel as personal Base Camp
  - Explorer — client sites, dinner spots, coffee near the venue
  - Media — company retreat album everyone contributes to
  - Broadcasts + Payments (splitting the team dinner, settling shared cabs)
  - Company retreats specifically: shared calendar, offsite agenda, group photos, activities
- `featureMap` (~7 pain → solution rows) covering: leaked work chat, scattered decks/receipts, unclear meeting schedule, personal vs shared lodging, splitting team dinners, retreat photos across phones, per-person prep tasks
- `workflow.heading`: "Set up a business trip or company retreat" with 5 steps
- `faq`: 5 Qs (private from personal texts? handle expense receipts? works for offsites/retreats? multiple admins with Pro? iOS + Android?)
- `cta`: heading "Keep work trips organized — and out of your personal texts", primary "Create a trip" → `/auth`, secondary "ChravelApp for teams" → `/teams`

### 2. `public/sitemap.xml` — add `<url>` entry for `/use-cases/business-travel-coordination`

### 3. `src/components/landing/sections/UseCasesSection.tsx` — verify no hard-coded card list; the grid is driven by `USE_CASES`, so adding entry #10 auto-fills the empty slot. (Read-only confirmation, no edits expected.)

### 4. `src/lib/__tests__/useCases.test.ts` — extend the "resolves" test list to include `'business-travel-coordination'` so the invariants (detail present, CTA target, FAQ, featureMap) are enforced.

## Out of scope
- No changes to Travel Concierge featuring, the other 9 cards' copy, or the section's layout/ordering logic.
- No new components; reuses the existing card + detail page templates.

## Verification
- `npm run typecheck && npm run lint && npm run test:run` (specifically the `useCases` suite).
- Visual check: /use-cases hub shows 10 cards in a clean grid (no empty slot on desktop); expanding "Business Travel & Company Retreats" shows Before/After chaos + "See how ChravelApp helps"; link routes to a fully-populated `/use-cases/business-travel-coordination`.
