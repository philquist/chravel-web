/**
 * Landscape trip-shell layout contracts.
 *
 * Full MobileTripTabs rendering OOMs in this environment, so we assert the CSS
 * and component source wiring that prevents notch clipping + density collapse.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const read = (relativePath: string): string =>
  readFileSync(resolve(__dirname, relativePath), 'utf8');

describe('mobile trip landscape safe layout', () => {
  it('pads the fixed trip shell with horizontal safe-area insets', () => {
    const css = read('../../../index.css');

    expect(css).toMatch(
      /\.mobile-trip-shell\s*\{[\s\S]*?padding-left:\s*env\(safe-area-inset-left/,
    );
    expect(css).toMatch(
      /\.mobile-trip-shell\s*\{[\s\S]*?padding-right:\s*env\(safe-area-inset-right/,
    );
  });

  it('scopes phone-landscape density under the trip shell', () => {
    const css = read('../../../index.css');

    expect(css).toMatch(
      /@media \(orientation: landscape\) and \(max-height: 500px\)[\s\S]*?\.mobile-trip-shell \.mobile-trip-tab-pill/,
    );
    expect(css).toMatch(
      /@media \(orientation: landscape\) and \(max-height: 500px\)[\s\S]*?\.mobile-trip-shell \.mobile-trip-control-pill/,
    );
    expect(css).toMatch(
      /@media \(orientation: landscape\) and \(max-height: 500px\)[\s\S]*?\.mobile-trip-shell \.mobile-trip-filter-pill/,
    );
  });

  it('wires tab rail and pills to landscape density classes', () => {
    const tabs = read('../MobileTripTabs.tsx');

    expect(tabs).toContain('mobile-trip-tab-rail');
    expect(tabs).toContain('mobile-trip-tab-pill');
    expect(tabs).toContain('data-testid="mobile-trip-tab-rail"');
  });

  it('wires calendar controls and section padding to landscape classes', () => {
    const calendar = read('../MobileGroupCalendar.tsx');

    expect(calendar).toContain('mobile-trip-control-row');
    expect(calendar).toContain('mobile-trip-control-pill');
    expect(calendar).toContain('mobile-trip-section-pad');
    expect(calendar).toContain('mobile-trip-section-title');
    expect(calendar).toContain('mobile-trip-calendar-grid');
  });

  it('marks Places Explore/Base Camps pills for landscape density without desktop px-0 regression', () => {
    const places = read('../../PlacesSection.tsx');

    expect(places).toContain('mobile-trip-filter-pill');
    expect(places).toContain('data-testid="places-subtab-rail"');
    expect(places).toContain('px-4 lg:px-0');
    expect(places).toContain('places-subtab-${tab}');
  });
});
