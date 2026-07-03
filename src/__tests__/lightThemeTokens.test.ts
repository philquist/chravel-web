import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Hsl = { h: number; s: number; l: number };

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const lightBlock = css.match(/\n\s{2}\.light \{(?<body>[\s\S]*?)\n\s{2}\}/)?.groups?.body ?? '';

function token(name: string): Hsl {
  const match = lightBlock.match(new RegExp(`--${name}:\\s*([0-9.]+)\\s+([0-9.]+)%\\s+([0-9.]+)%`));
  if (!match) throw new Error(`Missing --${name}`);
  return { h: Number(match[1]), s: Number(match[2]) / 100, l: Number(match[3]) / 100 };
}

function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return [r1 + m, g1 + m, b1 + m];
}

function luminance(color: Hsl) {
  const [r, g, b] = hslToRgb(color).map(channel =>
    channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Hsl, b: Hsl) {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('light theme semantic tokens', () => {
  it('keeps core text and CTA pairings WCAG AA compliant', () => {
    expect(contrast(token('foreground'), token('background'))).toBeGreaterThanOrEqual(7);
    expect(contrast(token('card-foreground'), token('card'))).toBeGreaterThanOrEqual(7);
    expect(contrast(token('popover-foreground'), token('popover'))).toBeGreaterThanOrEqual(7);
    expect(contrast(token('primary-foreground'), token('primary'))).toBeGreaterThanOrEqual(7);
    expect(contrast(token('muted-foreground'), token('muted'))).toBeGreaterThanOrEqual(4.5);
    // Deepened gold accent must be readable as text/icons on the ivory page.
    expect(contrast(token('accent'), token('background'))).toBeGreaterThanOrEqual(4.5);
  });

  it('uses bright warm surfaces instead of gray light-mode foundations', () => {
    expect(token('background').l).toBeGreaterThanOrEqual(0.97);
    expect(token('card').l).toBeGreaterThanOrEqual(0.99);
    expect(token('surface-0').s).toBeGreaterThan(0.4);
    expect(token('surface-0').l).toBeGreaterThanOrEqual(0.97);
  });

  it('keeps ink warm — no cool navy text on warm ivory paper', () => {
    // Warm hue band (roughly red-orange→yellow). The old palette's hue-220
    // navy ink is exactly what made light mode read as mismatched.
    for (const name of ['foreground', 'ink-1', 'ink-2', 'ink-3', 'muted-foreground']) {
      expect(token(name).h, `--${name} should be warm-hued`).toBeGreaterThanOrEqual(20);
      expect(token(name).h, `--${name} should be warm-hued`).toBeLessThanOrEqual(50);
    }
  });

  it('keeps the inset surface ladder monotonic (2 → 4 step deeper)', () => {
    expect(token('surface-2').l).toBeGreaterThan(token('surface-3').l);
    expect(token('surface-3').l).toBeGreaterThan(token('surface-4').l);
    // Card floats above the page; borders do the edge work.
    expect(token('surface-1').l).toBeGreaterThan(token('surface-0').l);
    // The bottom of the ladder must stay bright — no tan/beige drift.
    expect(token('surface-4').l).toBeGreaterThanOrEqual(0.87);
  });

  it('keeps gold as the brand primary in light mode (black ink on gold fill)', () => {
    expect(token('primary').h).toBeGreaterThanOrEqual(30);
    expect(token('primary').h).toBeLessThanOrEqual(45);
    expect(token('primary').s).toBeGreaterThan(0.4);
    // Contrast rule from the accent design system: black text on gold.
    expect(token('primary-foreground').l).toBeLessThanOrEqual(0.1);
  });
});
