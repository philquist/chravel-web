/**
 * RevenueCat Configuration
 *
 * Maps RevenueCat entitlements to Chravel subscription tiers.
 * Ensures parity with Stripe pricing/naming from billing/config.ts.
 *
 * IMPORTANT: Pricing MUST match src/billing/config.ts (source of truth)
 */

import type { SubscriptionTier } from '@/billing/types';

// RevenueCat feature flag - defaults to true; set VITE_REVENUECAT_ENABLED=false to disable
export const REVENUECAT_ENABLED = import.meta.env.VITE_REVENUECAT_ENABLED !== 'false';

// Platform-specific API keys — must be set via environment variables.
// iOS:     set VITE_REVENUECAT_IOS_API_KEY in .env / Vercel / Render dashboard
// Android: set VITE_REVENUECAT_ANDROID_API_KEY similarly
// iOS native SDK key is also set separately in ios/App/App/AppDelegate.swift
export const REVENUECAT_IOS_API_KEY = import.meta.env.VITE_REVENUECAT_IOS_API_KEY || '';
export const REVENUECAT_ANDROID_API_KEY = import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY || '';

/**
 * RevenueCat entitlement IDs - MUST match RevenueCat dashboard
 * These map to our Stripe product names for consistency
 *
 * PLACEHOLDER: Update these IDs after creating entitlements in RevenueCat dashboard
 */
export const REVENUECAT_ENTITLEMENTS = {
  // Consumer tiers (match Stripe CONSUMER_PLANS)
  explorer: import.meta.env.VITE_REVENUECAT_EXPLORER_ENTITLEMENT_ID || 'chravel_explorer',
  frequentChraveler:
    import.meta.env.VITE_REVENUECAT_FREQUENT_CHRAVELER_ENTITLEMENT_ID ||
    'chravel_frequent_chraveler',

  // Pro tiers (web uses Stripe; iOS exposes Starter/Growth monthly through RevenueCat)
  proStarter: 'chravel_pro_starter',
  proGrowth: 'chravel_pro_growth',
  proEnterprise: 'chravel_pro_enterprise',
} as const;

/**
 * Product IDs for RevenueCat offerings
 * These should match the product identifiers in App Store Connect / Google Play Console
 *
 * PLACEHOLDER: Update after creating products in App Store Connect
 * See: src/billing/config.ts for Apple product ID format (com.chravel.*.monthly/annual)
 *
 * Trip Pass products MUST be created as **non-renewing subscriptions** (iOS) /
 * **one-time products** (Android) in the store consoles, then attached in the
 * RevenueCat dashboard to the matching consumer entitlement
 * (`chravel_explorer` / `chravel_frequent_chraveler`) with a 45-day / 90-day
 * grant window. Without those store + dashboard entries,
 * `purchaseTripPass()` will fail with "Trip Pass product … not found".
 */
export const REVENUECAT_PRODUCTS = {
  // Explorer tier - $9.99/month, $99/year (subscription)
  explorerMonthly: 'com.chravel.explorer.monthly',
  explorerAnnual: 'com.chravel.explorer.annual',

  // Frequent Chraveler tier - $19.99/month, $199/year (subscription)
  frequentChravelerMonthly: 'com.chravel.frequentchraveler.monthly',
  frequentChravelerAnnual: 'com.chravel.frequentchraveler.annual',

  // Trip Passes (one-time, primary consumer offering)
  explorerPass45: 'com.chravel.trippass.explorer',
  frequentChravelerPass90: 'com.chravel.trippass.frequent',

  // Pro tiers — Starter/Growth monthly are exposed on iOS via RevenueCat.
  // Enterprise remains contact-sales; annual Pro IAPs are not part of the 2.0(60) submission.
  proStarterMonthly: 'com.chravel.pro.starter.monthly',
  proGrowthMonthly: 'com.chravel.pro.growth.monthly',
} as const;

/** Regex for App Store Trip Pass SKUs (non-renewing IAP). */
export const TRIP_PASS_PRODUCT_ID_RE = /trippass|\.pass\d+/i;

export type RevenueCatPurchaseType = 'subscription' | 'pass';

export function isTripPassProductId(productId: string | null | undefined): boolean {
  if (!productId) return false;
  return TRIP_PASS_PRODUCT_ID_RE.test(productId);
}

export function resolvePurchaseTypeForProductId(
  productId: string | null | undefined,
): RevenueCatPurchaseType {
  return isTripPassProductId(productId) ? 'pass' : 'subscription';
}

/**
 * Single source of truth for which RevenueCat / App Store Connect product IDs
 * MUST exist for iOS purchases to function. Used at runtime by
 * `assertIosProductIdsConfigured()` to surface configuration drift early
 * (App Store Connect product missing, RevenueCat dashboard not attached, etc.)
 * instead of producing a confusing "Product … not found in RevenueCat offerings"
 * error deep inside the purchase flow.
 */
export const REQUIRED_IOS_PRODUCT_IDS = [
  REVENUECAT_PRODUCTS.explorerMonthly,
  REVENUECAT_PRODUCTS.explorerAnnual,
  REVENUECAT_PRODUCTS.frequentChravelerMonthly,
  REVENUECAT_PRODUCTS.frequentChravelerAnnual,
  REVENUECAT_PRODUCTS.explorerPass45,
  REVENUECAT_PRODUCTS.frequentChravelerPass90,
  REVENUECAT_PRODUCTS.proStarterMonthly,
  REVENUECAT_PRODUCTS.proGrowthMonthly,
] as const;

export interface ProductIdAssertion {
  ok: boolean;
  missing: string[];
  blank: string[];
}

/**
 * Validate the static REQUIRED_IOS_PRODUCT_IDS list. This guards against an
 * empty / mistyped / undefined entry in REVENUECAT_PRODUCTS. It does NOT call
 * the RevenueCat SDK — that happens in `assertIosOfferingsContainRequiredProducts`
 * after `configureRevenueCat`.
 */
export function assertIosProductIdsConfigured(): ProductIdAssertion {
  const blank: string[] = [];
  const seen = new Set<string>();
  for (const id of REQUIRED_IOS_PRODUCT_IDS) {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      blank.push(String(id));
    }
    seen.add(id);
  }
  return { ok: blank.length === 0, missing: [], blank };
}

/**
 * Pricing display (for UI)
 *
 * IMPORTANT: These values MUST match src/billing/config.ts
 * Subscriptions: Explorer $9.99/month, $99/year | FC $19.99/month, $199/year
 * Trip Passes (primary consumer offering): Explorer $39.99/45 days | FC $74.99/90 days
 */
export const REVENUECAT_PRICING = {
  explorer: {
    monthly: 9.99,
    annual: 99,
    currency: 'USD',
  },
  frequentChraveler: {
    monthly: 19.99,
    annual: 199,
    currency: 'USD',
  },
  tripPasses: {
    explorer: { price: 39.99, durationDays: 45, currency: 'USD' },
    frequentChraveler: { price: 74.99, durationDays: 90, currency: 'USD' },
  },
} as const;

/**
 * Get the appropriate API key for the current platform
 */
export function getRevenueCatApiKey(platform: 'ios' | 'android' | 'web'): string | null {
  if (platform === 'ios') {
    return REVENUECAT_IOS_API_KEY || null;
  }
  if (platform === 'android') {
    return REVENUECAT_ANDROID_API_KEY || null;
  }
  // Web doesn't use RevenueCat
  return null;
}

/**
 * Check if RevenueCat is properly configured for the given platform
 */
export function isRevenueCatConfigured(platform: 'ios' | 'android' | 'web'): boolean {
  if (!REVENUECAT_ENABLED) return false;
  if (platform === 'web') return false;

  const apiKey = getRevenueCatApiKey(platform);
  return !!apiKey && apiKey.length > 0;
}

/**
 * Full config object for convenience
 */
/**
 * Maps RevenueCat entitlement IDs to Chravel subscription tiers.
 * Used by revenuecatClient to derive the user's plan from active entitlements.
 */
export const ENTITLEMENT_TO_TIER: Record<string, SubscriptionTier> = {
  [REVENUECAT_ENTITLEMENTS.explorer]: 'explorer',
  [REVENUECAT_ENTITLEMENTS.frequentChraveler]: 'frequent-chraveler',
  [REVENUECAT_ENTITLEMENTS.proStarter]: 'pro-starter',
  [REVENUECAT_ENTITLEMENTS.proGrowth]: 'pro-growth',
  [REVENUECAT_ENTITLEMENTS.proEnterprise]: 'pro-enterprise',
};

export const REVENUECAT_CONFIG = {
  enabled: REVENUECAT_ENABLED,
  entitlements: REVENUECAT_ENTITLEMENTS,
  products: REVENUECAT_PRODUCTS,
  pricing: REVENUECAT_PRICING,
} as const;
