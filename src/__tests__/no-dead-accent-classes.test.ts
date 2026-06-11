import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Regression guard for the 2026-06 dead-accent-class fix.
 *
 * `glass-orange` / `glass-yellow` / `glass-crimson` / `glass-blue` were
 * referenced in 31 files but never defined in tailwind.config.ts or
 * index.css, so Tailwind emitted no CSS for them — auth submit buttons,
 * upgrade-modal toggles, and org-dashboard accents rendered unstyled.
 * They were replaced with gold design tokens (gold-primary / gold-mid /
 * primary). This test fails if any source file reintroduces them.
 */
describe('dead accent classes', () => {
  it('glass-orange/yellow/crimson/blue never appear in src', () => {
    const srcDir = path.resolve(__dirname, '..');
    let matches = '';
    try {
      matches = execFileSync(
        'grep',
        [
          '-rln',
          '-E',
          'glass-(orange|yellow|crimson|blue)',
          srcDir,
          '--include=*.tsx',
          '--include=*.ts',
          '--include=*.css',
        ],
        { encoding: 'utf8' },
      );
    } catch (error) {
      // grep exits 1 when nothing matches — that is the passing case
      const status = (error as { status?: number }).status;
      if (status !== 1) throw error;
    }
    const files = matches
      .split('\n')
      .filter(Boolean)
      // this guard file is allowed to name the dead classes
      .filter(f => !f.includes('no-dead-accent-classes'));
    expect(files, `Dead Tailwind classes reintroduced in:\n${files.join('\n')}`).toEqual([]);
  });
});
