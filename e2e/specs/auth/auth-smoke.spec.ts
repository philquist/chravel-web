/**
 * AUTH-SMOKE — App Store release-gate auth surface that does not require
 * SUPABASE_SERVICE_ROLE_KEY. Full authenticated signup/login coverage lives in
 * full-auth.spec.ts and is selected by the release gate when the service role
 * is present.
 */
import { test, expect } from '@playwright/test';

test.describe('AUTH-SMOKE', () => {
  test('AUTH-SMOKE-01: /auth renders email and password controls', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.locator('input[type="password"], input[name="password"]').first(),
    ).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
  });

  test('AUTH-SMOKE-02: demo mode entry shows trip surface without auth', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('TRIPS_DEMO_VIEW', 'app-preview');
    });
    await page.goto('/demo');
    await expect(page.locator('body')).toBeVisible();
    await expect(page).toHaveURL(/(\/demo|\/trip|\?from=demo)/);
  });
});
