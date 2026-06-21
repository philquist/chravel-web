## Goal

Replace the 6th use case on the homepage ("Local Community Groups" — run clubs / dog park crews) with a B2B-focused **Travel Concierge Companies** card, and tighten the section subtitle so it no longer leads with "Run Clubs & Dog Park Meetups". The longer narrative you drafted stays reserved for the dedicated `/use-cases/travel-concierge` page (not built here).

## Scope (single file)

`src/components/landing/sections/UseCasesSection.tsx` only. No new page, no new route, no design/layout changes — only content swap inside the existing 6-card grid and the section subtitle.

## Changes

**1. Section subtitle (line 99)**

Before:
> Friend Trips, Family Vacations, Sports Travel, Touring Teams, & local events like Run Clubs & Dog Park Meetups — ChravelApp handles it all.

After:
> Family Vacations, Friend Trips, Sports Travel, Touring Teams, Wedding Weekends & **Travel Concierge Companies serving premium clients** — ChravelApp handles it all.

Rationale: removes the casual/free-tier framing, leads with the higher-LTV segments, and surfaces the new B2B angle in the hero copy so the 6th card has narrative support above it.

**2. Sixth scenario card (lines 53–60)**

Replace the entire `Local Community Groups` object with:

```text
title:      Travel Concierge Companies
subtitle:   Luxury planners · family offices · destination specialists · VIP travel
before:     WhatsApp threads, iMessage chains, PDFs in Drive, emailed
            itineraries, screenshots of confirmations — a premium price tag
            delivered through a messy stack of consumer apps.
expandCTA:  ChravelApp helps concierge teams deliver a premium client experience
after:      A polished, private trip portal per client. Itinerary, calendar,
            files, receipts, base camps, recommendations, tasks, and
            broadcasts — preloaded before the client even opens the app.
badge:      Look more buttoned-up · stop chasing the same questions
```

Tone matches the other cards (short Before / longer After / one-line badge) and pulls the strongest beats from your draft: the "messy stack" framing, the "preloaded so it doesn't feel blank" payoff, and the "premium service shouldn't be delivered through chaos" pitch.

**3. Card order — unchanged**

Households (hero) stays first. Concierge slots into position 6 (bottom-right on desktop, last card on mobile) — same slot the community card occupied, so no layout reshuffle.

## Out of scope

- The full long-form `/use-cases/travel-concierge` page, SEO title/meta, H1, and Feature Map table from your draft. Flag if you want that built next — it's a separate route + sitemap entry.
- The "Built for Every Journey" headline stays as-is.
- No design tokens, no card structure, no animation changes.

## Validation

- `npm run lint && npm run typecheck && npm run build`
- Visual check at desktop (3-col), tablet (2-col), and mobile (1-col) viewports — the concierge card should render in the existing slot with no overflow on its slightly longer `before` copy.
- Confirm the subtitle wraps cleanly on mobile (it's one line longer than before).
