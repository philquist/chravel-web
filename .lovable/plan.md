# Add 10th Homepage Scenario Card: Business Travel

## Goal
Add a 10th tile to the "Built for Every Journey" section on the homepage (`src/components/landing/sections/UseCasesSection.tsx`), matching the same Before/After/expand-CTA layout as the other 9 cards and linking to `/use-cases/business-travel-coordination` (already published).

## Change
Append one entry to the `scenarios` array in `src/components/landing/sections/UseCasesSection.tsx`, after the Faith & Church Groups entry:

- `title`: "Business Travel & Company Retreats"
- `subtitle`: "Coworkers · client meetings · offsites · company retreats · work dinners"
- `before`: "Work trips scattered across personal iMessage, forwarded confirmations, Slack DMs, and a Drive folder nobody remembers to open."
- `expandCTA`: "ChravelApp helps work trips stay contained"
- `after`: "A private trip workspace with the meeting itinerary, decks, receipts, per-person tasks, shared and personal base camps, and dinner splits — kept out of your personal texts."
- `badge`: "Aligned team · work chat out of personal texts"
- `href`: "/use-cases/business-travel-coordination"

No other files touched. `href` reuses the page shipped last turn, so the "See how ChravelApp helps" link routes to the fully-authored detail page.

## Out of scope
- No changes to the other 9 scenarios, the featured card, grid layout, or section header copy.

## Verification
- Homepage renders 10 cards; expanding the new one shows Before/After + "See how ChravelApp helps" linking to `/use-cases/business-travel-coordination`.
- `npm run typecheck && npm run lint`.
