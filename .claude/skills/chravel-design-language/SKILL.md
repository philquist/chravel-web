---
name: chravel-design-language
description: Enforce Chravel's premium dark/gold design system. Ensure new UI matches existing patterns for surfaces, typography, buttons, modals, cards, and empty states. Use when building new UI or reviewing UI changes for design consistency. Triggers on "design system", "does this match our style", "premium feel", "dark theme consistency", "gold accent".
---

# Chravel Design Language Enforcer

Chravel uses a premium dark + metallic-gold design system. Every new UI must match.
Source of truth: `src/index.css` (CSS variables + component classes), `tailwind.config.ts`
(tokens), and `docs/ACCENT_DESIGN_SYSTEM.md` (gold usage rules).

## The Gold System (NOT amber)

The brand gold is **metallic** — `#c49746` — never Tailwind `amber-*` or `yellow-*`.

| Token | Value | Use |
| --- | --- | --- |
| `primary` / `gold-primary` | `#c49746` | Primary brand accent, CTAs, focus |
| `gold-mid` | `#e8af48` | Warm glow, gradient endpoint |
| `gold-light` | `#feeaa5` | Champagne highlight text |
| `gold-dark` | `#533517` | Dark bronze gradient anchor |

**Two treatments, by surface:**
- **App UI (in-product):** gold *ring* — `accent-ring-active` / `accent-ring-idle` classes,
  or token utilities (`bg-primary/10 border-primary/40 shadow-ring-glow`).
- **Marketing / conversion CTAs:** gold *fill* — `accent-fill-gold` class (gradient,
  **black text**, glow, hover handled). Available as `<Button variant="premium">`.

**Contrast rule:** anything on a solid gold fill uses `text-primary-foreground` (black).
Never white text/icons on gold.

⚠️ **Dead classes — never use:** `glass-orange`, `glass-yellow`, `glass-crimson`,
`glass-blue` (+`-light` variants). They were never defined in Tailwind; they render
nothing. Removed repo-wide in the 2026-06 polish pass.

⚠️ **Dynamic class names don't work:** `text-${color}` is invisible to Tailwind's
scanner — always write literal class strings.

## Surfaces & Text

- App background: `bg-background` (pure black) / page scale `bg-surface-0..4`
- Card: `Card` primitive (`bg-card`, `rounded-enterprise`, `shadow-enterprise`) or
  `bg-white/5 border border-white/10` glass
- Hover accent: `hover:border-primary/25`, `hover:bg-white/10`
- Text scale: `text-foreground` / `text-ink-1` → `text-ink-2` (secondary) →
  `text-ink-3` (muted). Prefer ink tokens over `text-gray-*` (light mode flips free).

## Radius canon

Controls/inputs `rounded-xl` · chips/avatars/pills `rounded-full` · cards `rounded-2xl`
(or `rounded-enterprise`) · modals `rounded-2xl`/`rounded-3xl`, sheets `rounded-t-2xl` ·
small inline elements `rounded-lg`.

## Elevation & motion

- Cards: `shadow-enterprise`, hover `shadow-enterprise-md`; modals `shadow-enterprise-lg`
- Gold emphasis: `shadow-ring-glow` (calm) — prefer over `animate-pulse` for urgency
- Hover lift: `motion-safe:hover:-translate-y-1` — never `hover:scale-[1.02]` on cards
- Buttons get press feedback from the base variant (`motion-safe:active:scale-[0.98]`) —
  don't add one-off `hover:scale-105`
- Gate all animation with `motion-safe:` / respect `prefers-reduced-motion`

## Components

- **Buttons:** use `ui/button.tsx` variants — `default` (gold), `premium` (gold fill,
  marketing), `outline`, `ghost`, `destructive`. Avoid className color overrides.
- **Badges:** `ui/badge.tsx` — incl. `gold` variant for premium status chips.
- **Modals:** Radix `Dialog`/`ResponsiveModal` (dialog desktop / drawer mobile). If a
  hand-rolled portal is unavoidable, backdrop = `.modal-backdrop` + explicit z-index;
  card = `bg-card/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-enterprise-lg`.
- **Inputs:** `ui/input.tsx` (48px, gold focus ring). Raw inputs must keep a visible
  focus state: `focus:ring-2 focus:ring-primary/50` or `focus:border-primary`.
- **Skeletons:** `ui/skeleton.tsx` (shimmer built in) — don't hand-roll `animate-pulse`.
- **Typography:** semantic scale exists (`text-display/h1/h2/h3/body/caption` +
  `-desktop` variants) — prefer it in new code; add `tracking-tight` to large bold titles.
- **Brand wordmark:** `text-gradient-gold` (forces `text-shadow: none`; safe on Android).

## Mobile

- Touch targets ≥ 44px (`min-h-[44px]`); no hover-only affordances — pattern:
  `opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100`
- Safe areas: `env(safe-area-inset-*)`; bottom nav is `NativeTabBar` (Index.tsx)
- Breakpoints are iOS-centric: `md` = **428px**, `tablet` = 768px, `lg` = 1024px
  (matches `useIsMobile`). Never assume `md` is 768.

## Rules

- New UI MUST use these tokens — no ad-hoc hexes, no `amber-*`/`yellow-*` gold
- Dark-first; light mode comes free via tokens (`.light` remaps) — don't hardcode
- Gold is for primary CTAs, active states, and brand moments — do not overuse
- Maintain contrast ratios (black on gold, never white on gold)
- When in doubt, check `src/components/ui/` and `docs/ACCENT_DESIGN_SYSTEM.md`
