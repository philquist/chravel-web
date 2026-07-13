/**
 * PRO-SMOKE — Demo-mode pro trip surface smoke for App Store release gate.
 */
import { test, expect } from '@playwright/test';

test.describe('PRO-SMOKE', () => {
  test('PRO-SMOKE-01: demo entry loads without blank screen', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('TRIPS_DEMO_VIEW', 'app-preview');
    });
    await page.goto('/demo');
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15000 });
  });
});
