## Goal
Stop maintaining a hand-written `.light .bg-foo` override list in `index.css`. Instead, drive surface/text/border colors from CSS variables that flip at the `:root` vs `.light` level so every component stays in sync automatically.

## Current state (the problem)
`src/index.css` (lines ~423–600) contains ~40 hardcoded overrides like:
```css
.light .bg-black\/90 { background-color: hsl(0 0% 95%); }
.light .bg-white\/5  { background-color: hsl(0 0% 88%); }
.light .text-white   { color: hsl(0 0% 10%); }
```
Every time a component uses a new dark-only utility (e.g. `bg-black/70`), light mode breaks until someone adds another override. That's exactly the bug we just patched in SettingsMenu.

## Proposed approach: semantic surface tokens

### 1. Define theme tokens in `index.css`
Add a coherent surface/ink scale to both `:root` (dark) and `.light`:
```css
:root {
  --surface-0: 0 0% 4%;     /* page bg */
  --surface-1: 0 0% 8%;     /* card bg */
  --surface-2: 0 0% 12%;    /* raised */
  --surface-3: 0 0% 18%;    /* input bg */
  --overlay:   0 0% 0% / 0.8;
  --ink-1:     0 0% 98%;    /* primary text */
  --ink-2:     0 0% 70%;    /* secondary */
  --ink-3:     0 0% 50%;    /* muted */
  --hairline:  0 0% 100% / 0.10;
}
.light {
  --surface-0: 0 0% 98%;
  --surface-1: 0 0% 96%;
  --surface-2: 0 0% 92%;
  --surface-3: 0 0% 88%;
  --overlay:   0 0% 0% / 0.25;
  --ink-1:     0 0% 10%;
  --ink-2:     0 0% 30%;
  --ink-3:     0 0% 45%;
  --hairline:  0 0% 0% / 0.10;
}
```

### 2. Expose them as Tailwind utilities
In `tailwind.config.ts`, add:
```ts
backgroundColor: {
  'surface-0': 'hsl(var(--surface-0))',
  'surface-1': 'hsl(var(--surface-1))',
  'surface-2': 'hsl(var(--surface-2))',
  'surface-3': 'hsl(var(--surface-3))',
  'overlay':   'hsl(var(--overlay))',
},
textColor: { ink: { 1: '...', 2: '...', 3: '...' } },
borderColor: { hairline: 'hsl(var(--hairline))' },
```

### 3. Keep the override shim — but make it variable-driven
Instead of deleting the existing `.light .bg-black/90 { ... }` rules (which would instantly break ~200 components), rewrite them to consume the same tokens:
```css
.light .bg-black\/90,
.light .bg-black\/80,
.light .bg-gray-900,
.light .bg-card { background-color: hsl(var(--surface-0)); }

.light .bg-white\/5,
.light .bg-gray-800\/50 { background-color: hsl(var(--surface-2)); }

.light .text-white  { color: hsl(var(--ink-1)); }
.light .text-gray-400 { color: hsl(var(--ink-3)); }
```
Now adjusting one variable retunes the whole light theme, and dark mode is the natural default (no override needed).

### 4. Add a guardrail
- New ESLint rule (or a lightweight `scripts/check-hardcoded-surfaces.ts`) that warns when a new file introduces `bg-black/NN` or `bg-white/NN` outside the override allowlist, nudging future code toward `bg-surface-*`.
- Document the tokens at the top of `index.css` and in `docs/ACTIVE/` so future agents reach for `bg-surface-1` instead of `bg-gray-900`.

## What this does NOT do
- No mass find-replace across the 200+ components in this PR. Existing dark utilities keep working through the (now token-driven) shim.
- No visual change in dark mode. Light mode should look identical to today (same HSL values), just sourced from variables.
- No changes to gold/accent/status colors — those stay literal as today.

## Files touched
1. `src/index.css` — add token definitions, rewrite override block to consume them (~80 lines changed, no net growth).
2. `tailwind.config.ts` — register `surface-*`, `ink-*`, `hairline`, `overlay` utilities (~20 lines added).
3. `docs/ACTIVE/THEME_TOKENS.md` (new, ~40 lines) — documents the scale + migration guidance.
4. *(optional)* `scripts/check-hardcoded-surfaces.ts` — advisory check, not blocking.

## Verification
- Toggle Settings → Appearance between Light/Dark on `/`, `/dashboard`, `/trip/:id` (Chat, Calendar, Concierge, Places), `/settings`. Confirm no piecemeal contrast.
- Re-open the screen from the previous bug (Settings → Profile in light mode) — header, modal, and profile card now share one surface.
- `npm run typecheck && npm run build`.

## Risk
LOW–MEDIUM. The shim block stays in place, so the blast radius is limited to whatever surface values shift slightly. Rollback = revert the `index.css` + `tailwind.config.ts` diff (one commit).

## Out of scope (future PRs, behind the new tokens)
- Migrating individual components from `bg-black/90` → `bg-surface-0` in small batches per feature area.
- Same treatment for status colors (success/warn/error) and chat bubbles if desired.

---

**Approve to proceed?** I will not touch component files in this PR.
