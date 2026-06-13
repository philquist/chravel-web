/**
 * Capture real ChravelApp UI frames for the homepage demo video.
 *
 * Drives the built app in demo mode with Playwright and saves deterministic
 * DOM screenshots (desktop 1600x900@2x and iPhone 390x844@3x) into
 * remotion/public/captures/{desktop,mobile}/ for use by the
 * HomepageProductDemo60 Remotion composition.
 *
 * Prerequisites:
 *   npm run build && npx vite preview --port 4173   (from repo root)
 *
 * Run (from repo root):
 *   node remotion/scripts/capture-demo-frames.mjs
 *
 * Environment:
 *   CAPTURE_BASE_URL — override base URL (default http://localhost:4173)
 *   CHROMIUM_PATH    — override Chromium binary
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.CAPTURE_BASE_URL || 'http://localhost:4173';
const OUT_DESKTOP = path.resolve(__dirname, '../public/captures/desktop');
const OUT_MOBILE = path.resolve(__dirname, '../public/captures/mobile');
const COVER_PHOTO = path.resolve(__dirname, '../../public/demo-covers/cancun-spring-break.webp');

const DESKTOP_VIEWPORT = { width: 1600, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

const PRO_TRIP_PATH = '/tour/pro/beyonce-cowboy-carter-tour';
const BROADCAST_MESSAGE = 'Dinner moved to 8:30 PM at Komodo. Meet in lobby at 8:00.';

fs.mkdirSync(OUT_DESKTOP, { recursive: true });
fs.mkdirSync(OUT_MOBILE, { recursive: true });

const results = [];

/** Hide demo-mode chrome (Exit Demo pill/bar) so frames look like the real product. */
async function hideDemoChrome(page) {
  try {
    await page.addStyleTag({
      content: `
        [aria-label="Exit demo mode"] { display: none !important; }
        div[class*="bg-orange-500"] { display: none !important; }
      `,
    });
  } catch {
    // Transient CSP/navigation noise can reject the injection; the style is
    // re-applied on every settle() so a single miss is harmless.
  }
}

/** Wait until skeleton/spinner indicators clear (best effort). */
async function waitForNoSkeletons(page, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const busy = await page.evaluate(() => {
      return (
        document.querySelectorAll('.animate-pulse, .animate-spin, [class*="spinner"]').length > 0
      );
    });
    if (!busy) return;
    await page.waitForTimeout(300);
  }
}

/** Wait for all visible images to finish decoding (best effort). */
async function waitForImages(page, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const pending = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.filter(img => {
        const rect = img.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0;
        return visible && (!img.complete || img.naturalWidth === 0);
      }).length;
    });
    if (pending === 0) return;
    await page.waitForTimeout(250);
  }
}

async function settle(page, extraMs = 900) {
  await waitForNoSkeletons(page);
  await waitForImages(page);
  await hideDemoChrome(page);
  await page.waitForTimeout(extraMs);
}

async function enableDemoMode(page) {
  await page.goto(`${BASE_URL}/demo`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.waitForURL(url => url.pathname === '/' || url.search.includes('from=demo'), {
      timeout: 15000,
    });
  } catch {
    // may already be home
  }
  await settle(page, 1500);
  const body = await page.locator('body').textContent();
  if (body?.includes('Please Log In')) {
    throw new Error('Demo mode did not activate');
  }
}

/**
 * Click a trip tab. Tries [data-tab] first (dispatchEvent because the Radix
 * tooltip asChild wrapper intercepts native clicks), then falls back to a
 * visible button whose accessible text matches the tab label.
 */
async function clickTab(page, tabId) {
  const clicked = await page.evaluate(id => {
    const btn = document.querySelector(`[data-tab="${id}"]`);
    if (btn) {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    }
    const label = id.charAt(0).toUpperCase() + id.slice(1);
    const fallback = Array.from(document.querySelectorAll('button')).find(el =>
      (el.textContent || '').trim().startsWith(label),
    );
    if (fallback) {
      fallback.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    }
    return false;
  }, tabId);
  if (!clicked) throw new Error(`tab button not found: ${tabId}`);
  await page.waitForTimeout(600);
  await settle(page);
}

/**
 * Compute a clip box starting at the trip tab bar so desktop captures show
 * tab bar + tab content instead of the half-scrolled trip header band.
 * (The trip page scrolls an inner container, so window scrolling is a no-op.)
 */
async function tabBarClip(page) {
  const top = await page.evaluate(() => {
    const tab = document.querySelector('[data-tab]');
    if (!tab) return 0;
    const rect = tab.getBoundingClientRect();
    return Math.max(0, Math.round(rect.top) - 10);
  });
  const vp = page.viewportSize();
  if (!vp || top <= 0 || top > vp.height - 200) return undefined;
  return { x: 0, y: top, width: vp.width, height: vp.height - top };
}

/** Scroll the tallest inner scroll container (the chat/message list) to its end. */
async function scrollChatToBottom(page) {
  await page.evaluate(() => {
    const scrollers = Array.from(document.querySelectorAll('*')).filter(el => {
      const style = getComputedStyle(el);
      return (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight + 50
      );
    });
    scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight);
    if (scrollers[0]) scrollers[0].scrollTop = scrollers[0].scrollHeight;
  });
  await page.waitForTimeout(600);
}

async function shoot(page, dir, name, clip) {
  const out = path.join(dir, `${name}.png`);
  await page.screenshot({ path: out, fullPage: false, clip });
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`  ✓ ${name}.png [${kb}KB]${clip ? ` (clipped y=${clip.y})` : ''}`);
  results.push({ name, file: out });
}

async function captureTabShot(page, dir, name, tripPath, tabId, { clipToTabs = true } = {}) {
  await page.goto(`${BASE_URL}${tripPath}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await settle(page, 1200);
  const body = await page.locator('body').textContent();
  if (body?.includes('Trip Not Found')) throw new Error(`Trip Not Found at ${tripPath}`);
  if (tabId) await clickTab(page, tabId);
  const clip = clipToTabs ? await tabBarClip(page) : undefined;
  await shoot(page, dir, name, clip);
}

/** Fill the real Create Trip modal with the storyboard trip and capture stages. */
async function captureCreateTripFlow(page, dir) {
  // Caller must already be on the demo dashboard (bare `/` shows the
  // marketing landing page, not the app shell, so do not re-navigate).
  await page.locator('[aria-label="Create New Trip"]').first().click();
  await page.waitForSelector('input[placeholder="e.g., Summer in Paris"]', { timeout: 10000 });
  await page.waitForTimeout(500);
  await shoot(page, dir, 'create-trip-1-empty');

  await page.locator('input[placeholder="e.g., Summer in Paris"]').fill("Paul's Birthday Weekend");
  await page.locator('input[placeholder="e.g., Paris, France"]').fill('Miami, FL');
  await page.waitForTimeout(400);
  await shoot(page, dir, 'create-trip-2-name');

  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill('2026-07-17');
  await dateInputs.nth(1).fill('2026-07-19');

  // Attach a cover photo through the real file input
  const fileInput = page.locator('input[type="file"]').first();
  if ((await fileInput.count()) > 0 && fs.existsSync(COVER_PHOTO)) {
    try {
      await fileInput.setInputFiles(COVER_PHOTO);
      await page.waitForTimeout(1500); // preview render
    } catch (e) {
      console.warn(`  ⚠ cover photo attach failed: ${e.message}`);
    }
  }
  await settle(page, 600);
  await shoot(page, dir, 'create-trip-3-filled');

  // Close modal so subsequent shots start clean
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

/** Send a message through the real chat input (demo chat accepts local sends). */
async function sendChatMessage(page, text) {
  const input = page.locator('[placeholder*="mention someone"]').first();
  if ((await input.count()) === 0) {
    console.warn('  ⚠ chat input not found — skipping send');
    return false;
  }
  await input.click();
  await input.fill(text);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  return true;
}

/**
 * Chat scene: open trip 1 chat, send the storyboard dinner exchange through
 * the real input so the conversation frame shows it as delivered bubbles.
 */
async function captureChatScene(page, dir) {
  await page.goto(`${BASE_URL}/trip/1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await settle(page, 1200);
  await clickTab(page, 'chat');
  await sendChatMessage(page, "Where's dinner tonight? 🌮");
  // Double-scroll: late bubble/image renders grow the list after the first pass
  await scrollChatToBottom(page);
  await page.waitForTimeout(500);
  await scrollChatToBottom(page);
  await shoot(page, dir, 'chat', await tabBarClip(page));
}

/**
 * Broadcast scene: consumer chat's Broadcasts filter shows priority
 * announcements. Send the storyboard broadcast first so it appears in frame.
 */
async function captureBroadcastScene(page, dir, tripPath, name) {
  await page.goto(`${BASE_URL}${tripPath}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await settle(page, 1200);
  await clickTab(page, 'chat');

  // Switch the chat view to the Broadcasts filter chip
  const filtered = await page.evaluate(() => {
    const chip = Array.from(document.querySelectorAll('button')).find(
      el => (el.textContent || '').trim() === 'Broadcasts',
    );
    if (!chip) return false;
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  });
  if (!filtered) console.warn('  ⚠ Broadcasts filter chip not found');
  await page.waitForTimeout(800);
  await scrollChatToBottom(page);

  // Stage the storyboard broadcast in the composer (visible as typed text)
  const input = page.locator('[placeholder*="mention someone"]').first();
  if ((await input.count()) > 0) {
    await input.click();
    await input.fill(BROADCAST_MESSAGE);
    await page.waitForTimeout(400);
  }
  await shoot(page, dir, name, await tabBarClip(page));
}

/** Payments scene: fill the real payment form with the storyboard hotel split. */
async function capturePaymentsScene(page, dir) {
  await page.goto(`${BASE_URL}/trip/1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await settle(page, 1200);
  await clickTab(page, 'payments');

  const amount = page.locator('input[placeholder="0.00"]').first();
  if ((await amount.count()) > 0) {
    await amount.fill('1240');
  }
  const memo = page.locator('input[placeholder*="Dinner, taxi"]').first();
  if ((await memo.count()) > 0) {
    await memo.click();
    await memo.pressSequentially('Hotel split — 2 nights', { delay: 15 });
  }
  // Select everyone so the split preview shows real per-person amounts
  await page.evaluate(() => {
    const selectAll = Array.from(document.querySelectorAll('button')).find(
      el => (el.textContent || '').trim() === 'Select All',
    );
    if (selectAll) {
      selectAll.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  });
  await page.waitForTimeout(600);
  await shoot(page, dir, 'payments', await tabBarClip(page));
}

/** Mobile Create Trip: open the full-screen modal on the dashboard and fill it. */
async function captureMobileCreateTrip(page, dir) {
  // Caller must already be on the demo dashboard. The action-bar button can be
  // CSS-hidden on phone layouts, so dispatch the click instead of tapping.
  const opened = await page.evaluate(() => {
    const btn = document.querySelector('[aria-label="Create New Trip"]');
    if (!btn) return false;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  });
  if (!opened) {
    console.warn('  ⚠ mobile Create New Trip button not found — skipping m-create-trip');
    return;
  }
  await page.waitForSelector('input[placeholder="e.g., Summer in Paris"]', { timeout: 10000 });
  await page.locator('input[placeholder="e.g., Summer in Paris"]').fill("Paul's Birthday Weekend");
  await page.locator('input[placeholder="e.g., Paris, France"]').fill('Miami, FL');
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill('2026-07-17');
  await dateInputs.nth(1).fill('2026-07-19');
  await settle(page, 600);
  await shoot(page, dir, 'm-create-trip');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

/** Mobile Broadcasts: chat Broadcasts filter with the storyboard message staged. */
async function captureMobileBroadcasts(page, dir, tripPath, name) {
  await page.goto(`${BASE_URL}${tripPath}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await settle(page, 1200);
  await clickTab(page, 'chat');
  const filtered = await page.evaluate(() => {
    const chip = Array.from(document.querySelectorAll('button')).find(
      el => (el.textContent || '').trim() === 'Broadcasts',
    );
    if (!chip) return false;
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  });
  if (!filtered) console.warn('  ⚠ mobile Broadcasts filter chip not found');
  await page.waitForTimeout(800);
  // The filtered list virtualizes rows; force a re-measure so bubbles don't
  // render with stale offsets (overlapping), then settle at the latest items.
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(700);
  await scrollChatToBottom(page);
  await page.waitForTimeout(900);
  await scrollChatToBottom(page);
  await page.waitForTimeout(600);
  await shoot(page, dir, name);
}

/**
 * Mobile calendar: demo events render for the device's "today" on trip 1
 * desktop but the mobile day list can come up empty — try trip 1, tap the
 * selected day to force a refresh, then fall back to trip 8.
 */
async function captureMobileCalendar(page, dir) {
  for (const tripPath of ['/trip/1', '/trip/8', '/trip/2']) {
    await page.goto(`${BASE_URL}${tripPath}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await settle(page, 1200);
    await clickTab(page, 'calendar');
    await page.waitForTimeout(800);
    const hasEvents = await page.evaluate(() => {
      return !document.body.textContent?.includes('No events for this day');
    });
    if (hasEvents) {
      await shoot(page, dir, 'm-calendar');
      return;
    }
    console.warn(`  ⚠ mobile calendar empty on ${tripPath}, trying next trip`);
  }
  // Last resort: capture trip 1 anyway (month grid still reads well)
  await page.goto(`${BASE_URL}/trip/1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await settle(page, 1200);
  await clickTab(page, 'calendar');
  await shoot(page, dir, 'm-calendar');
}

async function main() {
  console.log(`\n🎬 Chravel demo-frame capture — ${BASE_URL}\n`);
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
    ],
  });

  try {
    // ── Desktop 1600x900 @2x ────────────────────────────────────────────
    console.log('─── Desktop 1600×900 @2x ───');
    const dctx = await browser.newContext({
      viewport: DESKTOP_VIEWPORT,
      deviceScaleFactor: 2,
    });
    const dpage = await dctx.newPage();
    await enableDemoMode(dpage);

    await shoot(dpage, OUT_DESKTOP, 'dashboard');
    await captureCreateTripFlow(dpage, OUT_DESKTOP);
    await captureChatScene(dpage, OUT_DESKTOP);
    await captureBroadcastScene(dpage, OUT_DESKTOP, '/trip/1', 'broadcasts');
    await captureTabShot(dpage, OUT_DESKTOP, 'concierge', '/trip/8', 'concierge');
    await captureTabShot(dpage, OUT_DESKTOP, 'calendar', '/trip/1', 'calendar');
    await captureTabShot(dpage, OUT_DESKTOP, 'places', '/trip/8', 'places');
    await captureTabShot(dpage, OUT_DESKTOP, 'tasks', '/trip/1', 'tasks');
    await captureTabShot(dpage, OUT_DESKTOP, 'polls', '/trip/1', 'polls');
    await captureTabShot(dpage, OUT_DESKTOP, 'media', '/trip/2', 'media');
    await capturePaymentsScene(dpage, OUT_DESKTOP);
    await captureBroadcastScene(dpage, OUT_DESKTOP, PRO_TRIP_PATH, 'pro-broadcasts');
    await captureTabShot(dpage, OUT_DESKTOP, 'pro-team', PRO_TRIP_PATH, 'team');
    await dpage.close();
    await dctx.close();

    // ── Mobile iPhone 390x844 @3x ───────────────────────────────────────
    console.log('\n─── iPhone 390×844 @3x ───');
    const mctx = await browser.newContext({
      viewport: MOBILE_VIEWPORT,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const mpage = await mctx.newPage();
    await enableDemoMode(mpage);

    const mobileOpts = { clipToTabs: false };
    await shoot(mpage, OUT_MOBILE, 'm-dashboard');
    await captureMobileCreateTrip(mpage, OUT_MOBILE);
    await captureTabShot(mpage, OUT_MOBILE, 'm-chat', '/trip/1', 'chat', mobileOpts);
    await captureMobileBroadcasts(mpage, OUT_MOBILE, '/trip/1', 'm-broadcasts');
    await captureMobileCalendar(mpage, OUT_MOBILE);
    await captureTabShot(mpage, OUT_MOBILE, 'm-places', '/trip/8', 'places', mobileOpts);
    await captureTabShot(mpage, OUT_MOBILE, 'm-tasks', '/trip/1', 'tasks', mobileOpts);
    await captureTabShot(mpage, OUT_MOBILE, 'm-polls', '/trip/1', 'polls', mobileOpts);
    await captureTabShot(mpage, OUT_MOBILE, 'm-media', '/trip/2', 'media', mobileOpts);
    await captureTabShot(mpage, OUT_MOBILE, 'm-payments', '/trip/1', 'payments', mobileOpts);
    await captureTabShot(mpage, OUT_MOBILE, 'm-concierge', '/trip/8', 'concierge', mobileOpts);
    await captureTabShot(mpage, OUT_MOBILE, 'm-pro-team', PRO_TRIP_PATH, 'team', mobileOpts);
    await mpage.close();
    await mctx.close();
  } finally {
    await browser.close();
  }

  console.log(`\nDone — ${results.length} frames captured.`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
