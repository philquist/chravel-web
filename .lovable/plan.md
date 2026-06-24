# Concierge UI cleanup + tab-load glitch

## Part 1 — Clean up the Concierge composer

The composer is busy because of a duplicated "Conversation mode" block (label + Switch in `AIConciergeChat.tsx` lines 552–572) **plus** the `ConciergeConversationButton` row underneath (which already shows its own "Hands-free — talk to your concierge like a phone call" caption + mic). That's why the screenshot shows "Conversation mode" *twice* stacked.

### Changes
1. **Remove the inline toggle row** in `src/components/AIConciergeChat.tsx` (lines 552–573) — the `<label>` + `<Switch>` block.
2. **Move the toggle into Concierge settings** by adding a new `ConciergeConversationModeToggle` component (a labeled Switch reading the same `useConversationModePreference` hook) and rendering it in `src/components/consumer/ConsumerAIConciergeSection.tsx` directly above the existing `ConciergeLanguagePicker` (around line 147).
3. **Keep `ConciergeConversationButton` in the composer** (the mic + transcript bar) — but only render it when the user has enabled the mode in settings. If the feature flag is on and the user pref is off, render nothing extra in the composer.
4. Result: composer goes from `[duplicate toggle row] + [Conversation mode caption + mic] + [input]` to just `[mic] + [input]` when enabled, or `[input]` when disabled.

No behavior change to the underlying conversation engine, feature flag, or hook — pure UI relocation.

## Part 2 — Tabs (Polls, Payments, etc.) not loading

I need a quick diagnostic pass before committing a fix, because nothing in the screenshot tells me *why* they don't load. The likely suspects given recent changes:

- An open modal/sheet (e.g. the Concierge or settings modal) intercepting clicks per the single-active-modal rule, so tab taps register but the route doesn't switch.
- A render error inside one of the tabs throwing silently (we'd see it in console).
- Recent voice/streaming hook holding a state lock that blocks tab content mounting.

### Diagnostic step (build mode)
- Run the preview, open the trip, tap Polls/Payments while console logs are captured, and inspect:
  - Console for thrown errors or React warnings on tab mount.
  - Whether the active tab state in `TripDetailContent` actually updates (add a one-line log, remove after).
  - Whether a modal `open` flag is stuck true after closing the Concierge.

### Likely fix paths (pick one after diagnosis)
- **If a stuck modal:** ensure Concierge modal close path resets the shared `activeModal` state on unmount.
- **If a render error:** wrap the offending tab in its existing ErrorBoundary surface and fix the throw.
- **If state-lock from voice hook:** ensure `useConciergeConversationMode` cleans up its session when the Concierge view unmounts (cancel + release mic + reset `state`).

I'll report root cause + the surgical fix in the implementation response rather than guessing now.

## Files touched
- `src/components/AIConciergeChat.tsx` — delete lines 552–573
- `src/components/consumer/ConsumerAIConciergeSection.tsx` — add toggle above language picker
- `src/features/concierge/components/ConciergeConversationModeToggle.tsx` — new, ~30 lines
- Tab fix: TBD after diagnosis (one file expected)

## Risk
Low for Part 1 (UI move, no logic change). Part 2 risk depends on diagnosis; will keep the fix to one file.

## Rollback
Revert the two-commit series; toggle returns to composer, tab fix reverts cleanly.
