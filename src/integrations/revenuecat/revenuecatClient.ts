/**
 * RevenueCat Client Wrapper
 *
 * Platform-aware wrapper for RevenueCat.
 * Handles demo mode, web fallbacks, and graceful degradation.
 */

import {
  REVENUECAT_ENABLED,
  getRevenueCatApiKey,
  isRevenueCatConfigured,
  ENTITLEMENT_TO_TIER,
  REVENUECAT_ENTITLEMENTS,
  REVENUECAT_PRODUCTS,
} from '@/constants/revenuecat';
import type {
  RevenueCatPlatform,
  RevenueCatResult,
  RevenueCatCustomerInfo,
  RevenueCatOfferings,
  RevenueCatPurchaseResult,
  DerivedPlan,
} from './types';
import type { SubscriptionTier } from '@/billing/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { detectNativeBillingPlatform, isNativeWebView } from '@/utils/platformDetection';

// Native IAP handled by chravel-mobile.
// This variable is kept as a null placeholder for the loadPurchasesPlugin() interface.
const Purchases: unknown | null = null;

/**
 * Get current platform using the same native detector as billing provider selection.
 */
export function getPlatform(): RevenueCatPlatform {
  if (typeof navigator === 'undefined') return 'web';
  return detectNativeBillingPlatform(navigator.userAgent || '', isNativeWebView());
}

/**
 * Check if we're on a native platform.
 */
export function isNativePlatform(): boolean {
  return getPlatform() !== 'web';
}

/**
 * Check if RevenueCat is available on this platform
 */
export function isRevenueCatAvailable(): boolean {
  const platform = getPlatform();
  return platform !== 'web' && REVENUECAT_ENABLED && isRevenueCatConfigured(platform);
}

/**
 * Load the RevenueCat plugin dynamically.
 * Always returns null on web — native IAP handled by chravel-mobile.
 */
async function loadPurchasesPlugin(): Promise<unknown | null> {
  if (Purchases) return Purchases;

  try {
    // Plugin removed — native IAP handled by chravel-mobile
    return null;
  } catch (error) {
    console.warn('[RevenueCat] Failed to load plugin:', error);
    return null;
  }
}

/**
 * Configure RevenueCat for the current user
 *
 * @param userId - User ID to associate with RevenueCat
 * @param isDemoMode - If true, skip configuration
 */
export async function configureRevenueCat(
  userId: string,
  isDemoMode: boolean = false,
): Promise<RevenueCatResult> {
  // Demo mode: no-op
  if (isDemoMode) {
    console.log('[RevenueCat] Demo mode active, skipping configuration');
    return { success: true, supported: false, error: 'Demo mode active' };
  }

  // Check if enabled
  if (!REVENUECAT_ENABLED) {
    console.log('[RevenueCat] Feature flag disabled');
    return { success: false, supported: false, errorCode: 'NOT_CONFIGURED' };
  }

  const platform = getPlatform();

  // Web: not supported
  if (platform === 'web') {
    console.log('[RevenueCat] Web platform detected, IAP not supported');
    return { success: false, supported: false, errorCode: 'NOT_SUPPORTED' };
  }

  // Get API key
  const apiKey = getRevenueCatApiKey(platform);
  if (!apiKey) {
    console.warn('[RevenueCat] No API key configured for platform:', platform);
    return {
      success: false,
      supported: true,
      errorCode: 'NOT_CONFIGURED',
      error: 'API key not configured',
    };
  }

  // Load plugin
  const purchases = await loadPurchasesPlugin();
  if (!purchases) {
    return {
      success: false,
      supported: true,
      errorCode: 'NOT_SUPPORTED',
      error: 'Failed to load RevenueCat plugin',
    };
  }

  try {
    // Configure RevenueCat
    await (purchases as any).configure({
      apiKey,
      appUserID: userId,
    });

    console.log('[RevenueCat] Configured successfully for user:', userId);
    return { success: true, supported: true };
  } catch (error) {
    console.error('[RevenueCat] Configuration failed:', error);
    return {
      success: false,
      supported: true,
      errorCode: 'UNKNOWN',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get customer info from RevenueCat
 */
export async function getCustomerInfo(
  isDemoMode: boolean = false,
): Promise<RevenueCatResult<RevenueCatCustomerInfo>> {
  if (isDemoMode) {
    return { success: false, supported: false, error: 'Demo mode active' };
  }

  if (!isRevenueCatAvailable()) {
    return { success: false, supported: false, errorCode: 'NOT_SUPPORTED' };
  }

  const purchases = await loadPurchasesPlugin();
  if (!purchases) {
    return { success: false, supported: true, errorCode: 'NOT_SUPPORTED' };
  }

  try {
    const { customerInfo } = await (purchases as any).getCustomerInfo();
    return {
      success: true,
      supported: true,
      data: customerInfo as unknown as RevenueCatCustomerInfo,
    };
  } catch (error) {
    console.error('[RevenueCat] Failed to get customer info:', error);
    return {
      success: false,
      supported: true,
      errorCode: 'NETWORK_ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get available offerings
 */
export async function getOfferings(
  isDemoMode: boolean = false,
): Promise<RevenueCatResult<RevenueCatOfferings>> {
  if (isDemoMode) {
    return { success: false, supported: false, error: 'Demo mode active' };
  }

  if (!isRevenueCatAvailable()) {
    return { success: false, supported: false, errorCode: 'NOT_SUPPORTED' };
  }

  const purchases = await loadPurchasesPlugin();
  if (!purchases) {
    return { success: false, supported: true, errorCode: 'NOT_SUPPORTED' };
  }

  try {
    // getOfferings returns PurchasesOfferings directly
    const offerings = await (purchases as any).getOfferings();
    return {
      success: true,
      supported: true,
      data: offerings as unknown as RevenueCatOfferings,
    };
  } catch (error) {
    console.error('[RevenueCat] Failed to get offerings:', error);
    return {
      success: false,
      supported: true,
      errorCode: 'NETWORK_ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Purchase a package
 */
export async function purchasePackage(
  packageIdentifier: string,
  offeringIdentifier: string = 'default',
  isDemoMode: boolean = false,
): Promise<RevenueCatPurchaseResult> {
  if (isDemoMode) {
    return { success: false, supported: false, error: 'Demo mode active' };
  }

  if (!isRevenueCatAvailable()) {
    return { success: false, supported: false, errorCode: 'NOT_SUPPORTED' };
  }

  const purchases = await loadPurchasesPlugin();
  if (!purchases) {
    return { success: false, supported: true, errorCode: 'NOT_SUPPORTED' };
  }

  try {
    // Get offerings first to find the package
    const offerings = await (purchases as any).getOfferings();
    const offering = offerings?.all?.[offeringIdentifier] || offerings?.current;

    if (!offering) {
      return { success: false, supported: true, errorCode: 'UNKNOWN', error: 'No offering found' };
    }

    const pkg = offering.availablePackages?.find(p => p.identifier === packageIdentifier);
    if (!pkg) {
      return { success: false, supported: true, errorCode: 'UNKNOWN', error: 'Package not found' };
    }

    const { customerInfo } = await (purchases as any).purchasePackage({ aPackage: pkg });

    console.log('[RevenueCat] Purchase successful');
    return {
      success: true,
      supported: true,
      data: customerInfo as unknown as RevenueCatCustomerInfo,
    };
  } catch (error: unknown) {
    console.error('[RevenueCat] Purchase failed:', error);

    // Check for user cancellation
    const errorObj = error as { userCancelled?: boolean; message?: string };
    if (errorObj?.userCancelled) {
      return {
        success: false,
        supported: true,
        errorCode: 'CANCELLED',
        error: 'Purchase cancelled',
      };
    }

    return {
      success: false,
      supported: true,
      errorCode: 'UNKNOWN',
      error: errorObj?.message || 'Unknown error',
    };
  }
}

/**
 * Purchase a non-renewing Trip Pass (one-time consumer pass).
 *
 * Looks up the RevenueCat package whose product identifier matches the
 * App Store Connect / Play Console SKU for the requested pass tier, then
 * routes through the standard purchasePackage flow so the global purchase
 * listener, entitlement sync, and toast UX all fire identically to a
 * recurring subscription purchase.
 *
 * Duration (45 / 90 days) is enforced server-side by RevenueCat's
 * non-renewing product configuration in the dashboard.
 */
export async function purchaseTripPass(
  passTier: 'explorer' | 'frequent-chraveler',
  isDemoMode: boolean = false,
): Promise<RevenueCatPurchaseResult> {
  if (isDemoMode) {
    return { success: false, supported: false, error: 'Demo mode active' };
  }

  if (!isRevenueCatAvailable()) {
    return { success: false, supported: false, errorCode: 'NOT_SUPPORTED' };
  }

  const purchases = await loadPurchasesPlugin();
  if (!purchases) {
    return { success: false, supported: true, errorCode: 'NOT_SUPPORTED' };
  }

  const productId =
    passTier === 'explorer'
      ? REVENUECAT_PRODUCTS.explorerPass45
      : REVENUECAT_PRODUCTS.frequentChravelerPass90;

  try {
    const offerings = await (purchases as any).getOfferings();
    // Search every offering — passes typically live in a dedicated "trip_pass"
    // offering rather than the default subscription offering.
    const allOfferings = [
      ...Object.values(offerings?.all || {}),
      offerings?.current,
    ].filter(Boolean) as Array<{ availablePackages?: Array<{ product?: { identifier?: string } }> }>;

    let pkg: unknown = null;
    for (const off of allOfferings) {
      const match = off.availablePackages?.find(p => p.product?.identifier === productId);
      if (match) {
        pkg = match;
        break;
      }
    }

    if (!pkg) {
      return {
        success: false,
        supported: true,
        errorCode: 'UNKNOWN',
        error: `Trip Pass product ${productId} not found in RevenueCat offerings`,
      };
    }

    const { customerInfo } = await (purchases as any).purchasePackage({ aPackage: pkg });
    console.log('[RevenueCat] Trip Pass purchase successful', { productId });
    return {
      success: true,
      supported: true,
      data: customerInfo as unknown as RevenueCatCustomerInfo,
    };
  } catch (error: unknown) {
    console.error('[RevenueCat] Trip Pass purchase failed:', error);
    const errorObj = error as { userCancelled?: boolean; message?: string };
    if (errorObj?.userCancelled) {
      return {
        success: false,
        supported: true,
        errorCode: 'CANCELLED',
        error: 'Purchase cancelled',
      };
    }
    return {
      success: false,
      supported: true,
      errorCode: 'UNKNOWN',
      error: errorObj?.message || 'Unknown error',
    };
  }
}

/**
 * Restore purchases (required for Apple compliance)
 */
export async function restorePurchases(
  isDemoMode: boolean = false,
): Promise<RevenueCatResult<RevenueCatCustomerInfo>> {
  if (isDemoMode) {
    return { success: false, supported: false, error: 'Demo mode active' };
  }

  if (!isRevenueCatAvailable()) {
    return { success: false, supported: false, errorCode: 'NOT_SUPPORTED' };
  }

  const purchases = await loadPurchasesPlugin();
  if (!purchases) {
    return { success: false, supported: true, errorCode: 'NOT_SUPPORTED' };
  }

  try {
    const { customerInfo } = await (purchases as any).restorePurchases();
    console.log('[RevenueCat] Restore successful');
    return {
      success: true,
      supported: true,
      data: customerInfo as unknown as RevenueCatCustomerInfo,
    };
  } catch (error) {
    console.error('[RevenueCat] Restore failed:', error);
    return {
      success: false,
      supported: true,
      errorCode: 'NETWORK_ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Logout from RevenueCat
 */
export async function logoutRevenueCat(): Promise<RevenueCatResult> {
  if (!isRevenueCatAvailable()) {
    return { success: true, supported: false };
  }

  const purchases = await loadPurchasesPlugin();
  if (!purchases) {
    return { success: true, supported: false };
  }

  try {
    await (purchases as any).logOut();
    console.log('[RevenueCat] Logged out');
    return { success: true, supported: true };
  } catch (error) {
    console.error('[RevenueCat] Logout failed:', error);
    return {
      success: false,
      supported: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Derive plan from RevenueCat customer info
 */

/**
 * Unified native RevenueCat sync adapter.
 * Single entrypoint for configure -> customerInfo -> backend sync.
 */
export async function syncRevenueCatEntitlementsForUser(
  userId: string,
  isDemoMode: boolean = false,
): Promise<RevenueCatResult<RevenueCatCustomerInfo>> {
  const configured = await configureRevenueCat(userId, isDemoMode);
  if (!configured.success || !configured.supported) {
    return {
      success: configured.success,
      supported: configured.supported,
      errorCode: configured.errorCode,
      error: configured.error,
    };
  }

  const customerInfoResult = await getCustomerInfo(isDemoMode);
  if (!customerInfoResult.success || !customerInfoResult.data) {
    return customerInfoResult;
  }

  const syncResult = await supabase.functions.invoke('sync-revenuecat-entitlement', {
    body: { customerInfo: customerInfoResult.data },
  });

  if (syncResult.error) {
    return {
      success: false,
      supported: true,
      errorCode: 'UNKNOWN',
      error: syncResult.error.message || 'Failed to sync RevenueCat entitlement',
    };
  }

  return customerInfoResult;
}

export function derivePlanFromCustomerInfo(customerInfo: RevenueCatCustomerInfo): DerivedPlan {
  const activeEntitlements = customerInfo.entitlements?.active || {};
  const entitlementIds = Object.keys(activeEntitlements);

  // Default to free
  let tier: SubscriptionTier = 'free';
  let status: 'active' | 'trialing' | 'expired' | 'canceled' = 'active';
  let currentPeriodEnd: Date | null = null;

  // Check for highest tier entitlement (frequent-chraveler > explorer)
  if (activeEntitlements[REVENUECAT_ENTITLEMENTS.frequentChraveler]?.isActive) {
    tier = 'frequent-chraveler';
    const entitlement = activeEntitlements[REVENUECAT_ENTITLEMENTS.frequentChraveler];
    if (entitlement.expirationDate) {
      currentPeriodEnd = new Date(entitlement.expirationDate);
    }
    if (entitlement.periodType === 'trial') {
      status = 'trialing';
    }
  } else if (activeEntitlements[REVENUECAT_ENTITLEMENTS.explorer]?.isActive) {
    tier = 'explorer';
    const entitlement = activeEntitlements[REVENUECAT_ENTITLEMENTS.explorer];
    if (entitlement.expirationDate) {
      currentPeriodEnd = new Date(entitlement.expirationDate);
    }
    if (entitlement.periodType === 'trial') {
      status = 'trialing';
    }
  }

  // Check for pro tiers (future use)
  for (const [entitlementId, info] of Object.entries(activeEntitlements)) {
    const mappedTier = ENTITLEMENT_TO_TIER[entitlementId];
    if (mappedTier && mappedTier.startsWith('pro-') && info.isActive) {
      tier = mappedTier;
      if (info.expirationDate) {
        currentPeriodEnd = new Date(info.expirationDate);
      }
      break;
    }
  }

  return {
    tier,
    status,
    currentPeriodEnd,
    source: 'revenuecat',
    entitlements: entitlementIds,
  };
}

/**
 * Setup global purchase listener for native runtime
 */
export function setupGlobalPurchaseListener() {
  if (typeof window !== 'undefined') {
    window.onRevenueCatPurchase = () => {
      console.log('[Native] Purchase completed successfully');
      toast.success('Subscription Updated', {
        description: 'Your purchase was successful! Features are unlocking...',
      });
      // Force reload entitlements if needed, or rely on realtime updates
    };
  }
}
