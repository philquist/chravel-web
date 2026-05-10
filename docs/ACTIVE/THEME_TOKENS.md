# Theme Tokens — Surface / Ink Scale

Source of truth for theme-flippable surfaces, text, and borders.
Defined in `src/index.css` (`:root` for dark, `.light` for light).
Exposed to Tailwind in `tailwind.config.ts`.

## Why this exists

Before this scale, every dark-only utility (`bg-black/90`, `bg-gray-800`,
`text-white`) needed a hand-written `.light .bg-foo { ... }` override in
`index.css`. Each new dark utility introduced was a latent light-mode bug
(see Settings → Profile contrast clash, May 2026).

Now both themes resolve through one set of CSS variables, and the existing
override block is just a *shim* that maps legacy utilities onto those
variables. Adjusting a single token retunes the entire theme.

## The scale

| Token            | Dark        | Light       | Use for                            |
| ---------------- | ----------- | ----------- | ---------------------------------- |
| `--surface-0`    | `0 0% 4%`   | `0 0% 96%`  | Page background, full-bleed sheets |
| `--surface-1`    | `0 0% 8%`   | `0 0% 92%`  | Cards, primary modals              |
| `--surface-2`    | `0 0% 12%`  | `0 0% 88%`  | Raised surfaces, list rows         |
| `--surface-3`    | `0 0% 18%`  | `0 0% 84%`  | Inputs, hovered rows               |
| `--surface-4`    | `0 0% 22%`  | `0 0% 80%`  | Active/pressed, deep hovers        |
| `--overlay-strong` | `0 0% 0% / 0.85` | `0 0% 0% / 0.25` | Dialog scrim |
| `--overlay-soft` | `0 0% 0% / 0.45` | `0 0% 0% / 0.10` | Subtle scrim |
| `--ink-1`        | `0 0% 98%`  | `0 0% 10%`  | Primary text                       |
| `--ink-2`        | `0 0% 70%`  | `0 0% 32%`  | Secondary text                     |
| `--ink-3`        | `0 0% 50%`  | `0 0% 45%`  | Muted / placeholder                |
| `--ink-on-accent`| `0 0% 100%` | `0 0% 100%` | Text on gold/blue/etc.             |
| `--hairline-soft`| `0 0% 100% / 0.10` | `0 0% 0% / 0.08` | Dividers           |
| `--hairline-strong` | `0 0% 100% / 0.20` | `0 0% 0% / 0.15` | Borders         |

## Tailwind utilities (preferred for new code)

```tsx
<div className="bg-surface-1 text-ink-1 border border-hairline">…</div>
<button className="bg-surface-2 hover:bg-surface-3 text-ink-1">…</button>
<div className="fixed inset-0 bg-overlay-strong" />
```

Available classes:

- `bg-surface-0` … `bg-surface-4`
- `bg-overlay-strong`, `bg-overlay-soft`
- `text-ink-1`, `text-ink-2`, `text-ink-3`, `text-ink-on-accent`
- `border-hairline`, `border-hairline-strong`

## Legacy utilities (still supported, but discouraged)

`bg-black/N`, `bg-gray-N`, `bg-slate-N`, `bg-zinc-N`, `bg-neutral-N`,
`text-white`, `text-gray-N`, `border-white/N` are remapped onto the
scale by the shim block in `src/index.css`. They will keep working,
but new components should use the semantic utilities above so theme
adjustments stay centralized.

## Out of scope

- Gold accents (`--accent-*`) — single-theme by design.
- Status colors (success / warn / destructive) — handled separately.
- Chat bubbles (`--chat-bubble-*`) — already theme-aware.

## Migration path

This PR introduces the tokens and routes the existing shim through them.
Component-by-component migration from `bg-black/90` → `bg-surface-0` will
happen in follow-up PRs scoped per feature area, so blast radius stays
small.
