## Scope
Update `/teams` (`src/pages/ForTeams.tsx`) marketing copy and icons only. No billing config, Stripe, or Apple tier changes in this pass.

## Changes

### 1. Pricing card — Starter Pro
- `$49/mo` → `$49.99/mo` (line 219 of `ForTeams.tsx`).
- Note: `src/billing/config.ts` still has `priceMonthly: 49` and a live Stripe `price_id`. Displayed price and charged price will diverge until Stripe + billing config are updated in a follow-up. Confirm if you want that done now.

### 2. Use cases — replace "Greek Life & Chapters" with "Travel Concierge"
- Title: `Travel Concierge`
- Icon: `Headphones` (lucide) — matches concierge/support metaphor
- Description: `White-glove trip planners and concierges coordinating client itineraries, reservations, and logistics across multiple parties`

### 3. Benefit glyphs — swap to match meaning
| Card | Current icon | New icon |
|---|---|---|
| Scale Team Coordination | `Users` | `TrendingUp` (chart up-right, signals scale) |
| Seat & Member Management | `BarChart3` | `Users` (two silhouettes → seats/members) |
| Calendar Sync & Smart Import | `Zap` | `CalendarDays` (calendar grid) |
| Reduce Operational Costs | `Shield` | unchanged |

Update the lucide import list accordingly: add `Headphones`, `TrendingUp`, `CalendarDays`; drop `Zap`, `BarChart3`, `GraduationCap` if no other usage remains in the file.

## Files
- `src/pages/ForTeams.tsx` (only)

## Verification
- Visit `/teams`: pricing card reads `$49.99/mo`; use-case row ends with "Travel Concierge" + headphones glyph; benefit grid shows new icons in the four cards.
- `npm run typecheck && npm run lint && npm run build` pass.
