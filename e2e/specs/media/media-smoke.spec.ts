/**
 * MEDIA-SMOKE — Demo-mode Media/Photos tab smoke for App Store release gate.
 * Authenticated upload/storage flows still require real credentials + device checks.
 */
import { test, expect } from '@playwright/test';

async function openDemoMedia(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('TRIPS_DEMO_VIEW', 'app-preview');
  });
  await page.goto('/trip/1');
  await page.waitForLoadState('domcontentloaded');
  const mediaTab = page.getByRole('button', { name: /Media|Photos|Gallery/i }).first();
  await expect(mediaTab).toBeVisible({ timeout: 20000 });
  await mediaTab.click();
}

test.describe('MEDIA-SMOKE', () => {
  test('MEDIA-SMOKE-01: Media tab opens on demo trip', async ({ page }) => {
    await openDemoMedia(page);
    await expect(
      page
        .getByText(/Photos|Media|Gallery|Upload|No photos/i)
        .or(page.getByTestId('media-gallery'))
        .first(),
    ).toBeVisible({ timeout: 15000 });
  });
});
