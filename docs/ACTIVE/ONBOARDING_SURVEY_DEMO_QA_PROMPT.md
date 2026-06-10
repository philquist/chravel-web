# Onboarding Survey & Demo — QA Verification Prompt

> Paste-ready prompt for a QA/verification agent (browser agent, `/verify`, or a human tester).
> Covers the choose-your-own-adventure onboarding shipped in PR #693:
> choice screen → (Trip Chaos survey → personalized tour) | (demo tour) | (skip to dashboard).
>
> **Skip vs. exit are different things. Skip is a forward path. Exit is an escape hatch.
> Test both.** A flow can have a working "Skip" button and still trap users who want out
> from a middle screen.

## System Under Test

| Surface | File | Exit affordance |
|---|---|---|
| Choice screen | `src/features/onboarding/components/OnboardingChoiceScreen.tsx` | "Jump straight in" door (skip-to-app) |
| Survey (5 questions + result) | `src/features/onboarding/components/TripChaosDiagnostic.tsx` | Header **X** on every step → returns to choice screen |
| Demo tour (10 screens) | `src/components/onboarding/OnboardingCarousel.tsx` | Header **X** on every screen + "Skip demo" text button (non-final screens) + `Escape` key → completes onboarding, lands on dashboard |
| Routing/gating | `src/pages/Index.tsx` (`showOnboarding` block) | Feature flag `onboarding_survey` (kill switch, default OFF) |
| Survey state | `src/features/onboarding/hooks/useChaosSurveyStore.ts` | Per-user persisted path; survey restarts fresh after exit |

Intended exit semantics (the "correct prior route or intended fallback"):

- **Survey X (any step, including result):** return to the choice screen. Nothing is
  submitted; re-entering the survey starts fresh. No auth/session change.
- **Demo X / "Skip demo" / Escape (any screen):** complete onboarding (`skipOnboarding`)
  and land on the dashboard — or the pending destination (e.g. `/join/<code>`) if one was
  captured before onboarding.
- **Choice screen "Jump straight in":** same as demo exit — onboarding complete, dashboard.

## Expected Correct Behavior

1. Login/onboarding flow works cleanly:
   - User can take the survey.
   - User can skip the survey.
   - User can exit the survey from **any survey screen** without getting trapped, losing route state, or causing auth/session issues.
   - User can open/view the demo flow.
   - User can exit the demo from **any demo screen** without getting trapped, losing route state, or causing auth/session issues.
   - User can skip directly into the app/dashboard when allowed.
   - Exit/close/skip controls are visible, tappable on mobile, keyboard-accessible, and behave consistently across all survey/demo steps.
   - No auth loops, blank screens, dead buttons, broken redirects, or mobile-only failures.

2. The choice screen appears exactly once for a new authenticated user when the
   `onboarding_survey` flag is ON, and never for users who already completed or skipped
   onboarding.
3. While the feature flag query is pending, the user sees a neutral loading state — never
   a flash of the legacy carousel that then ejects to the choice screen.
4. With the flag OFF (or the flag fetch failing), behavior falls back to the legacy
   tour-from-screen-0 — no choice screen, no survey.
5. Survey answers gate forward navigation (Continue disabled until answered); back
   navigation works from question 2 onward.
6. Reaching the survey result submits exactly once; a failed save shows a quiet toast and
   never blocks progression to the tour.
7. The tour opens on the screen personalized to the user's stated biggest pain
   (`painToScreen`), or screen 0 on the demo path.
8. Pending destinations (invite deep links via `chravel_pending_invite_code`) survive the
   entire flow and are navigated to after completion or skip — through every path
   including mid-flow exits.
9. Survey/path state is keyed per user: a previous user's choices on a shared device do
   not suppress or alter the flow for a new signup.
10. Refreshing mid-flow resumes sanely (persisted path), with no blank screen and no
    duplicate submission.

## Manual QA

1. Fresh signup (flag ON) → choice screen renders with all three doors.
2. Choose "Get my Trip Chaos Score" → answer all 5 questions → result screen shows a
   score → "Show me around" opens the tour on the personalized screen.
3. On each survey question, verify Continue is disabled until an answer is selected, and
   the back button appears from question 2 onward and works.
4. Choose "Show me the demo" → tour starts at screen 0 → complete all 10 screens →
   lands on dashboard.
5. Choose "Jump straight in" → lands directly on dashboard; onboarding never reappears
   on subsequent logins.
6. Tour final screen: "Create a trip" opens the create modal; "Explore demo trip" opens
   `/trip/1` in demo preview without "Couldn't Load Trip".
7. Refresh mid-survey and mid-tour → flow resumes without blank screen, auth loop, or
   double submission.
8. Sign out and back in after completing/skipping → no onboarding re-trigger.
9. Flag OFF → fresh signup sees the legacy carousel from screen 0 (no choice screen);
   flag flip takes effect within the 60s cache TTL.
10. Slow network (throttled): during flag resolution the screen is a neutral background —
    no carousel flash.
11. Invite deep link (`/join/<code>`) before onboarding → complete any path → user lands
    on the join route, not the dashboard.
12. Simulate survey save failure (block the network call) → toast appears, user still
    reaches the result CTA and the tour.
13. User can exit the survey from every survey screen.
14. User can exit the demo from every demo screen.
15. Exit behavior returns the user to the correct prior route or intended fallback route.
16. Exit controls remain visible and tappable on mobile, including small viewports.

## Edge Cases

- Flag query errors (network failure) → treated as OFF; legacy behavior, no crash.
- Two tabs open during onboarding → completing in one doesn't strand the other in a
  broken state on next interaction.
- `initialScreen` out of range (stale persisted `personalizedScreen`) → clamped, no crash.
- Keyboard-only run-through: Tab/Enter to answer and advance; `Escape` exits the demo;
  survey X reachable and activatable via keyboard.
- Screen-reader pass: dialogs are announced (`role="dialog"` + labels); exit controls have
  accessible names ("Skip survey", "Skip onboarding").
- Demo-mode session (unauthenticated preview) never sees the survey, and survey state
  never contaminates demo mode.
- User exits survey on first screen.
- User exits survey on middle screen.
- User exits survey on final screen before submitting.
- User exits demo on first screen.
- User exits demo on middle screen.
- User exits demo on final screen before completing.
- User exits, reopens, and resumes/restarts according to intended product behavior.

## Definition of Done

- [ ] All Manual QA steps pass on desktop web, mobile web (≤ 390px viewport), and the
      installed/PWA shell.
- [ ] Choice screen shows once per new user; never for returning/completed users.
- [ ] No carousel flash during flag resolution; flag OFF falls back to legacy tour.
- [ ] Survey submits exactly once; save failure is non-blocking with a visible toast.
- [ ] Personalized tour start matches the selected biggest pain.
- [ ] Pending invite destinations survive every path (complete, skip, exit).
- [ ] No console errors, auth loops, or blank screens at any step.
- [ ] User can exit the survey from any survey screen.
- [ ] User can exit the demo from any demo screen.
- [ ] Exit controls are visible, mobile-tappable, and keyboard-accessible.
- [ ] Exit behavior returns users to the correct prior route or safe fallback route.
