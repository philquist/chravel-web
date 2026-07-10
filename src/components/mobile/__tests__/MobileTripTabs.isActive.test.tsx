/**
 * Source-contract regression: Concierge isActive must track live activeTab.
 *
 * Rendering MobileTripTabs in this cloud agent OOMs (12GB+) because Tier-1/2
 * pre-mount + Suspense still pulls a large graph. Assert the dep contract in
 * source instead — the bug was omitting `activeTab` from renderTabContent deps.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('MobileTripTabs Concierge isActive contract', () => {
  it('includes activeTab in renderTabContent useCallback deps', () => {
    const source = readFileSync(resolve(__dirname, '../MobileTripTabs.tsx'), 'utf8');

    // The Concierge branch must compute isActive from the live activeTab…
    expect(source).toMatch(/isActive=\{activeTab === tabId\}/);

    // …and activeTab must appear in the useCallback dependency list that
    // closes over that expression. Omitting it freezes isActive=false and
    // Search auto-closes on open.
    const renderTabContentMatch = source.match(
      /const renderTabContent = useCallback\([\s\S]*?\},\s*\[([\s\S]*?)\],\s*\);/,
    );
    expect(renderTabContentMatch).not.toBeNull();
    const deps = renderTabContentMatch![1];
    expect(deps).toMatch(/\bactiveTab\b/);
  });
});
