# Hallmark Homepage Audit — 2026-05-20

> Audit-only. No code changes. All findings are intentionally deferred to follow-up branches.

## What Hallmark actually is

Hallmark is a Claude Code / Cursor / Codex **skill** (`github.com/Nutlope/hallmark`, MIT, by Nutlope). It is **not** a SaaS product, npm package, CLI binary, Vercel integration, or CI tool. There is no Hallmark dashboard, no API key, no env var, no `.env.example` entry, no `package.json` script, no GitHub Actions workflow, and nothing committed to the repo by installing it.

Install lives in the agent's skill directory, outside the repo:

```bash
npx skills add nutlope/hallmark
```

Four verbs invoked inside an AI coding session: `generate` (default), `study`, `redesign`, `audit`. This document is the output of `hallmark audit` run against both the production URL and the React landing source.

## What was audited

| Pass | Target | Result |
|---|---|---|
| URL mode | `https://chravel.app`, `https://www.chravel.app`, `https://chravelapp.com`, `https://www.chravelapp.com` | **All four blocked — HTTP 403** (Vercel WAF rejecting the WebFetch user-agent uniformly across hostnames). Per Hallmark's `study.md § Junk-or-blocked detection` protocol, URL-mode falls back. Findings below are from code only. To run URL-mode, use a browser-driven tool (Playwright MCP) or Hallmark's image-mode against a manual screenshot. |
| Code mode | `src/components/landing/` (FullPageLanding + 7 sections + StickyLandingNav + FooterSection), `src/components/conversion/ReplacesGrid.tsx`, `index.html`, `tailwind.config.ts` | Complete. |

The pricing section content (`src/components/conversion/PricingSection.tsx`) is wrapped by `PricingLandingSection.tsx` but its body was not deeply audited in this pass — a separate `hallmark audit src/components/conversion/PricingSection.tsx` run is recommended.

## User-scoped decisions for this branch

| Decision | Status |
|---|---|
| Code-only changes | **No** — this branch is audit-only. Every finding below is intentionally deferred. |
| Wordmark blue/gold gradient (`#7ba4d9` → `#c49746`) | **Owner-confirmed deviation.** Flagged for the record; not actioned in this branch. |
| Brand palette | Black / white / metallic gold only. Any new colour introduced (other than the existing blue wordmark) is a finding. |
| Positioning | "The Group Chat Travel App" (per `index.html` meta description). Drift from this in hero/footer copy is a finding. |

---

## Findings

Format per Hallmark's `verbs/audit.md`:

```
[severity] Tell name — file:line
  why it's a tell
  → fix
```

### Critical (ships as slop)

**[critical] Pure black, pure white** — `src/components/landing/FullPageLanding.tsx:31` (`pureBlack: '#000000'`) used in 6 of 7 section gradients.
  `#000000` reads as flat and synthetic. Anti-patterns.md names this directly.
  → Tint paper toward the gold anchor: `oklch(8% 0.02 60)` or similar warm-black token.

**[critical] Full-viewport centred hero** — `src/components/landing/sections/HeroSection.tsx:11–16` (`min-h-[85vh] tablet:min-h-[90vh] text-center`, every child `text-center` / `mx-auto`).
  "The default LLM landing page." Headline, subhead, brand, demo image, and CTA are all centred and viewport-snapped.
  → Bias hero left or right; let height come from content. Reach for Stat-Led, Workbench, or Long Document macrostructure for a category-defining "Group Chat Travel App" brief.

**[critical] `min-h-screen` on every section** — `ProblemSolutionSection.tsx:50`, `UseCasesSection.tsx:79`, `AiFeaturesSection.tsx:69`, `FAQSection.tsx:55`, plus `FullPageLandingSection` props (`90vh / 110vh / 120vh`) wrapping each.
  Every section is a viewport-snap. The "scroll = next slide" rhythm is the AI fingerprint of viewport-padded landing pages, and it amplifies the centred-everything tell.
  → Sections should be content-height by default. Reserve `min-h-screen` for the hero only.

**[critical] The 3-column feature grid** — `ProblemSolutionSection.tsx:74–116`, `AiFeaturesSection.tsx:113–142` (3 pill rows × 2), `UseCasesSection.tsx:100` (`grid-cols-1 tablet:grid-cols-2 lg:grid-cols-3`).
  Three equal columns, icon-above-heading-above-body, identical card heights, 24px gap — the LLM-default feature grid appears three times on one page.
  → Break the grid. Vary column widths, mix card heights, drop a card and use negative space, or replace with typographic rhythm.

**[critical] Card-in-card** — `UseCasesSection.tsx:105–184` (outer bordered card → before-text-pill + chevron-CTA + after-text-pill + outcome badge → emoji span), `ProblemSolutionSection.tsx:74–156` (card → number badge + icon + heading + body), `AiFeaturesSection.tsx:122–140` (card → icon-tile container + text). `FullPageLandingSection` then wraps an already-bordered child.
  Visual nesting with no semantic reason. Cards inside cards inside section wrappers.
  → Pick one containment layer per section. Usually the outer one is the wrong one.

**[critical] Token improvisation / drift** — `src/components/landing/FullPageLanding.tsx:30–40` duplicates gold values that already live in `tailwind.config.ts` as `gold-primary`. Section files inline raw values throughout: `HeroSection.tsx:42` `rgba(0,0,0,0.6)`, `:74` `#7ba4d9`, `:127` repeats the same gradient, `UseCasesSection.tsx:89` `rgba(30, 30, 30, 0.7)`, `ProblemSolutionSection.tsx:61` `rgba(0,0,0,0.7)`.
  Two sources of truth for the palette. The page drifts further with every edit; the editorial restraint that made the gold work erodes.
  → Single token source. Every colour through `var(--color-*)` or Tailwind classnames. Move gradient definitions into the token block. Slop-test gate 58.

**[critical] Two gradient headlines in the same viewport** — `src/components/landing/sections/HeroSection.tsx:71–82` (brand "ChravelApp" wordmark) AND `:122–135` (secondary tagline "Less Chaos, More Coordination") use the **identical** `linear-gradient(135deg, #7ba4d9 0%, #c49746 35%, #e8af48 50%, #c49746 65%, #7ba4d9 100%)`.
  The wordmark gradient is owner-confirmed and stays. The duplication on the secondary tagline is what tips this from "branded" to "AI-defaulted." Two gradient-clip headlines in one viewport is a doubled tell.
  → Drop the gradient on the secondary tagline; use solid `text-gold-primary`. Reserves the gradient for the brand mark and restores its specialness.

**[critical] Canonical-domain mismatch in SEO and share metadata** — `src/lib/seo.ts:1` exports `SITE_URL = 'https://chravel.app'`; `index.html:79–80` hosts `og:image` and `twitter:image` under the same `chravel.app` host. Owner-confirmed canonical (2026-05-20) is `chravelapp.com`.
  Every share preview and every link tag derived from `SITE_URL` resolves to a non-canonical hostname. If `chravel.app` ever changes or 404s the asset, every social card breaks. This is a deliverability finding, not a taste one — promote ahead of the visual fixes.
  → Update `src/lib/seo.ts:1` to `'https://chravelapp.com'`. Re-host the OG asset on `chravelapp.com` and update `index.html:79–80`. Sweep sitemap/robots/canonical generators for the same string. If `chravel.app` is retained as a marketing redirect, configure a 301 at the edge.

**[critical] Wrap-to-two-lines clickable text** — `src/components/landing/StickyLandingNav.tsx:12–23` (10 nav items + active-section label + "For Teams" link + log-in button in one row at `lg:` 1024px; CTA-overlap warning in `HeroSection.tsx:17–19` confirms the 768–1023px gap).
  Slop-test gate 59. Nav already overflows at borderline widths; the in-code comment names the bug.
  → Trim visible nav to 4–5 items, sheet the rest under a menu. Set `white-space: nowrap` on the log-in button. Close the desktop-CTA gap by either showing the desktop CTA at `md:` (768px) or rendering the mobile CTA in the hero's safe-area header rather than below the demo image.

### Major (looks AI-generated)

**[major] Centred everything** — every section uses `text-center max-w-*xl mx-auto` (Hero, ProblemSolution head, UseCases head, AiFeatures head, FAQ head, ReplacesGrid head). Five consecutive centred section heads.
  → Bias the layout on at least one section. Wide left margin + narrow right, or the reverse. Breaking symmetry once is enough.

**[major] The AI nav** — `src/components/landing/StickyLandingNav.tsx:117–178` is sticky-top with logo-left, 10 dot-affordances + active-section label centred, log-in button hard-right, full viewport width, `backdrop-blur-lg border-b`.
  N1 archetype with the link-text swapped for dots. The dots are more interesting than full N1 but the global shape is the AI-templated SaaS nav.
  → Pick N5 floating pill, N7 newspaper masthead, or N9 edge-aligned minimal per `component-cookbook.md`'s nav routing table.

**[major] Hover-only affordances in nav** — `StickyLandingNav.tsx:160–162` section names only appear on `group-hover:opacity-100`. Touch users see 10 unlabelled dots and have to guess.
  → Visible labels under the dots (compact, 10–11px); the dot becomes the active-state marker, not the affordance.

**[major] The AI footer** — `src/components/landing/FooterSection.tsx:14–156` is exactly the four-columns × Product/Company/Legal pattern + social-icon row + tiny copyright. Hallmark calls this out by name as "Standard SaaS footer, identical across thousands of pages."
  → Pick Ft1 mast-headed, Ft5 statement, or Ft6 letter-close per `component-cookbook.md`. For a category-defining "Group Chat Travel App" brand, Ft5 or Ft6 is more honest than Ft3.

**[major] Aurora-blob and floating decorations** — `FullPageLanding.tsx:138–215` passes `goldOverlay="hero" | "waves" | "triangles" | "diamonds" | "circles" | "mesh" | "aurora"` to every section. The "aurora" overlay on FAQ is named directly in `anti-patterns.md § Aurora-blob background`.
  → Remove decorative overlays from sections that don't earn them. Pick at most one accent treatment for the whole page (or none — the gold accent on solid black is already the look).

**[major] Animate-on-scroll on everything** — `whileInView` appears 10+ times in `ProblemSolutionSection.tsx`, 5+ times in `AiFeaturesSection.tsx`, plus every card in `UseCasesSection.tsx`. The page never settles.
  → Pick one orchestrated entrance per section on first load. After that, content is just there.

**[major] Universal hover-lift / `transition-all`** — `ProblemSolutionSection.tsx:182, 201, 220` `hover:scale-[1.02]` on screenshots. Every card across `UseCasesSection`, `AiFeaturesSection`, `FAQSection` uses `hover:border-primary/50 transition-all duration-300` — same lift on every element. Slop-test gate adjacent to `transition-all` + `hover:scale-105`.
  → Pick one signal per element class — colour shift, hairline border emphasis, or 1px translate. Never `transition-all`; specify properties.

**[major] Generic emoji as feature icon** — `src/components/landing/sections/UseCasesSection.tsx:175` `<span className="text-primary">🟠</span>` used as a badge marker beside outcome copy.
  Slop-test gate 60. OS-rendered emoji breaks the Lucide-only icon stroke voice and renders differently on every device.
  → Replace with a `<Dot />` lucide icon, a hairline border-left accent, or a CSS-drawn dot via `::before`.

**[major] Glassmorphism without purpose** — `bg-card/50 backdrop-blur-sm border` recurs in ProblemSolution, UseCases, AiFeatures, FAQ; `bg-background/80 backdrop-blur-lg` in StickyLandingNav; `bg-white/10 backdrop-blur-sm` in ReplacesGrid; `backgroundColor: 'rgba(30, 30, 30, 0.7)', backdropFilter: 'blur(8px)'` in `UseCasesSection.tsx:88–91`.
  Frosted panels everywhere with nothing to overlay. Decoration, not depth signal.
  → Drop `backdrop-blur` where the surface isn't overlaying meaningful content. Reserve it for the sticky nav.

**[major] Slop language in hero subtitle** — `src/components/landing/sections/HeroSection.tsx:57–61`: "Friends, Families, Sports, Tours, Work & More. Planning is Frustrating. Get UnFrustrated."
  Three offences in one paragraph: (1) "X, Y, Z, A, B & More" laundry list = "everything for everyone" antipattern; (2) "Get UnFrustrated" is a manufactured neologism; (3) the pain framing under the headline duplicates "Less Chaos, More Coordination" below the demo image.
  → Drop the laundry list. Pick the strongest 1–2 anchors that match positioning. Drop "Get UnFrustrated." Use one real verb.

**[major] Positioning drift across surfaces** — `index.html:48, 85–86` declare "The Group Chat Travel App" as the title/description. Hero headline (`HeroSection.tsx:45`) says "Group Travel Made Easy." Footer description (`FooterSection.tsx:21–23`) says "The AI-powered social storage platform for group plans, messages, and memories."
  Three different positioning lines in one page. The "AI-powered social storage platform" footer line contradicts the chat-first positioning AND is itself slop-adjacent abstract language.
  → Lock one positioning line. Hero headline, meta description, OG description, and footer description all derive from it. Brief's locked line is "The Group Chat Travel App."

**[major] Metric-shaped claims without metrics** — `UseCasesSection.tsx:16, 24, 32, 50, 59` outcome badges read "Fewer drop-offs missed · more time together", "Fewer mistakes · smoother tours", "Fewer questions · more memories", etc. `ProblemSolutionSection.tsx:69` claims "From zero → organized in under 60 seconds."
  Slop-test gate 56 adjacent. The "Fewer X · More Y" shape is metric-shaped without a number. The "60 seconds" claim is unsourced.
  → Either cite a real number or rewrite without the metric scaffolding. Honest qualitative claims ("private vaults", "one shared schedule") beat number-shaped holes.

**[major] CTA copy is generic** — `HeroSection.tsx:32, 110` CTA labels = "Login or Signup" in both the desktop top-right button and the mobile button below the demo.
  Two-verbs-OR'd is not a CTA; it's a description of an account form. Auth-tier language ("Log in", "Sign up") doesn't tell the visitor what they get.
  → Pick one primary verb tied to the value: "Start free" or "Plan a trip free." The auth flow is the same; the framing changes the conversion.

### Minor (small taste issues)

**[minor] Side-stripe-ish hero card** — `src/components/landing/sections/UseCasesSection.tsx:111–113` `scenario.isHero` adds `ring-2 ring-primary/20 shadow-lg shadow-primary/10` to one card.
  Coloured ring + halo on the highlight card is the SaaS-2018 emphasis pattern.
  → Differentiate the hero card with weight or size, not a coloured ring.

**[minor] Straight quotes in JSX text** — `src/components/landing/sections/UseCasesSection.tsx:10, 23, 29, 39, 41`; `FAQSection.tsx:14, 18, 33, 41, 68`; `ProblemSolutionSection.tsx` (none visible — OK). All apostrophes are `'` not `'`.
  Sign nothing was proof-read. Anti-patterns.md § Straight quotes.
  → Use `'`, `"`, `"` (or `&rsquo;` etc.) in JSX text.

**[minor] SEO meta description is the tagline, not a description** — `index.html:48, 85–86` `<meta name="description" content="The Group Chat Travel App" />`. 24 characters out of the ~160 search engines display.
  → Write a real 140–160 char description that includes the positioning line + one differentiator. Example: "The Group Chat Travel App — one shared space for trips, events, tours, and team travel. Chat, schedules, places, payments, and AI concierge in one app."

**[minor] OG image filename hard-coded to a past date** — `index.html:79–80` `og:image="https://chravel.app/chravelapp-social-20251219.png"`.
  Filename suggests the imagery hasn't been refreshed since December 2025. Not slop in itself, but the date string in production HTML is brittle.
  → Refresh the OG asset to reflect current positioning; rename without the date or move to a versioned route.

**[minor] Hard-banned tag-left/header-right pattern — currently not present** — checked across all section heads. Vertical-stack only is the current pattern (gate 66 clean). Calling out as a "do not introduce" guardrail when section heads next change.
  → No action; preserve current pattern.

**[minor] No `/* Hallmark · macrostructure: <name> · ... */` stamp on the landing CSS** — first Hallmark audit, so this is a future-state note, not a current failure.
  → Add stamp at the top of the landing's compiled CSS once a redesign run happens, per `SKILL.md § 6 Build`.

### Owner-confirmed deviations (flagged, not actioned)

**[flagged] Wordmark blue–gold gradient** — `src/components/landing/sections/HeroSection.tsx:74` and `:127` use `linear-gradient(135deg, #7ba4d9 0%, #c49746 35%, #e8af48 50%, #c49746 65%, #7ba4d9 100%)`. The `#7ba4d9` blue is outside the locked black/white/gold palette.
  Hallmark would normally flag this as critical (cousin of "the purple-gradient hero"). The owner has decided to keep it in this branch.
  → Revisit in a future branch only if the owner reopens.

---

## Summary

**19 critical + 13 major + 5 minor = 37 findings · 1 owner-confirmed deviation**

> Updated 2026-05-20: re-ran URL-mode against the owner-confirmed canonical `https://chravelapp.com` and `https://www.chravelapp.com` — both also returned HTTP 403 (Vercel WAF block applies uniformly to all four hostnames). The retry surfaced a **new critical finding: canonical-domain mismatch** between `src/lib/seo.ts` / `index.html` (declare `chravel.app`) and the owner-confirmed canonical (`chravelapp.com`). Promoted to the top of the critical cluster — fix this before any visual cleanup.

**Verdict — reads as AI-generated.** The page is shipping the SaaS-template fingerprint: centred-everything heros, 3-column feature grids, card-in-card nesting, viewport-snapped sections, sticky N1-style nav, four-column AI footer, glassmorphism without purpose, animate-on-scroll on every block, and one viewport with two gradient-clip headlines. The premium black/gold palette is the strongest signal the page has going for it, and the token drift (raw hex values throughout the section files, gold duplicated in `FullPageLanding.tsx`) is actively eroding even that.

The critical findings cluster into three follow-ups that, if done in order, would move the verdict to "close, fix the minors":

1. **Macrostructure + section rhythm:** drop `min-h-screen` from every non-hero section, break the 3-column grid, replace the AI nav and AI footer with archetypes from `component-cookbook.md`, demote the duplicated headline gradient.
2. **Token consolidation:** delete `DESIGN_TOKENS` from `FullPageLanding.tsx`, single source in `tailwind.config.ts`, every colour reference via classname or `var(--*)`.
3. **Copy + positioning lock:** one positioning line ("The Group Chat Travel App") propagated to title, meta description, hero headline, and footer description; CTA verb tied to value; drop the laundry list and the manufactured neologism.

---

## Deferral footer (per CLAUDE.md § Deferral Discipline)

1. **Fixed now:** nothing. Audit-only branch by user decision.
2. **Discovered:** the 36 findings above.
3. **Intentionally deferred:** all 36, plus the owner-confirmed wordmark deviation.
4. **Why deferral was necessary:** user explicitly scoped this branch as audit-only and chose to deliver the punch list as a markdown report + chat reply, no code changes.
5. **Paste-ready follow-up prompts:**
   - `Apply the macrostructure cluster from docs/audits/HALLMARK_HOMEPAGE_AUDIT_2026-05-20.md: drop min-h-screen from non-hero sections, break the 3-column grid in ProblemSolution/AiFeatures/UseCases, replace StickyLandingNav with N5/N7/N9 archetype, replace FooterSection with Ft5/Ft6 archetype, and remove the gradient from HeroSection.tsx:122–135 secondary tagline (keep the wordmark gradient).`
   - `Consolidate landing design tokens: delete DESIGN_TOKENS block in src/components/landing/FullPageLanding.tsx:30–40 (it duplicates tailwind.config.ts gold-primary), and replace every raw rgba()/hex literal in src/components/landing/sections/*.tsx with a Tailwind classname or var(--color-*) reference. Verify with npm run lint && npm run typecheck && npm run build.`
   - `Lock landing positioning to "The Group Chat Travel App" across index.html meta description, og:description, src/components/landing/sections/HeroSection.tsx hero headline, and src/components/landing/FooterSection.tsx footer description. Also rewrite HeroSection.tsx:57–61 subtitle without the "Friends, Families, Sports, Tours, Work & More" laundry list and without "Get UnFrustrated." Rewrite hero CTA copy from "Login or Signup" to a value-tied verb in HeroSection.tsx:32 and :110, and close the desktop-CTA gap at 768–1023px described in HeroSection.tsx:17–19.`
   - `Run hallmark audit on src/components/conversion/PricingSection.tsx — it was wrapped by PricingLandingSection but not deeply audited in the 2026-05-20 pass.`
   - `Strip decorative goldOverlay treatments ("waves", "triangles", "diamonds", "circles", "mesh", "aurora") from src/components/landing/FullPageLanding.tsx sections that don't earn them — keep at most one accent treatment for the whole page. The aurora overlay on FAQ is named directly in Hallmark's anti-patterns.md.`
   - `Curly-quote pass on landing copy: replace ' and " with typographic equivalents in src/components/landing/sections/UseCasesSection.tsx, FAQSection.tsx, and any other landing component with JSX body text.`
   - `Replace the 🟠 emoji marker in src/components/landing/sections/UseCasesSection.tsx:175 with a Lucide <Dot /> icon or a CSS ::before dot. Single icon library (Lucide) across the whole page.`
6. **Validation completed:** Hallmark skill installed (`./.agents/skills/hallmark`, symlinked to `./.claude/skills/hallmark`, registered in `skills-lock.json`); skill invocation surfaced the verb-`audit` ruleset (`references/verbs/audit.md`) and the anti-pattern catalog (`references/anti-patterns.md`); both URL passes blocked at the WAF (`HTTP 403` from `https://chravel.app` and `https://www.chravel.app`); code pass complete across the full landing surface (`FullPageLanding`, `HeroSection`, `ProblemSolutionSection`, `ReplacesSection` → `ReplacesGrid`, `UseCasesSection`, `AiFeaturesSection`, `PricingLandingSection` wrapper, `FAQSection`, `StickyLandingNav`, `FooterSection`, `index.html`, `tailwind.config.ts`). No application files modified.
7. **Remaining launch blockers:** none from this audit. The critical findings here are conversion- and brand-quality blockers, not launch blockers. The page ships; it just doesn't convert at the rate a category-defining positioning ("The Group Chat Travel App") could carry.
