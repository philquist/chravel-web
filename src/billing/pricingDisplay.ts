/**
 * Pricing Display Helpers
 *
 * The ONLY place UI components should get formatted price strings from.
 * Everything is derived from `src/billing/config.ts` (the single numeric source
 * of truth) so no component hardcodes a dollar amount. If a price changes, it
 * changes once in billing/config.ts and every surface follows.
 *
 * See docs/ACTIVE/PAYMENTS_AUDIT.md for the source-of-truth model.
 */

import { BILLING_PRODUCTS, TRIP_PASS_PRODUCTS, getProductByTier } from './config';

/** The two paid consumer subscription tiers (subset of SubscriptionTier). */
export type ConsumerTier = 'explorer' | 'frequent-chraveler';

/** Format a USD amount. Whole numbers render without cents ("$99"), else 2dp ("$9.99"). */
export const formatUsd = (amount: number): string =>
  Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;

/** Always render with 2 decimal places ("$8.25"). */
export const formatUsd2 = (amount: number): string => `$${amount.toFixed(2)}`;

const CONSUMER_PRODUCT_KEY: Record<ConsumerTier, string> = {
  explorer: 'consumer-explorer',
  'frequent-chraveler': 'consumer-frequent-chraveler',
};

const PASS_KEY: Record<ConsumerTier, string> = {
  explorer: 'pass-explorer-45',
  'frequent-chraveler': 'pass-frequent-90',
};

interface ConsumerPriceDisplay {
  monthlyNum: number;
  annualNum: number;
  /** "$9.99" */
  monthly: string;
  /** "$99" */
  annual: string;
  /** annual / 12, e.g. "$8.25" */
  annualPerMonth: string;
  /** monthly * 12 (strike-through "original" annual), e.g. "$119.88" */
  originalAnnual: string;
  /** floor(monthly*12 - annual), e.g. 20 */
  annualSavings: number;
  /** "Save $20/year" */
  annualSavingsLabel: string;
  /** round((1 - annual/(monthly*12)) * 100), e.g. 17 */
  annualSavingsPct: number;
}

const buildConsumerDisplay = (tier: ConsumerTier): ConsumerPriceDisplay => {
  const product = BILLING_PRODUCTS[CONSUMER_PRODUCT_KEY[tier]];
  const monthlyNum = product.priceMonthly;
  const annualNum = product.priceAnnual ?? monthlyNum * 12;
  const original = monthlyNum * 12;
  const savings = Math.floor(original - annualNum);
  const pct = Math.round((1 - annualNum / original) * 100);
  return {
    monthlyNum,
    annualNum,
    monthly: formatUsd(monthlyNum),
    annual: formatUsd(annualNum),
    annualPerMonth: formatUsd2(annualNum / 12),
    originalAnnual: formatUsd2(original),
    annualSavings: savings,
    annualSavingsLabel: `Save $${savings}/year`,
    annualSavingsPct: pct,
  };
};

/** Formatted consumer subscription pricing, keyed by tier. Derived from config. */
export const CONSUMER_PRICE_DISPLAY: Record<ConsumerTier, ConsumerPriceDisplay> = {
  explorer: buildConsumerDisplay('explorer'),
  'frequent-chraveler': buildConsumerDisplay('frequent-chraveler'),
};

interface TripPassDisplay {
  priceNum: number;
  durationDays: number;
  /** "$39.99" */
  price: string;
  /** "$39.99 for 45 days" */
  label: string;
}

const buildPassDisplay = (tier: ConsumerTier): TripPassDisplay => {
  const pass = TRIP_PASS_PRODUCTS[PASS_KEY[tier]];
  return {
    priceNum: pass.price,
    durationDays: pass.durationDays,
    price: formatUsd(pass.price),
    label: `${formatUsd(pass.price)} for ${pass.durationDays} days`,
  };
};

/** Formatted Trip Pass pricing, keyed by tier. Derived from config. */
export const TRIP_PASS_DISPLAY: Record<ConsumerTier, TripPassDisplay> = {
  explorer: buildPassDisplay('explorer'),
  'frequent-chraveler': buildPassDisplay('frequent-chraveler'),
};

/**
 * Monthly price label for any tier, e.g. "$49". Pro-enterprise (custom, 0) → "Custom".
 * Useful for Pro screens that render directly from a tier.
 */
export const monthlyPriceLabel = (
  tier: 'explorer' | 'frequent-chraveler' | 'pro-starter' | 'pro-growth' | 'pro-enterprise',
): string => {
  const product = getProductByTier(tier);
  if (!product || product.priceMonthly === 0) return 'Custom';
  return formatUsd(product.priceMonthly);
};
