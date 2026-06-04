/**
 * Billing Provider Selector
 *
 * Selects the appropriate billing provider based on platform and context.
 * Handles the complexity of iOS IAP requirements vs web checkout.
 */

import type { BillingProvider } from './base';
import { StripeProvider } from './stripe';
import { AppleIAPProvider } from './iap';
import { GooglePlayProvider } from './google';
import { BILLING_FLAGS, BILLING_PRODUCTS } from '../config';
import type { SubscriptionTier, BillingPlatform, PurchaseRequest } from '../types';
import { detectNativeBillingPlatform, isNativeWebView } from '@/utils/platformDetection';

// Singleton instances
let stripeProvider: StripeProvider | null = null;
let appleProvider: AppleIAPProvider | null = null;
let googleProvider: GooglePlayProvider | null = null;

const androidBillingUnavailableProvider: BillingProvider = {
  platform: 'android',
  name: 'AndroidBillingUnavailable',
  isAvailable: () => false,
  getProducts: async () => [],
  purchase: async (_request: PurchaseRequest) => ({
    success: false,
    error: 'Google Play Billing is not available yet. Please update the app and try again.',
    errorCode: 'IAP_NOT_AVAILABLE',
  }),
  restorePurchases: async () => null,
  openManagement: async () => Promise.resolve(),
  verifyEntitlements: async () => {
    throw new Error('Google Play Billing is not available yet.');
  },
};

/**
 * Resolve billing platform from runtime context.
 */
export function detectBillingPlatform(userAgent: string, nativeWebView: boolean): BillingPlatform {
  return detectNativeBillingPlatform(userAgent, nativeWebView);
}

/**
 * Get the current billing platform from runtime context.
 */
export function getPlatform(): BillingPlatform {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent || '';
  return detectBillingPlatform(ua, isNativeWebView());
}

/**
 * Check if running on native platform
 */
export function isNativePlatform(): boolean {
  return getPlatform() !== 'web';
}

/**
 * Get the Stripe provider (singleton)
 */
export function getStripeProvider(): StripeProvider {
  if (!stripeProvider) {
    stripeProvider = new StripeProvider();
  }
  return stripeProvider;
}

/**
 * Get the Apple IAP provider (singleton)
 */
export function getAppleProvider(): AppleIAPProvider {
  if (!appleProvider) {
    appleProvider = new AppleIAPProvider();
  }
  return appleProvider;
}

/**
 * Get the Google Play provider (singleton)
 */
export function getGoogleProvider(): GooglePlayProvider {
  if (!googleProvider) {
    googleProvider = new GooglePlayProvider();
  }
  return googleProvider;
}

/**
 * Get the appropriate billing provider for the current context
 *
 * Logic:
 * - iOS + Consumer plan + IAP enabled → Apple IAP
 * - iOS + Consumer plan + IAP disabled → Apple provider returns a neutral "unavailable" state
 *   (no external/web purchase steering, per App Store 3.1.1)
 * - iOS + Pro plan → Stripe (B2B exception)
 * - Android + Google Billing enabled → Google Play
 * - Android + Consumer + Google Billing disabled → unavailable provider (block web fallback)
 * - Web → Stripe
 */
export function getBillingProvider(tier?: SubscriptionTier): BillingProvider {
  const platform = getPlatform();

  // Web always uses Stripe
  if (platform === 'web') {
    return getStripeProvider();
  }

  // iOS handling
  if (platform === 'ios') {
    // Check if this is a consumer plan (requires IAP)
    const requiresIAP = tier ? requiresIAPForTier(tier) : true;

    if (requiresIAP) {
      // Consumer plans must use IAP when available
      if (BILLING_FLAGS.APPLE_IAP_ENABLED) {
        return getAppleProvider();
      }

      // IAP not enabled - Apple provider surfaces a neutral unavailable state
      // (no external/web purchase steering). Native IAP is wired in chravel-mobile.
      return getAppleProvider();
    }

    // Pro/Enterprise plans can use Stripe (B2B exception)
    return getStripeProvider();
  }

  // Android handling
  if (platform === 'android') {
    // Pro/Enterprise plans can use Stripe (B2B exception)
    if (tier && tier.startsWith('pro-')) {
      return getStripeProvider();
    }

    if (BILLING_FLAGS.GOOGLE_BILLING_ENABLED) {
      return getGoogleProvider();
    }

    // Consumer plans must not silently fall back to web checkout on Android.
    return androidBillingUnavailableProvider;
  }

  // Fallback to Stripe
  return getStripeProvider();
}

/**
 * Check if a tier requires IAP on iOS
 */
export function requiresIAPForTier(tier: SubscriptionTier): boolean {
  // Free tier doesn't require any purchase
  if (tier === 'free') return false;

  // Pro plans can use external payment (B2B exception)
  if (tier.startsWith('pro-')) return false;

  // Consumer plans (explorer, frequent-chraveler) require IAP
  return true;
}

/**
 * Check if web checkout can be used
 *
 * Returns true if:
 * - Running on web
 * - Running on iOS with a Pro plan (B2B exception)
 * - Running on Android with a Pro plan (B2B exception)
 */
export function canUseWebCheckout(tier?: SubscriptionTier): boolean {
  const platform = getPlatform();

  // Web always uses Stripe
  if (platform === 'web') return true;

  // iOS with Pro plan can use web checkout
  if (platform === 'ios' && tier && tier.startsWith('pro-')) {
    return true;
  }

  // iOS with consumer plan - check fallback flag
  if (platform === 'ios' && BILLING_FLAGS.FALLBACK_TO_WEB && !BILLING_FLAGS.APPLE_IAP_ENABLED) {
    // Note: This might still get rejected by App Review
    // Only use for "subscribe on web" messaging, not actual checkout
    return false;
  }

  // Android with Pro plan can use web checkout (B2B exception)
  if (platform === 'android' && tier && tier.startsWith('pro-')) {
    return true;
  }

  // Android consumer subscriptions must not use web checkout under Play policy
  if (platform === 'android') {
    return false;
  }

  return false;
}

/**
 * Get a product ID for the current platform
 */
export function getPlatformProductId(
  productKey: string,
  billingCycle: 'monthly' | 'annual',
): string | null {
  const product = BILLING_PRODUCTS[productKey];
  if (!product) return null;

  const platform = getPlatform();

  if (platform === 'ios') {
    return billingCycle === 'annual'
      ? product.appleProductIdAnnual || null
      : product.appleProductIdMonthly || null;
  }

  if (platform === 'android') {
    return billingCycle === 'annual'
      ? product.googleProductIdAnnual || null
      : product.googleProductIdMonthly || null;
  }

  // Web uses Stripe price IDs
  return billingCycle === 'annual'
    ? product.stripePriceIdAnnual || null
    : product.stripePriceIdMonthly;
}
