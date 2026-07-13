/**
 * PAYMENTS-SMOKE — Demo-mode Payments tab smoke for App Store release gate.
 * Authenticated settlement flows still require SERVICE_ROLE + dashboard verification.
 */
import { test, expect } from '@playwright/test';

async function openDemoPayments(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('TRIPS_DEMO_VIEW', 'app-preview');
  });
  await page.goto('/trip/1');
  await page.waitForLoadState('domcontentloaded');
  const paymentsTab = page.getByRole('button', { name: /Payments|Money|Expenses/i }).first();
  await expect(paymentsTab).toBeVisible({ timeout: 20000 });
  await paymentsTab.click();
}

test.describe('PAYMENTS-SMOKE', () => {
  test('PAYMENTS-SMOKE-01: Payments tab opens on demo trip', async ({ page }) => {
    await openDemoPayments(page);
    await expect(
      page
        .getByText(/Payments|Expenses|Balances|Split|Who owes/i)
        .or(page.getByTestId('payments-panel'))
        .first(),
    ).toBeVisible({ timeout: 15000 });
  });
});
