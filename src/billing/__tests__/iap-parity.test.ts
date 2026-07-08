/**
 * IAP Parity Test — code-level assertions that prices, product IDs, and
 * entitlements stay identical across billing/config.ts and constants/revenuecat.ts.
 *
 * Mirrors scripts/validate-iap-parity.mjs so drift is caught in Vitest too.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BILLING_PRODUCTS, TRIP_PASS_PRODUCTS } from '../config';
import {
  REVENUECAT_PRODUCTS,
  REVENUECAT_PRICING,
  REVENUECAT_ENTITLEMENTS,
  REQUIRED_IOS_PRODUCT_IDS,
} from '@/constants/revenuecat';

const rcValues = new Set<string>(Object.values(REVENUECAT_PRODUCTS));

describe('IAP parity — billing/config.ts ↔ constants/revenuecat.ts', () => {
  it('every Apple product ID in BILLING_PRODUCTS is present in REVENUECAT_PRODUCTS', () => {
    const missing: string[] = [];
    for (const [key, p] of Object.entries(BILLING_PRODUCTS)) {
      if (p.appleProductIdMonthly && !rcValues.has(p.appleProductIdMonthly))
        missing.push(`${key}.monthly=${p.appleProductIdMonthly}`);
      // Only consumer tiers have annual IAPs in the current submission.
      if (
        p.appleProductIdAnnual &&
        (key === 'consumer-explorer' || key === 'consumer-frequent-chraveler') &&
        !rcValues.has(p.appleProductIdAnnual)
      )
        missing.push(`${key}.annual=${p.appleProductIdAnnual}`);
    }
    expect(missing).toEqual([]);
  });

  it('every Trip Pass Apple product ID is present in REVENUECAT_PRODUCTS', () => {
    for (const [key, p] of Object.entries(TRIP_PASS_PRODUCTS)) {
      expect(rcValues.has(p.appleProductId), `${key} → ${p.appleProductId}`).toBe(true);
    }
  });

  it('every REQUIRED_IOS_PRODUCT_IDS entry maps to a billing product', () => {
    const billingAppleIds = new Set<string>();
    for (const p of Object.values(BILLING_PRODUCTS)) {
      if (p.appleProductIdMonthly) billingAppleIds.add(p.appleProductIdMonthly);
      if (p.appleProductIdAnnual) billingAppleIds.add(p.appleProductIdAnnual);
    }
    for (const p of Object.values(TRIP_PASS_PRODUCTS)) billingAppleIds.add(p.appleProductId);
    for (const id of REQUIRED_IOS_PRODUCT_IDS) {
      expect(billingAppleIds.has(id), `orphaned required id: ${id}`).toBe(true);
    }
  });

  it('REVENUECAT_PRICING matches BILLING_PRODUCTS + TRIP_PASS_PRODUCTS', () => {
    expect(REVENUECAT_PRICING.explorer.monthly).toBe(
      BILLING_PRODUCTS['consumer-explorer'].priceMonthly,
    );
    expect(REVENUECAT_PRICING.explorer.annual).toBe(
      BILLING_PRODUCTS['consumer-explorer'].priceAnnual,
    );
    expect(REVENUECAT_PRICING.frequentChraveler.monthly).toBe(
      BILLING_PRODUCTS['consumer-frequent-chraveler'].priceMonthly,
    );
    expect(REVENUECAT_PRICING.frequentChraveler.annual).toBe(
      BILLING_PRODUCTS['consumer-frequent-chraveler'].priceAnnual,
    );
    expect(REVENUECAT_PRICING.tripPasses.explorer.price).toBe(
      TRIP_PASS_PRODUCTS['pass-explorer-45'].price,
    );
    expect(REVENUECAT_PRICING.tripPasses.explorer.durationDays).toBe(
      TRIP_PASS_PRODUCTS['pass-explorer-45'].durationDays,
    );
    expect(REVENUECAT_PRICING.tripPasses.frequentChraveler.price).toBe(
      TRIP_PASS_PRODUCTS['pass-frequent-90'].price,
    );
    expect(REVENUECAT_PRICING.tripPasses.frequentChraveler.durationDays).toBe(
      TRIP_PASS_PRODUCTS['pass-frequent-90'].durationDays,
    );
  });

  it('canonical entitlement IDs exist in REVENUECAT_ENTITLEMENTS', () => {
    const values = new Set<string>(Object.values(REVENUECAT_ENTITLEMENTS));
    for (const eid of [
      'chravel_explorer',
      'chravel_frequent_chraveler',
      'chravel_pro_starter',
      'chravel_pro_growth',
      'chravel_pro_enterprise',
    ]) {
      expect(values.has(eid), `missing entitlement ${eid}`).toBe(true);
    }
  });

  it('ASC snapshot (appstore/asc-products.json) matches REQUIRED_IOS_PRODUCT_IDS exactly', () => {
    const ascPath = resolve(process.cwd(), 'appstore/asc-products.json');
    const asc = new Set<string>(JSON.parse(readFileSync(ascPath, 'utf8')));
    const required = new Set<string>(REQUIRED_IOS_PRODUCT_IDS);
    const missingInAsc = [...required].filter((x) => !asc.has(x));
    const orphanInAsc = [...asc].filter((x) => !required.has(x));
    expect(missingInAsc, 'required IAPs missing from ASC snapshot').toEqual([]);
    expect(orphanInAsc, 'ASC snapshot has products not required by code').toEqual([]);
  });
});
