# Overhaul: `/blog/how-to-create-client-trip-portal-without-custom-app`

Rewrite this single blog entry in `src/lib/blog.ts` (lines 487–588) into a much longer, concrete, SEO-focused article aimed at travel concierge companies. No route, schema, or component changes — pure content edit inside the existing `BlogPost` object.

## Goals
- Make it obvious that ChravelApp (Pro Trip + new **Coordinator** role) is a better home hub than a white-label build or a hand-rolled Notion/Drive/WhatsApp stack.
- Prove it with one detailed, platform-agnostic worked example (a concierge running a high-end multi-city family vacation).
- Reinforce the coordinator ↔ client **privacy boundary** we just shipped (coordinators manage logistics; client chats/photos/AI stay private).
- Rank for: *travel concierge client portal*, *white label travel app alternative*, *multi-city itinerary tool for concierges*, *travel concierge software without custom app*.

## Content structure (new sections replacing the current 6)

1. **Intro** — reframe: "You don't need a white-label app. You need a shared trip workspace your client already knows how to use." Name the audience (independent concierges, luxury travel agencies, family office assistants, DMCs).
2. **What a real client portal has to do** — expand existing bullets; add multi-city base camps, per-item cost transparency, pre-trip tasks with due dates, document vault, live updates without a resend.
3. **Why white-labeling is the wrong bet in 2026** — build cost, maintenance, app-store review cycles, security/compliance surface, and the fact that clients won't install a one-off app per agency. Cite the alternative: one app they keep for every trip in their life.
4. **A worked example: the Rossi family, 12 days across Rome → Florence → Positano** — the centerpiece. Walk through, in numbered beats, exactly what the concierge does inside ChravelApp:
   - Create the Pro Trip, invite the family as members, invite themselves as **Coordinator** (logistics-only scope).
   - Load **three base camps** with dates: Hotel de Russie (Rome, Jun 3–6), Portrait Firenze (Jun 6–9), Le Sirenuse (Jun 9–15) — note how the active base camp auto-switches by date and drives distances in Places.
   - Drop confirmations into the file vault: flights, hotel vouchers, Uffizi timed tickets, Frecciarossa train PDFs, driver contacts, restaurant confirmations.
   - Build the calendar: Da Enzo dinner, Galleria Borghese entry, private Vespa tour, Teatro dell'Opera, Amalfi boat day — each event with location, time, dress code, and the linked confirmation file.
   - Pin **Places**: restaurants, museums, the tailor in Florence, the private beach club — with the concierge's notes.
   - Assign **pre-trip tasks** with due dates: "Renew passports (expires <6 mo from return)", "Pick up Frecciarossa paper tickets at Termini window 12", "Confirm dietary restrictions", "Download offline maps".
   - Post one welcome **Broadcast** — everyone gets it, nothing lost in a group chat.
5. **Payments & cost transparency without becoming a processor** — how the concierge uses the Payments tab to line-item what was booked on the client's behalf ("Vespa tour — €480", "Boat day w/ captain — €1,850", "Opera box — €620"), so the family sees the ledger upfront instead of getting a surprise invoice. Note that ChravelApp tracks; the concierge still bills through their normal channel.
6. **The privacy boundary that makes concierges look professional** — the Coordinator role we just shipped: coordinator can manage calendar, places, tasks, files, base camps, and broadcasts, but **cannot** read the family's private group chat, private AI Concierge sessions, or private media. Cross-link to the use case page.
7. **Running a book of clients** — one workspace per family, repeatable template, handoff between planners, no per-client "portal" to maintain.
8. **When a white-label still makes sense** — keep the honest note; large agencies with unique workflows, later, not first.
9. **Stand up your first client portal today** — the existing checklist, expanded with base camps and payments.

## FAQ additions
Keep existing four, add:
- "Can I manage the trip without seeing my clients' private conversations?" → coordinator scope.
- "What about multi-city or multi-country trips?" → base camps by date.
- "Can clients see what each booked item cost?" → Payments tab line items.
- "Can I template this for every new family?" → duplicate Pro Trip pattern.

## Related links
Keep the three existing; add `/use-cases/wedding-guest-coordination-app` (planner parallel) and `/blog/why-whatsapp-google-drive-not-enough-luxury-travel-planning`.

## CTA
Sharpen: primary "Create your first client portal" → `/auth`; secondary "See the concierge use case" → `/use-cases/travel-concierge-client-portal`.

## Files touched
- `src/lib/blog.ts` — replace the single `BlogPost` object at lines 487–588 (description, excerpt, sections, faq, related, cta). No other files.

## Out of scope
No route changes, no new components, no image assets, no sitemap edits (slug unchanged), no schema/RLS work.
