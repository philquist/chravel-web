#!/usr/bin/env node
/**
 * IAP Product ID Validator
 * -------------------------
 * Compares three sources of truth for Apple IAP product IDs and reports exact
 * mismatches before any App Store Connect resubmission:
 *
 *   1. CANONICAL  — the 7 IDs Apple expects on the current submission
 *                   (locked in .lovable/plan.md after the Nov 2026 rejection).
 *   2. CONFIGURED — everything the app actually references at runtime,
 *                   parsed from src/constants/revenuecat.ts + src/billing/config.ts.
 *   3. ASC        — what actually exists in App Store Connect. Either loaded
 *                   from appstore/asc-products.json (paste-in mode) or fetched
 *                   live via the App Store Connect API (--source=api).
 *
 * Exits non-zero on any mismatch so it can gate CI or a pre-resubmit check.
 *
 * Usage:
 *   node scripts/validate-iap-product-ids.mjs                # file mode (default)
 *   node scripts/validate-iap-product-ids.mjs --source=api   # live ASC lookup
 *   node scripts/validate-iap-product-ids.mjs --json         # machine output
 *
 * API mode env vars (no extra deps — uses node:crypto for ES256 JWT):
 *   ASC_KEY_ID         Key ID from App Store Connect → Users and Access → Keys
 *   ASC_ISSUER_ID      Issuer ID from the same page
 *   ASC_KEY_P8         Contents of the .p8 file (multiline, quoted) OR path to it
 *   ASC_APP_ID         Numeric App Store Connect app id (not bundle id)
 */

import { readFileSync, existsSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');

// ---- Canonical IDs Apple expects on the current 2.0(60) submission ----------
// If you change this list, also update .lovable/plan.md and the ASC listing.
const CANONICAL = [
  'com.chravel.explorer.monthly',
  'com.chravel.frequentchraveler.monthly',
  'com.chravel.explorer.annual',
  'com.chravel.frequentchraveler.annual',
  'com.chravel.pro.starter.monthly',
  'com.chravel.pro.growth.monthly',
  'com.chravel.trippass.explorer',
  'com.chravel.trippass.frequent',
];

// ---- CLI parsing ------------------------------------------------------------
const args = new Map(
  process.argv.slice(2).map(a => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const jsonOut = args.get('json') === 'true';
const source = args.get('source') ?? 'file';

// ---- Parse CONFIGURED IDs out of the codebase -------------------------------
function extractProductIds(filePath) {
  if (!existsSync(filePath)) return [];
  const src = readFileSync(filePath, 'utf8');
  const found = new Set();
  const re = /['"`](com\.chravel\.[a-z0-9.]+)['"`]/g;
  let m;
  while ((m = re.exec(src)) !== null) found.add(m[1]);
  return [...found];
}

const configured = new Set([
  ...extractProductIds(resolve(REPO, 'src/constants/revenuecat.ts')),
  ...extractProductIds(resolve(REPO, 'src/billing/config.ts')),
]);

// ---- Load ASC IDs -----------------------------------------------------------
async function loadAscFromFile() {
  const p = resolve(REPO, 'appstore/asc-products.json');
  if (!existsSync(p)) {
    console.error(
      `\n[!] ${p} not found.\n` +
        `    Create it with an array of product IDs pasted from App Store Connect, e.g.:\n` +
        `    ["com.chravel.explorer.annual", "com.chravel.frequentchraveler.monthly", ...]\n` +
        `    Or run with --source=api and ASC_* env vars set.\n`,
    );
    process.exit(2);
  }
  const json = JSON.parse(readFileSync(p, 'utf8'));
  const list = Array.isArray(json) ? json : (json.productIds ?? []);
  return new Set(list);
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signAscJwt({ keyId, issuerId, p8 }) {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 60 * 15,
    aud: 'appstoreconnect-v1',
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  const der = signer.sign({ key: p8, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${der.toString('base64url')}`;
}

async function loadAscFromApi() {
  const keyId = process.env.ASC_KEY_ID;
  const issuerId = process.env.ASC_ISSUER_ID;
  const appId = process.env.ASC_APP_ID;
  let p8 = process.env.ASC_KEY_P8;
  if (!keyId || !issuerId || !appId || !p8) {
    console.error('[!] --source=api requires ASC_KEY_ID, ASC_ISSUER_ID, ASC_APP_ID, ASC_KEY_P8.');
    process.exit(2);
  }
  if (!p8.includes('BEGIN PRIVATE KEY') && existsSync(p8)) p8 = readFileSync(p8, 'utf8');

  const token = signAscJwt({ keyId, issuerId, p8 });
  const ids = new Set();

  async function pageAll(url) {
    let next = url;
    while (next) {
      const r = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`ASC ${r.status} on ${next}: ${await r.text()}`);
      const body = await r.json();
      for (const d of body.data ?? []) {
        const pid = d.attributes?.productId;
        if (pid) ids.add(pid);
      }
      next = body.links?.next ?? null;
    }
  }

  // Auto-renewable subscriptions live under subscriptionGroups → subscriptions.
  // One-time (non-consumable) products live under inAppPurchasesV2.
  await pageAll(
    `https://api.appstoreconnect.apple.com/v1/apps/${appId}/inAppPurchasesV2?limit=200`,
  );
  const groupsResp = await fetch(
    `https://api.appstoreconnect.apple.com/v1/apps/${appId}/subscriptionGroups?limit=50`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!groupsResp.ok)
    throw new Error(`ASC groups ${groupsResp.status}: ${await groupsResp.text()}`);
  const groups = await groupsResp.json();
  for (const g of groups.data ?? []) {
    await pageAll(
      `https://api.appstoreconnect.apple.com/v1/subscriptionGroups/${g.id}/subscriptions?limit=200`,
    );
  }
  return ids;
}

const asc = source === 'api' ? await loadAscFromApi() : await loadAscFromFile();

// ---- Diff -------------------------------------------------------------------
const canonicalSet = new Set(CANONICAL);
const diff = (a, b) => [...a].filter(x => !b.has(x)).sort();

const report = {
  source,
  counts: { canonical: canonicalSet.size, configured: configured.size, asc: asc.size },
  configuredMissingFromCanonical: diff(configured, canonicalSet),
  canonicalMissingFromConfigured: diff(canonicalSet, configured),
  configuredMissingFromAsc: diff(configured, asc),
  ascMissingFromConfigured: diff(asc, configured),
  canonicalMissingFromAsc: diff(canonicalSet, asc),
  ascMissingFromCanonical: diff(asc, canonicalSet),
};

const hasBlocker =
  report.canonicalMissingFromAsc.length > 0 || report.canonicalMissingFromConfigured.length > 0;

if (jsonOut) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(hasBlocker ? 1 : 0);
}

const c = (color, s) => `\x1b[${color}m${s}\x1b[0m`;
const red = s => c(31, s);
const green = s => c(32, s);
const yellow = s => c(33, s);
const bold = s => c(1, s);

console.log(bold('\nIAP Product ID Validation'));
console.log(
  `  source=${source}  canonical=${canonicalSet.size}  configured=${configured.size}  asc=${asc.size}\n`,
);

function section(title, list, severity = 'block') {
  if (list.length === 0) {
    console.log(`  ${green('✓')} ${title}: none`);
    return;
  }
  const tag = severity === 'block' ? red('✗ BLOCKER') : yellow('! WARN');
  console.log(`  ${tag} ${title}:`);
  for (const id of list) console.log(`      - ${id}`);
}

section('Canonical IDs missing from App Store Connect', report.canonicalMissingFromAsc, 'block');
section('Canonical IDs missing from codebase', report.canonicalMissingFromConfigured, 'block');
section(
  'Codebase IDs not in canonical set (extra / legacy)',
  report.configuredMissingFromCanonical,
  'warn',
);
section(
  'ASC IDs not in canonical set (extra / legacy in Apple)',
  report.ascMissingFromCanonical,
  'warn',
);
section('Codebase IDs not found in ASC', report.configuredMissingFromAsc, 'warn');
section('ASC IDs not referenced by codebase', report.ascMissingFromConfigured, 'warn');

console.log(
  hasBlocker
    ? red('\nBLOCK: do NOT resubmit — resolve BLOCKER rows above first.\n')
    : green('\nOK: canonical ↔ ASC ↔ codebase are aligned. Safe to proceed.\n'),
);

process.exit(hasBlocker ? 1 : 0);
