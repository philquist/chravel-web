## Goal
Remove every `Sparkles` icon from the app and swap in a glyph that fits the surrounding feature. Icon-only change — no copy, layout, color, or behavior edits.

## Scan results
30 usages across 24 files. Grouped by context with proposed replacement (all from `lucide-react`).

### AI / Concierge / smart-parse → `Wand2`
Magic-wand reads as "AI assist" without the generic-AI sparkle.
- `src/components/ai/ConciergeSearchModal.tsx` (2 uses — header + result-type icon)
- `src/components/consumer/ConsumerAIConciergeSection.tsx` (header)
- `src/components/ui/ActionPill.tsx` (`aiOutline` variant auto-icon — affects every AI action pill)
- `src/features/chat/components/ParsedContentSuggestions.tsx` (2 uses — section header + "other" type)
- `src/features/smart-import/components/SmartImportGmail.tsx` (AI badge)
- `src/features/calendar/components/CalendarImportModal.tsx` (AI parse button)
- `src/components/events/AgendaImportModal.tsx` (2 uses — AI parse buttons)
- `src/components/events/LineupImportModal.tsx` (AI parse button)
- `src/components/events/EnhancedAgendaTab.tsx` (AI generate button)
- `src/components/AddPlaceModal.tsx` (AI suggestion chip)
- `src/components/payments/PaymentInput.tsx` (2 uses — analyzing pulse + high-confidence badge)

### Premium / upgrade / Plus tier → `Crown`
Project already uses `Crown` for premium elsewhere (e.g. `TripExportModal`).
- `src/components/UpgradeModal.tsx` (2 uses — pill + hero icon)
- `src/components/PlusUpsellModal.tsx` (2 uses — hero + CTA)
- `src/components/conversion/PricingSection.tsx` (Plus tier icon)
- `src/components/conversion/TripPassModal.tsx` (Trip Pass feature icon)
- `src/components/consumer/ConsumerBillingSection.tsx` (plan benefit)
- `src/components/trip/TripExportModal.tsx` (premium-feature badge inside export)

### Trip preview / Join / Recs match indicators → `Star`
"Highlight / match quality" semantics.
- `src/pages/TripPreview.tsx` (match indicator)
- `src/pages/JoinTrip.tsx` (match indicator)
- `src/pages/ChravelRecsPage.tsx` (promoted badge)

### One-off contextual swaps
- `src/features/onboarding/components/SurveyResultScreen.tsx` "Show me the demo" CTA → `Play` (matches OnboardingChoiceScreen).
- `src/components/onboarding/demo/screens/FinalCTAScreen.tsx` "Explore demo trip" → `Compass`.
- `src/components/demo/DemoTripBar.tsx` "Demo mode" indicator → `FlaskConical`.
- `src/components/TripPreferences.tsx` preferences header → `SlidersHorizontal`.
- `src/components/pro/TeamOnboardingBanner.tsx` onboarding callout → `PartyPopper`.

## Mechanics
For each file: replace `Sparkles` in the `lucide-react` import with the chosen icon, then replace each `<Sparkles ... />` JSX site with the new component. Keep every prop (`size`, `className`, color tokens, animations) identical. No other edits.

## Verification
- Grep confirms zero `Sparkles` references remain under `src/`.
- Typecheck + build pass.
- Spot-check the two screens from your screenshots (Survey result CTA, FinalCTA "Explore demo trip"), plus AI Concierge header and Upgrade modal.

## Out of scope (flag, don't touch)
None — every Sparkles site is covered above. If you'd rather use a single replacement everywhere (e.g. all `Wand2`), say the word and I'll collapse the mapping.