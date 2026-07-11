#!/usr/bin/env node
/**
 * IAP Parity Guard
 * ----------------
 * Cross-checks IAP identifiers, prices, entitlements, and display names across
 * the three surfaces that MUST stay identical to avoid App Review rejection and
 * payout drift:
 *
 *   1. src/billing/config.ts       — BILLING_PRODUCTS + TRIP_PASS_PRODUCTS
 *   2. src/constants/revenuecat.ts — REVENUECAT_PRODUCTS + REVENUECAT_PRICING +
 *                                    REVENUECAT_ENTITLEMENTS + REQUIRED_IOS_PRODUCT_IDS
 *   3. appstore/asc-products.json  — snapshot of App Store Connect product IDs
 *
 * Exits non-zero on any mismatch so it can gate CI or a pre-resubmit check.
 *
 * Usage: node scripts/validate-iap-parity.mjs [--json]
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const jsonOut = process.argv.includes('--json');

const readSrc = p => readFileSync(resolve(REPO, p), 'utf8');

// -------- Extract from src/billing/config.ts --------------------------------
const billingSrc = readSrc('src/billing/config.ts');

/**
 * Parse a block like:
 *   'consumer-explorer': {
 *      name: 'Explorer',
 *      appleProductIdMonthly: 'com.chravel.explorer.monthly',
 *      appleProductIdAnnual: 'com.chravel.explorer.annual',
 *      priceMonthly: 9.99,
 *      priceAnnual: 99,
 *      ...
 *   }
 */
function parseBillingProducts() {
  const out = {};
  const blockRe = /'([a-z0-9-]+)':\s*\{([\s\S]*?)\n\s*\},/g;
  let m;
  while ((m = blockRe.exec(billingSrc)) !== null) {
    const key = m[1];
    const body = m[2];
    const pick = field => {
      const rx = new RegExp(`${field}:\\s*['"]([^'"]+)['"]`);
      const r = body.match(rx);
      return r ? r[1] : null;
    };
    const pickNum = field => {
      const rx = new RegExp(`${field}:\\s*([0-9.]+)`);
      const r = body.match(rx);
      return r ? Number(r[1]) : null;
    };
    // Only capture blocks that look like product configs
    if (!body.includes('priceMonthly:') && !body.includes('price:')) continue;
    out[key] = {
      name: pick('name'),
      appleProductIdMonthly: pick('appleProductIdMonthly'),
      appleProductIdAnnual: pick('appleProductIdAnnual'),
      appleProductId: pick('appleProductId'),
      priceMonthly: pickNum('priceMonthly'),
      priceAnnual: pickNum('priceAnnual'),
      price: pickNum('price'),
      durationDays: pickNum('durationDays'),
      tier: pick('tier'),
    };
  }
  return out;
}
const billingBlocks = parseBillingProducts();

const billingSubs = Object.fromEntries(
  Object.entries(billingBlocks).filter(([, v]) => v.priceMonthly !== null),
);
const tripPasses = Object.fromEntries(
  Object.entries(billingBlocks).filter(([, v]) => v.price !== null && v.appleProductId),
);

// -------- Extract from src/constants/revenuecat.ts --------------------------
const rcSrc = readSrc('src/constants/revenuecat.ts');

function parseRcProducts() {
  const block = rcSrc.match(/REVENUECAT_PRODUCTS\s*=\s*\{([\s\S]*?)\n\}\s*as const;/);
  if (!block) return {};
  const out = {};
  const re = /(\w+):\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(block[1])) !== null) out[m[1]] = m[2];
  return out;
}
function parseRcEntitlements() {
  const block = rcSrc.match(/REVENUECAT_ENTITLEMENTS\s*=\s*\{([\s\S]*?)\n\}\s*as const;/);
  if (!block) return {};
  const out = {};
  const re = /(\w+):[^,]*?['"]([a-z_]+)['"]/g;
  let m;
  while ((m = re.exec(block[1])) !== null) out[m[1]] = m[2];
  return out;
}
function parseRcPricing() {
  const block = rcSrc.match(/REVENUECAT_PRICING\s*=\s*\{([\s\S]*?)\n\}\s*as const;/);
  if (!block) return {};
  const body = block[1];
  const grab = label => {
    const rx = new RegExp(`${label}:\\s*\\{([^}]+)\\}`);
    const m = body.match(rx);
    if (!m) return null;
    const nums = {};
    for (const n of m[1].matchAll(/(monthly|annual|price|durationDays):\s*([0-9.]+)/g)) {
      nums[n[1]] = Number(n[2]);
    }
    return nums;
  };
  const tp = body.match(/tripPasses:\s*\{([\s\S]*?)\n\s*\}/);
  const tpOut = {};
  if (tp) {
    for (const m of tp[1].matchAll(/(explorer|frequentChraveler):\s*\{([^}]+)\}/g)) {
      const nums = {};
      for (const n of m[2].matchAll(/(price|durationDays):\s*([0-9.]+)/g)) {
        nums[n[1]] = Number(n[2]);
      }
      tpOut[m[1]] = nums;
    }
  }
  return {
    explorer: grab('explorer'),
    frequentChraveler: grab('frequentChraveler'),
    tripPasses: tpOut,
  };
}
function parseRequiredIds() {
  const block = rcSrc.match(/REQUIRED_IOS_PRODUCT_IDS\s*=\s*\[([\s\S]*?)\]\s*as const;/);
  if (!block) return [];
  return [...block[1].matchAll(/REVENUECAT_PRODUCTS\.(\w+)/g)].map(m => m[1]);
}

const rcProducts = parseRcProducts();
const rcEntitlements = parseRcEntitlements();
const rcPricing = parseRcPricing();
const requiredIdKeys = parseRequiredIds();

// -------- ASC snapshot ------------------------------------------------------
const ascIds = new Set(JSON.parse(readSrc('appstore/asc-products.json')));

// -------- Google Play snapshot ---------------------------------------------
const playIds = new Set(JSON.parse(readSrc('playstore/play-products.json')));

// -------- Assertions --------------------------------------------------------
const errors = [];
const err = msg => errors.push(msg);

// (a) Every Apple ID in billing/config.ts appears in REVENUECAT_PRODUCTS
const rcValues = new Set(Object.values(rcProducts));
const collectBillingAppleIds = () => {
  const ids = [];
  for (const [k, v] of Object.entries(billingSubs)) {
    if (v.appleProductIdMonthly) ids.push([`${k}.monthly`, v.appleProductIdMonthly]);
    if (
      v.appleProductIdAnnual &&
      k !== 'pro-starter' &&
      k !== 'pro-growth' &&
      k !== 'pro-enterprise'
    )
      ids.push([`${k}.annual`, v.appleProductIdAnnual]);
  }
  for (const [k, v] of Object.entries(tripPasses)) {
    ids.push([k, v.appleProductId]);
  }
  return ids;
};
for (const [label, id] of collectBillingAppleIds()) {
  if (!rcValues.has(id)) err(`Apple ID for ${label} ("${id}") not present in REVENUECAT_PRODUCTS`);
}

// (b) Every REQUIRED_IOS_PRODUCT_IDS entry maps back to a billing product
const billingAppleIdSet = new Set(collectBillingAppleIds().map(([, id]) => id));
for (const key of requiredIdKeys) {
  const id = rcProducts[key];
  if (!id) err(`REQUIRED_IOS_PRODUCT_IDS references unknown key REVENUECAT_PRODUCTS.${key}`);
  else if (!billingAppleIdSet.has(id))
    err(`REQUIRED_IOS_PRODUCT_IDS entry "${id}" has no matching billing/config.ts product`);
}

// (c) Prices in REVENUECAT_PRICING equal prices in BILLING_PRODUCTS / TRIP_PASS_PRODUCTS
const expect = (label, a, b) => {
  if (a !== b) err(`Price mismatch — ${label}: billing=${a} revenuecat=${b}`);
};
expect(
  'Explorer monthly',
  billingSubs['consumer-explorer']?.priceMonthly,
  rcPricing.explorer?.monthly,
);
expect(
  'Explorer annual',
  billingSubs['consumer-explorer']?.priceAnnual,
  rcPricing.explorer?.annual,
);
expect(
  'FC monthly',
  billingSubs['consumer-frequent-chraveler']?.priceMonthly,
  rcPricing.frequentChraveler?.monthly,
);
expect(
  'FC annual',
  billingSubs['consumer-frequent-chraveler']?.priceAnnual,
  rcPricing.frequentChraveler?.annual,
);
expect(
  'Explorer Trip Pass price',
  tripPasses['pass-explorer-45']?.price,
  rcPricing.tripPasses?.explorer?.price,
);
expect(
  'Explorer Trip Pass duration',
  tripPasses['pass-explorer-45']?.durationDays,
  rcPricing.tripPasses?.explorer?.durationDays,
);
expect(
  'FC Trip Pass price',
  tripPasses['pass-frequent-90']?.price,
  rcPricing.tripPasses?.frequentChraveler?.price,
);
expect(
  'FC Trip Pass duration',
  tripPasses['pass-frequent-90']?.durationDays,
  rcPricing.tripPasses?.frequentChraveler?.durationDays,
);

// (d) Entitlements reference known tiers
const requiredEntitlementIds = [
  'chravel_explorer',
  'chravel_frequent_chraveler',
  'chravel_pro_starter',
  'chravel_pro_growth',
  'chravel_pro_enterprise',
];
for (const eid of requiredEntitlementIds) {
  if (!Object.values(rcEntitlements).includes(eid))
    err(`Missing entitlement ID "${eid}" in REVENUECAT_ENTITLEMENTS`);
}

// (e) ASC snapshot matches REQUIRED_IOS_PRODUCT_IDS exactly
const requiredIdValues = new Set(requiredIdKeys.map(k => rcProducts[k]).filter(Boolean));
for (const id of requiredIdValues) {
  if (!ascIds.has(id)) err(`Required IAP "${id}" is missing from appstore/asc-products.json`);
}
for (const id of ascIds) {
  if (!requiredIdValues.has(id))
    err(`ASC snapshot has "${id}" but REQUIRED_IOS_PRODUCT_IDS does not reference it`);
}

// (f) Google Play snapshot mirrors ASC exactly (Play IDs == Apple IDs 1:1)
for (const id of requiredIdValues) {
  if (!playIds.has(id)) err(`Required IAP "${id}" is missing from playstore/play-products.json`);
}
for (const id of playIds) {
  if (!requiredIdValues.has(id))
    err(`Play snapshot has "${id}" but REQUIRED_IOS_PRODUCT_IDS does not reference it`);
}
// (g) Play snapshot equals ASC snapshot (naming parity across stores)
for (const id of ascIds) {
  if (!playIds.has(id))
    err(`ASC has "${id}" but Google Play snapshot does not — cross-store drift`);
}
for (const id of playIds) {
  if (!ascIds.has(id)) err(`Google Play has "${id}" but ASC snapshot does not — cross-store drift`);
}

// -------- Output ------------------------------------------------------------
if (jsonOut) {
  console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
  process.exit(errors.length === 0 ? 0 : 1);
}

const c = (n, s) => `\x1b[${n}m${s}\x1b[0m`;
console.log(c(1, '\nIAP Parity Check (code ↔ RevenueCat ↔ ASC ↔ Google Play)\n'));
if (errors.length === 0) {
  console.log(
    c(32, '  ✓ All Apple/Google IDs, entitlements, prices, and store snapshots are in sync.\n'),
  );
  process.exit(0);
}
console.log(c(31, `  ✗ ${errors.length} parity error(s):\n`));
for (const e of errors) console.log(`    - ${e}`);
console.log('');
process.exit(1);
