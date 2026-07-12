/**
 * CONCIERGE-DEVICE-SMOKE — Production-device Concierge smoke suite
 *
 * Validates the App Store / Play Store launch path on mobile viewports:
 *   1. Search opens and stays open while Concierge is active
 *   2. Upload exposes a real file input (native picker on device; setInputFiles in CI)
 *   3. Attached image preview renders (Concierge attachment pipeline)
 *   4. Waveform dictation control is present and tappable
 *   5. Send enables after composer text
 *   6. Pending-action cards render for task / poll / calendar tools (static contract)
 *
 * Demo-mode cases run without credentials. Authenticated send + live tool creation
 * skip gracefully when SUPABASE_URL / anon key sign-up cannot obtain a session.
 *
 * Run (local mobile emulation):
 *   npx playwright test e2e/specs/concierge/mobile-device-smoke.spec.ts
 *
 * Run (production web bundle, no local server):
 *   PLAYWRIGHT_TEST_BASE_URL=https://chravel.app PLAYWRIGHT_SKIP_WEBSERVER=1 \
 *     npx playwright test e2e/specs/concierge/mobile-device-smoke.spec.ts --project='Mobile Safari'
 */

import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const DEFAULT_PASSWORD = 'TestPassword123!E2E';

async function openDemoConcierge(page: Page): Promise<boolean> {
  await page.addInitScript(() => {
    window.localStorage.setItem('TRIPS_DEMO_VIEW', 'app-preview');
  });
  await page.goto('/trip/1');
  await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => null);

  const conciergeTab = page.locator('button:has-text("Concierge")').first();
  try {
    await conciergeTab.waitFor({ state: 'visible', timeout: 20000 });
  } catch {
    return false;
  }
  await conciergeTab.click();

  const composerRail = page.getByTestId('concierge-composer-rail');
  await composerRail.waitFor({ state: 'visible', timeout: 20000 });
  return true;
}

function composer(page: Page) {
  return page.getByTestId('concierge-composer-rail');
}

async function signUpTestUser(email: string): Promise<{ session: string; userId: string } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signUp({ email, password: DEFAULT_PASSWORD });
  if (error) throw new Error(`signUp failed: ${error.message}`);
  if (!data.session) return null;
  return { session: data.session.access_token, userId: data.user!.id };
}

function makeAuthClient(accessToken: string) {
  return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function createTrip(
  accessToken: string,
  options: { name: string; userId: string },
): Promise<string | null> {
  const client = makeAuthClient(accessToken);
  const { data, error } = await client
    .from('trips')
    .insert({
      name: options.name,
      destination: 'E2E Concierge Smoke City',
      created_by: options.userId,
      trip_type: 'consumer',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    })
    .select('id')
    .single();
  if (error) {
    console.warn(`[CONCIERGE-SMOKE] createTrip failed: ${error.message}`);
    return null;
  }
  const { error: memberError } = await client.from('trip_members').insert({
    trip_id: data.id,
    user_id: options.userId,
    role: 'admin',
    status: 'active',
  });
  if (memberError) {
    console.warn(`[CONCIERGE-SMOKE] member insert failed: ${memberError.message}`);
  }
  return data.id;
}

async function loginViaBrowser(page: Page, email: string): Promise<boolean> {
  await page.goto('/auth');
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  if (!(await emailInput.isVisible({ timeout: 8000 }).catch(() => false))) {
    return false;
  }
  await emailInput.fill(email);
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(DEFAULT_PASSWORD);
  const submit = page.locator('button[type="submit"]').first();
  await submit.click();
  await page.waitForURL(url => !url.pathname.includes('/auth'), { timeout: 20000 }).catch(() => null);
  return !page.url().includes('/auth');
}

const test = base.extend<{ testAuth: { email: string; session: string; userId: string } | null }>({
  testAuth: async ({}, provide) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      await provide(null);
      return;
    }
    const email = `qa-concierge-smoke-${Date.now()}@test.chravel.com`;
    try {
      const auth = await signUpTestUser(email);
      await provide(auth ? { email, ...auth } : null);
    } catch (err) {
      console.warn('[CONCIERGE-SMOKE] testAuth setup failed:', err);
      await provide(null);
    }
  },
});

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test.describe('CONCIERGE-DEVICE-SMOKE — demo mobile controls', () => {
  test.beforeEach(async ({ page }) => {
    const opened = await openDemoConcierge(page);
    if (!opened) test.skip(true, 'Demo trip unavailable');
  });

  test('SMOKE-01: Search opens from touch pointer on mobile', async ({ page }) => {
    const searchBtn = page.getByTestId('header-search-btn');
    await expect(searchBtn).toBeVisible({ timeout: 10000 });

    await searchBtn.dispatchEvent('pointerdown', { pointerType: 'touch' });
    await expect(page.getByPlaceholder(/search across trip/i)).toBeVisible({ timeout: 5000 });
  });

  test('SMOKE-02: Upload file input accepts image and shows preview', async ({ page }) => {
    const uploadLabel = page.getByTestId('header-upload-btn');
    await expect(uploadLabel).toBeVisible({ timeout: 10000 });

    const fileInput = uploadLabel.locator('input[type="file"]');
    await expect(fileInput).toHaveCount(1);

    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const tmpPath = path.join(os.tmpdir(), `concierge-smoke-${Date.now()}.png`);
    fs.writeFileSync(tmpPath, Buffer.from(pngBase64, 'base64'));

    await fileInput.setInputFiles(tmpPath);
    const fileName = path.basename(tmpPath);
    await expect(page.locator(`img[alt="${fileName}"]`)).toBeVisible({
      timeout: 8000,
    });

    fs.unlinkSync(tmpPath);
  });

  test('SMOKE-03: Waveform dictation control is visible and tappable', async ({ page }) => {
    const waveform = composer(page).getByTestId('concierge-waveform-dictation-btn');
    await expect(waveform).toBeVisible({ timeout: 10000 });
    await waveform.tap();
    await expect(waveform).toBeVisible();
  });

  test('SMOKE-04: Send enables after composer text on mobile', async ({ page }) => {
    const sendBtn = composer(page).getByTestId('concierge-send-btn');
    await expect(sendBtn).toBeVisible({ timeout: 10000 });
    await expect(sendBtn).toHaveAttribute('aria-disabled', 'true');

    const composerInput = composer(page).locator('textarea[class*="rounded-2xl"]').first();
    await composerInput.fill('Smoke test — what is on our calendar tomorrow?');
    await expect(sendBtn).toHaveAttribute('aria-disabled', 'false', { timeout: 3000 });
  });

  test('SMOKE-05: Search, Upload, Waveform, and Send coexist in composer rail', async ({
    page,
  }) => {
    await expect(page.getByTestId('header-search-btn')).toBeVisible();
    await expect(page.getByTestId('header-upload-btn')).toBeVisible();
    await expect(composer(page).getByTestId('concierge-waveform-dictation-btn')).toBeVisible();
    await expect(composer(page).getByTestId('concierge-send-btn')).toBeVisible();
    await expect(composer(page)).toBeVisible();
  });
});

test.describe('CONCIERGE-DEVICE-SMOKE — authenticated send (skips without session)', () => {
  test('SMOKE-06: Send clears composer or shows loading spinner', async ({ page, testAuth }) => {
    if (!testAuth) {
      test.skip(true, 'No auth session — email confirmation may be required');
      return;
    }

    const tripId = await createTrip(testAuth.session, {
      name: `Concierge Device Smoke ${Date.now()}`,
      userId: testAuth.userId,
    });
    if (!tripId) {
      test.skip(true, 'Trip creation failed');
      return;
    }

    const loggedIn = await loginViaBrowser(page, testAuth.email);
    if (!loggedIn) {
      test.skip(true, 'Browser login failed');
      return;
    }

    await page.goto(`/trip/${tripId}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => null);

    const conciergeTab = page.locator('button:has-text("Concierge")').first();
    await conciergeTab.waitFor({ state: 'visible', timeout: 15000 });
    await conciergeTab.click();

    const composer = page.locator('textarea[class*="rounded-2xl"]').first();
    await composer.waitFor({ state: 'visible', timeout: 15000 });
    await composer.fill('Quick smoke: list one restaurant idea near our destination.');
    await page.getByTestId('concierge-send-btn').tap();

    await expect
      .poll(
        async () => {
          const spinner = await page
            .locator('[class*="animate-spin"]')
            .first()
            .isVisible()
            .catch(() => false);
          if (spinner) return true;
          const val = await composer.inputValue().catch(() => 'error');
          return val === '';
        },
        { timeout: 15000 },
      )
      .toBe(true);
  });
});

test.describe('CONCIERGE-DEVICE-SMOKE — pending tool cards (contract)', () => {
  test('SMOKE-07: pending-action coverage includes task, poll, and calendar tools', async () => {
    const executorSource = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/functions/_shared/functionExecutor.ts'),
      'utf8',
    );
    const pendingSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/hooks/usePendingActions.ts'),
      'utf8',
    );

    const written = new Set<string>();
    for (const match of executorSource.matchAll(/tool_name:\s*'([^']+)'/g)) {
      if (match[1]) written.add(match[1]);
    }
    const confirmCases = new Set<string>();
    for (const match of pendingSource.matchAll(/case\s+'([^']+)'/g)) {
      if (match[1]) confirmCases.add(match[1]);
    }

    expect(written.has('createTask')).toBe(true);
    expect(written.has('createPoll')).toBe(true);
    expect(written.has('addToCalendar')).toBe(true);
    expect(confirmCases.has('createTask')).toBe(true);
    expect(confirmCases.has('createPoll')).toBe(true);
    expect(confirmCases.has('addToCalendar')).toBe(true);
  });
});

test.describe('CONCIERGE-DEVICE-SMOKE — production bundle markers', () => {
  test('SMOKE-08: production Concierge controls render on mobile web', async ({ page, request }) => {
    const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'https://chravel.app';

    const htmlResponse = await request.get(baseUrl);
    expect(htmlResponse.ok()).toBeTruthy();
    const html = await htmlResponse.text();
    expect(html).toMatch(/build-version/);

    await page.addInitScript(() => {
      window.localStorage.setItem('TRIPS_DEMO_VIEW', 'app-preview');
    });
    await page.goto(`${baseUrl.replace(/\/$/, '')}/trip/1`);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => null);

    const conciergeTab = page.locator('button:has-text("Concierge")').first();
    await conciergeTab.waitFor({ state: 'visible', timeout: 25000 });
    await conciergeTab.click();

    await expect(page.getByTestId('header-search-btn')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('header-upload-btn')).toBeVisible();
    await expect(composer(page).getByTestId('concierge-waveform-dictation-btn')).toBeVisible();
    await expect(composer(page).getByTestId('concierge-send-btn')).toBeVisible();
  });
});
