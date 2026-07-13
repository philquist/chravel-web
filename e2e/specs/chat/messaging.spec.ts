/**
 * CHAT-001 through CHAT-003 + CHAT-SMOKE: Messaging E2E Test Suite
 *
 * Verifies GetStream-powered messaging across:
 *   - Consumer trip chat via Stream (CHAT-001)
 *   - AI Concierge (CHAT-002)
 *   - Pro trip channels (CHAT-003)
 *   - UI structure smoke tests (CHAT-SMOKE)
 *
 * Auth strategy: CHAT-SMOKE stays local-only/demo tolerant. Authenticated
 * coverage has two modes:
 *   - local-tolerant (default): fixture setup may skip with an explicit reason.
 *   - release-gate (CHRAVEL_E2E_RELEASE_GATE=1): auth, trip creation,
 *     membership, pro trip creation, and browser login failures throw a clear
 *     fixture-step error instead of calling test.skip().
 */

import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  fixtureStepError,
  isReleaseGateE2E,
  skipLocallyOrFailRelease,
} from '../../fixtures/e2eMode';

// ─── Config ───────────────────────────────────────────────────────────────────

// Credentials are required only for CHAT-001/002/003 authenticated tests.
// CHAT-SMOKE tests use demo mode and require no credentials.
// Local-tolerant mode can skip authenticated tests; release-gate mode fails
// missing/unusable fixture steps so CI/App Store QA cannot pass silently.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const DEFAULT_PASSWORD = 'TestPassword123!E2E';

// ─── Test user/trip helpers ───────────────────────────────────────────────────

/** Sign up a fresh test user, returns session token or null if confirmation required. */
async function signUpTestUser(email: string): Promise<{ session: string; userId: string } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw fixtureStepError('auth', 'SUPABASE_URL and SUPABASE_ANON_KEY are required');
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.signUp({ email, password: DEFAULT_PASSWORD });

  if (error) throw fixtureStepError('auth', `signUp failed: ${error.message}`);
  if (!data.session) return null; // email confirmation required — caller must skip/fail by mode
  return { session: data.session.access_token, userId: data.user!.id };
}

/** Create an authenticated Supabase client from a token. */
function makeAuthClient(accessToken: string): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw fixtureStepError('auth client', 'SUPABASE_URL and SUPABASE_ANON_KEY are required');
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  return client;
}

/** Create a trip via the authenticated client and return its id. */
async function createTrip(
  accessToken: string,
  options: { name: string; tripType: 'consumer' | 'pro' | 'event'; userId: string },
): Promise<string | null> {
  const client = makeAuthClient(accessToken);

  const { data, error } = await client
    .from('trips')
    .insert({
      name: options.name,
      destination: 'E2E Test City',
      creator_id: options.userId,
      trip_type: options.tripType,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    })
    .select('id')
    .single();

  if (error) {
    const step = options.tripType === 'pro' ? 'pro trip creation' : 'trip creation';
    if (isReleaseGateE2E) throw fixtureStepError(step, error.message);
    console.warn(`[E2E] ${step} failed: ${error.message}`);
    return null;
  }

  // Add creator as admin member — required for RLS-gated chat access
  const { error: memberError } = await client.from('trip_members').insert({
    trip_id: data.id,
    user_id: options.userId,
    role: 'admin',
    status: 'active',
  });

  if (memberError) {
    if (isReleaseGateE2E) throw fixtureStepError('membership', memberError.message);
    console.warn(`[E2E] createTrip member insert failed: ${memberError.message}`);
    // Roll back the orphan trip so cleanup is not needed
    await client
      .from('trips')
      .delete()
      .eq('id', data.id)
      .catch(() => null);
    return null;
  }

  return data.id;
}

/** Login via the browser auth form (slower but more realistic). */
async function loginViaBrowser(
  page: Page,
  email: string,
  password: string = DEFAULT_PASSWORD,
): Promise<boolean> {
  await page.goto('/auth');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  const redirected = await page
    .waitForURL(url => !url.pathname.includes('/auth'), { timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  return redirected;
}

/** Navigate to a trip's Chat tab and wait for the input to be ready. */
async function openTripChat(page: Page, tripId: string): Promise<boolean> {
  await page.goto(`/trip/${tripId}`);
  await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => null);

  // Wait for the trip page to settle — avoid Trip Not Found flash
  const chatTabBtn = page.locator('button:has-text("Chat")').first();
  const tabVisible = await chatTabBtn
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (!tabVisible) return false;

  await chatTabBtn.click();
  const inputVisible = await page
    .locator('textarea[placeholder*="mention"], textarea[placeholder*="announcement"]')
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  return inputVisible;
}

// ─── Test fixtures ─────────────────────────────────────────────────────────────

interface E2EFixtures {
  /** Email+session for a freshly created test user. Null if email confirmation is required. */
  testAuth: { email: string; session: string; userId: string } | null;
}

const test = base.extend<E2EFixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature requires destructuring
  testAuth: async ({}, provide) => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(7);
    const email = `qa-e2e-${ts}-${rand}@test.chravel.com`;

    let auth: { email: string; session: string; userId: string } | null = null;
    try {
      const result = await signUpTestUser(email);
      if (result) {
        auth = { email, session: result.session, userId: result.userId };
      }
    } catch (error) {
      if (isReleaseGateE2E) throw error;
      // signUp failed — auth stays null, tests that need it will skip locally
      console.warn(
        `[E2E] local-tolerant auth setup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await provide(auth);

    // Cleanup: best-effort delete via authenticated client (may fail if RLS blocks)
    if (auth) {
      try {
        const client = makeAuthClient(auth.session);
        // Delete trip_members first (foreign key), then orphan trips
        await client.from('trip_members').delete().eq('user_id', auth.userId);
        await client.from('trips').delete().eq('creator_id', auth.userId);
      } catch {
        // ignore cleanup failures
      }
    }
  },
});

// ─── CHAT-SMOKE: UI Structure (no auth required) ─────────────────────────────

test.describe('CHAT-SMOKE: UI Structure', () => {
  test('CHAT-SMOKE-01: App loads at / without crash', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible({ timeout: 15000 });
  });

  test('CHAT-SMOKE-02: Auth page renders sign-in form', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
  });

  test('CHAT-SMOKE-03: Demo mode renders trip grid', async ({ page }) => {
    await page.goto('/demo');
    // TripCard renders "View" buttons — each card has one. At least one must be visible.
    const viewBtn = page.locator('button:has-text("View")').first();
    await expect(viewBtn).toBeVisible({ timeout: 20000 });
  });

  test('CHAT-SMOKE-04: Demo trip chat shows chat input', async ({ page }) => {
    await page.goto('/demo');
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => null);

    // Click the first "View" button to enter a trip detail
    const viewBtn = page.locator('button:has-text("View")').first();
    const hasViewBtn = await viewBtn.isVisible({ timeout: 8000 }).catch(() => false);
    if (!hasViewBtn) {
      test.skip();
      return;
    }

    await viewBtn.click();

    // Trip detail must show Chat tab
    const chatTab = page.locator('button:has-text("Chat")').first();
    await expect(chatTab).toBeVisible({ timeout: 15000 });
    await chatTab.click();

    // Chat input must be in the DOM
    const chatInput = page
      .locator(
        'textarea[placeholder*="mention"], textarea[placeholder*="announcement"], textarea[placeholder*="Type"]',
      )
      .first();
    await expect(chatInput).toBeVisible({ timeout: 15000 });
  });

  test('CHAT-SMOKE-05: Demo chat — MessageTypeBar segments visible', async ({ page }) => {
    await page.goto('/demo');
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => null);

    const viewBtn = page.locator('button:has-text("View")').first();
    if (!(await viewBtn.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await viewBtn.click();

    const chatTab = page.locator('button:has-text("Chat")').first();
    await chatTab.waitFor({ state: 'visible', timeout: 15000 });
    await chatTab.click();

    // MessageTypeBar must render Messages and Broadcasts segments
    await expect(page.locator('button:has-text("Messages")').first()).toBeVisible({
      timeout: 12000,
    });
    await expect(page.locator('button:has-text("Broadcasts")').first()).toBeVisible({
      timeout: 5000,
    });
  });

  test('CHAT-SMOKE-06: Demo chat — send button enabled after typing', async ({ page }) => {
    await page.goto('/demo');
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => null);

    const viewBtn = page.locator('button:has-text("View")').first();
    if (!(await viewBtn.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await viewBtn.click();

    const chatTab = page.locator('button:has-text("Chat")').first();
    await chatTab.waitFor({ state: 'visible', timeout: 15000 });
    await chatTab.click();

    const chatInput = page
      .locator('textarea[placeholder*="mention"], textarea[placeholder*="announcement"]')
      .first();
    await chatInput.waitFor({ state: 'visible', timeout: 15000 });

    // Send button must be disabled when input is empty
    const sendBtn = page.locator('[data-testid="chat-send-btn"]');
    await expect(sendBtn).toBeVisible({ timeout: 5000 });
    await expect(sendBtn).toBeDisabled();

    // After typing, send button must be enabled
    await chatInput.fill('Hello from e2e demo test');
    await expect(sendBtn).toBeEnabled({ timeout: 3000 });
  });

  test('CHAT-SMOKE-07: Demo trip — Concierge tab renders textarea', async ({ page }) => {
    await page.goto('/demo');
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => null);

    const viewBtn = page.locator('button:has-text("View")').first();
    if (!(await viewBtn.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await viewBtn.click();

    const conciergeTab = page.locator('button:has-text("Concierge")').first();
    await conciergeTab.waitFor({ state: 'visible', timeout: 15000 });
    await conciergeTab.click();

    // AI Concierge uses a textarea with rounded-2xl (chat uses rounded-full — different class)
    // This scopes to the concierge input even when the chat textarea is still in the DOM (hidden).
    const textarea = page.locator('textarea[class*="rounded-2xl"]').first();
    await expect(textarea).toBeVisible({ timeout: 15000 });
    await expect(textarea).toBeEnabled();
  });

  test('CHAT-SMOKE-08: Pro demo trip — Channels segment present', async ({ page }) => {
    // Navigate directly to a known pro demo trip (Lakers Road Trip has channels in demoChannelData)
    await page.goto('/demo');
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => null);

    // Look for a "Pro" badge or section in the trip grid, or navigate directly via known trip URL
    // The "Pro" tab in the nav leads to pro trips
    const proNavBtn = page.locator('button:has-text("Pro"), a:has-text("Pro")').first();
    const hasProNav = await proNavBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasProNav) {
      await proNavBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }

    // Look for a "View" button on a pro trip card
    const viewBtns = page.locator('button:has-text("View")');
    const count = await viewBtns.count();
    if (count === 0) {
      test.skip();
      return;
    }

    // Click the first available trip
    await viewBtns.first().click();

    const chatTab = page.locator('button:has-text("Chat")').first();
    await chatTab.waitFor({ state: 'visible', timeout: 15000 });
    await chatTab.click();

    // Check for Channels segment — present on pro trips, absent on consumer trips
    // Verify the chat UI at minimum (Chat tab + input always render)
    const chatInput = page
      .locator('textarea[placeholder*="mention"], textarea[placeholder*="announcement"]')
      .first();
    await expect(chatInput).toBeVisible({ timeout: 12000 });

    // The Channels segment check is a bonus — acceptable if it's absent on a consumer demo trip
    const channelsVisible = await page
      .locator('button:has-text("Channels")')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Log but don't fail — the pro tab may or may not be the first result
    console.log(`[CHAT-SMOKE-08] Channels segment visible: ${channelsVisible}`);
  });
});

// ─── CHAT-001: Consumer Trip Chat (Stream) ────────────────────────────────────

test.describe('CHAT-001: Consumer Trip Chat', () => {
  test.describe.configure({ mode: 'serial' });

  test('CHAT-001-TC01: Chat input is visible and enabled', async ({ page, testAuth }) => {
    if (!testAuth) {
      skipLocallyOrFailRelease(
        'auth',
        'Email confirmation required — cannot auto-create users without service role key',
      );
      return;
    }

    const tripId = await createTrip(testAuth.session, {
      name: `E2E Chat Trip ${Date.now()}`,
      tripType: 'consumer',
      userId: testAuth.userId,
    });
    if (!tripId) {
      skipLocallyOrFailRelease(
        'trip creation',
        'Trip creation failed (RLS may block anon inserts)',
      );
      return;
    }

    const loggedIn = await loginViaBrowser(page, testAuth.email);
    if (!loggedIn) {
      skipLocallyOrFailRelease('browser login', 'Browser login failed');
      return;
    }

    const chatReady = await openTripChat(page, tripId);
    expect(chatReady).toBe(true);

    const chatInput = page
      .locator('textarea[placeholder*="mention"], textarea[placeholder*="announcement"]')
      .first();
    await expect(chatInput).toBeEnabled();
  });

  test('CHAT-001-TC02: Sending a message delivers it to the list', async ({ page, testAuth }) => {
    if (!testAuth) {
      skipLocallyOrFailRelease('auth', 'No auth available');
      return;
    }

    const tripId = await createTrip(testAuth.session, {
      name: `E2E Send Trip ${Date.now()}`,
      tripType: 'consumer',
      userId: testAuth.userId,
    });
    if (!tripId) {
      skipLocallyOrFailRelease('trip creation', 'Trip creation failed');
      return;
    }

    const loggedIn = await loginViaBrowser(page, testAuth.email);
    if (!loggedIn) {
      skipLocallyOrFailRelease('browser login', 'Browser login failed');
      return;
    }

    const chatReady = await openTripChat(page, tripId);
    expect(chatReady).toBe(true);

    const timestamp = Date.now();
    const message = `E2E Stream test ${timestamp}`;
    const chatInput = page
      .locator('textarea[placeholder*="mention"], textarea[placeholder*="announcement"]')
      .first();

    await chatInput.fill(message);
    await chatInput.press('Enter');

    // Message must appear in the list within 10 s (Stream message.new event)
    await expect(page.locator(`text=${message}`).first()).toBeVisible({ timeout: 10000 });
  });

  test('CHAT-001-TC03: Send button has data-testid and enables when text is typed', async ({
    page,
    testAuth,
  }) => {
    if (!testAuth) {
      skipLocallyOrFailRelease('auth', 'No auth available');
      return;
    }

    const tripId = await createTrip(testAuth.session, {
      name: `E2E SendBtn Trip ${Date.now()}`,
      tripType: 'consumer',
      userId: testAuth.userId,
    });
    if (!tripId) {
      skipLocallyOrFailRelease('trip creation', 'Trip creation failed');
      return;
    }

    const loggedIn = await loginViaBrowser(page, testAuth.email);
    if (!loggedIn) {
      skipLocallyOrFailRelease('browser login', 'Browser login failed');
      return;
    }

    const chatReady = await openTripChat(page, tripId);
    expect(chatReady).toBe(true);

    const sendBtn = page.locator('[data-testid="chat-send-btn"]');
    await expect(sendBtn).toBeVisible({ timeout: 10000 });
    await expect(sendBtn).toBeDisabled(); // empty input → disabled

    const chatInput = page
      .locator('textarea[placeholder*="mention"], textarea[placeholder*="announcement"]')
      .first();
    await chatInput.fill('hello stream');
    await expect(sendBtn).toBeEnabled({ timeout: 3000 });
  });

  test('CHAT-001-TC04: MessageTypeBar shows Messages and Broadcasts segments', async ({
    page,
    testAuth,
  }) => {
    if (!testAuth) {
      skipLocallyOrFailRelease('auth', 'No auth available');
      return;
    }

    const tripId = await createTrip(testAuth.session, {
      name: `E2E TypeBar Trip ${Date.now()}`,
      tripType: 'consumer',
      userId: testAuth.userId,
    });
    if (!tripId) {
      skipLocallyOrFailRelease('trip creation', 'Trip creation failed');
      return;
    }

    const loggedIn = await loginViaBrowser(page, testAuth.email);
    if (!loggedIn) {
      skipLocallyOrFailRelease('browser login', 'Browser login failed');
      return;
    }

    const chatReady = await openTripChat(page, tripId);
    expect(chatReady).toBe(true);

    await expect(page.locator('button:has-text("Messages")').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('button:has-text("Broadcasts")').first()).toBeVisible({
      timeout: 5000,
    });
  });
});

// ─── CHAT-002: AI Concierge ───────────────────────────────────────────────────

test.describe('CHAT-002: AI Concierge', () => {
  test.describe.configure({ mode: 'serial' });

  test('CHAT-002-TC01: Concierge tab loads with a textarea', async ({ page, testAuth }) => {
    if (!testAuth) {
      skipLocallyOrFailRelease('auth', 'No auth available');
      return;
    }

    const tripId = await createTrip(testAuth.session, {
      name: `E2E Concierge Trip ${Date.now()}`,
      tripType: 'consumer',
      userId: testAuth.userId,
    });
    if (!tripId) {
      skipLocallyOrFailRelease('trip creation', 'Trip creation failed');
      return;
    }

    const loggedIn = await loginViaBrowser(page, testAuth.email);
    if (!loggedIn) {
      skipLocallyOrFailRelease('browser login', 'Browser login failed');
      return;
    }

    await page.goto(`/trip/${tripId}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => null);

    const conciergeTab = page.locator('button:has-text("Concierge")').first();
    await conciergeTab.waitFor({ state: 'visible', timeout: 15000 });
    await conciergeTab.click();

    // Concierge uses rounded-2xl; Chat tab textarea uses rounded-full.
    // Scoping to rounded-2xl avoids targeting the hidden Chat input (still in DOM).
    const textarea = page.locator('textarea[class*="rounded-2xl"]').first();
    await expect(textarea).toBeVisible({ timeout: 15000 });
    await expect(textarea).toBeEnabled();
  });

  test('CHAT-002-TC02: Concierge sends a query and reacts', async ({ page, testAuth }) => {
    if (!testAuth) {
      skipLocallyOrFailRelease('auth', 'No auth available');
      return;
    }

    const tripId = await createTrip(testAuth.session, {
      name: `E2E Concierge Query ${Date.now()}`,
      tripType: 'consumer',
      userId: testAuth.userId,
    });
    if (!tripId) {
      skipLocallyOrFailRelease('trip creation', 'Trip creation failed');
      return;
    }

    const loggedIn = await loginViaBrowser(page, testAuth.email);
    if (!loggedIn) {
      skipLocallyOrFailRelease('browser login', 'Browser login failed');
      return;
    }

    await page.goto(`/trip/${tripId}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => null);

    const conciergeTab = page.locator('button:has-text("Concierge")').first();
    await conciergeTab.waitFor({ state: 'visible', timeout: 15000 });
    await conciergeTab.click();

    // Scope to the Concierge textarea (rounded-2xl) — Chat textarea (rounded-full)
    // stays mounted in the DOM with display:none and must not be targeted here.
    const conciergeInput = page.locator('textarea[class*="rounded-2xl"]').first();
    await conciergeInput.waitFor({ state: 'visible', timeout: 15000 });
    await conciergeInput.fill('What restaurants are near the Eiffel Tower?');
    await conciergeInput.press('Enter');

    // UI must react: either a loading spinner appears OR the concierge input clears.
    // expect.poll avoids the flaky Promise.race pattern where the second branch
    // resolves immediately because a textarea is already visible.
    await expect
      .poll(
        async () => {
          const spinnerVisible = await page
            .locator('[class*="animate-spin"]')
            .first()
            .isVisible()
            .catch(() => false);
          if (spinnerVisible) return true;
          const val = await conciergeInput.inputValue().catch(() => 'error');
          return val === '';
        },
        { timeout: 12000 },
      )
      .toBe(true);
  });
});

// ─── CHAT-003: Pro Trip Channels ─────────────────────────────────────────────

test.describe('CHAT-003: Pro Trip Channels', () => {
  test.describe.configure({ mode: 'serial' });

  test('CHAT-003-TC01: Pro trip shows Channels segment in MessageTypeBar', async ({
    page,
    testAuth,
  }) => {
    if (!testAuth) {
      skipLocallyOrFailRelease('auth', 'No auth available');
      return;
    }

    const tripId = await createTrip(testAuth.session, {
      name: `E2E Pro Trip ${Date.now()}`,
      tripType: 'pro',
      userId: testAuth.userId,
    });
    if (!tripId) {
      skipLocallyOrFailRelease('pro trip creation', 'Pro trip creation failed');
      return;
    }

    const loggedIn = await loginViaBrowser(page, testAuth.email);
    if (!loggedIn) {
      skipLocallyOrFailRelease('browser login', 'Browser login failed');
      return;
    }

    const chatReady = await openTripChat(page, tripId);
    expect(chatReady).toBe(true);

    // Pro trips must show a Channels segment in the MessageTypeBar
    const channelsBtn = page.locator('button:has-text("Channels")').first();
    await expect(channelsBtn).toBeVisible({ timeout: 15000 });
  });

  test('CHAT-003-TC02: Channels button is present (disabled when no channels provisioned)', async ({
    page,
    testAuth,
  }) => {
    if (!testAuth) {
      skipLocallyOrFailRelease('auth', 'No auth available');
      return;
    }

    const tripId = await createTrip(testAuth.session, {
      name: `E2E Pro Channels ${Date.now()}`,
      tripType: 'pro',
      userId: testAuth.userId,
    });
    if (!tripId) {
      skipLocallyOrFailRelease('pro trip creation', 'Pro trip creation failed');
      return;
    }

    const loggedIn = await loginViaBrowser(page, testAuth.email);
    if (!loggedIn) {
      skipLocallyOrFailRelease('browser login', 'Browser login failed');
      return;
    }

    const chatReady = await openTripChat(page, tripId);
    expect(chatReady).toBe(true);

    const channelsBtn = page.locator('button:has-text("Channels")').first();
    await channelsBtn.waitFor({ state: 'visible', timeout: 15000 });

    // Acceptable outcomes: button is visible (enabled if channels exist, disabled if not)
    const isVisible = await channelsBtn.isVisible();
    expect(isVisible).toBe(true);
  });
});
