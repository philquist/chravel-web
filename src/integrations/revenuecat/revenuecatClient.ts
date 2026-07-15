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
  REQUIRED_IOS_PRODUCT_IDS,
  assertIosProductIdsConfigured,
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

/** Dispatched after RevenueCat entitlements are synced to Supabase. */
export const ENTITLEMENTS_UPDATED_EVENT = 'chravel:entitlements-updated';

function dispatchEntitlementsUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ENTITLEMENTS_UPDATED_EVENT));
  }
}

async function syncCustomerInfoToBackend(
  customerInfo: RevenueCatCustomerInfo,
  options: { productId?: string; syncAll?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const syncResult = await supabase.functions.invoke('sync-revenuecat-entitlement', {
    body: {
      customerInfo,
      productId: options.productId,
      syncAll: options.syncAll,
    },
  });

  if (syncResult.error) {
    return {
      ok: false,
      error: syncResult.error.message || 'Failed to sync RevenueCat entitlement',
    };
  }

  dispatchEntitlementsUpdated();
  return { ok: true };
}

// Native IAP handled by chravel-mobile.
// This variable is kept as a null placeholder for the loadPurchasesPlugin() interface.
const Purchases: unknown | null = null;

type RevenueCatPlugin = {
  configure?: (options: { apiKey: string; appUserID: string }) => Promise<void> | void;
  logIn?: (options: { appUserID: string }) => Promise<unknown> | unknown;
  identify?: (options: { appUserID: string }) => Promise<unknown> | unknown;
  getCustomerInfo?: () => Promise<{ customerInfo: unknown }> | { customerInfo: unknown };
  getOfferings?: () => Promise<unknown> | unknown;
  purchasePackage?: (options: {
    aPackage: unknown;
  }) => Promise<{ customerInfo: unknown }> | { customerInfo: unknown };
  restorePurchases?: () => Promise<{ customerInfo: unknown }> | { customerInfo: unknown };
  logOut?: () => Promise<void> | void;
};

type RevenueCatOfferingLike = {
  current?: {
    availablePackages?: Array<{ identifier?: string; product?: { identifier?: string } }>;
  } | null;
  all?: Record<
    string,
    { availablePackages?: Array<{ identifier?: string; product?: { identifier?: string } }> }
  >;
};

interface RevenueCatInitializationState {
  key: string;
  promise: Promise<RevenueCatResult>;
}

let revenueCatInitialization: RevenueCatInitializationState | null = null;

function getInitializationKey(
  userId: string,
  platform: RevenueCatPlatform,
  isDemoMode: boolean,
): string {
  return `${platform}:${isDemoMode ? 'demo' : 'live'}:${userId}`;
}

async function awaitActiveRevenueCatInitialization(): Promise<RevenueCatResult | null> {
  if (!revenueCatInitialization) return null;
  return revenueCatInitialization.promise;
}

function asRevenueCatPlugin(plugin: unknown): RevenueCatPlugin | null {
  return plugin && typeof plugin === 'object' ? (plugin as RevenueCatPlugin) : null;
}

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

  if (typeof window !== 'undefined') {
    const win = window as Window & {
      Purchases?: unknown;
      Capacitor?: { Plugins?: { Purchases?: unknown } };
    };
    if (win.Purchases) return win.Purchases;
    if (win.Capacitor?.Plugins?.Purchases) return win.Capacitor.Plugins.Purchases;
  }

  try {
    // Plugin removed — native IAP handled by chravel-mobile shell injection.
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
  const platform = getPlatform();
  const key = getInitializationKey(userId, platform, isDemoMode);
  if (revenueCatInitialization?.key === key) {
    return revenueCatInitialization.promise;
  }

  const initializationPromise = initializeRevenueCat(userId, platform, isDemoMode);
  revenueCatInitialization = { key, promise: initializationPromise };

  const result = await initializationPromise;
  if (!result.success) {
    revenueCatInitialization = null;
  }
  return result;
}

async function initializeRevenueCat(
  userId: string,
  platform: RevenueCatPlatform,
  isDemoMode: boolean,
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
  const purchases = asRevenueCatPlugin(await loadPurchasesPlugin());
  if (!purchases?.configure) {
    return {
      success: false,
      supported: true,
      errorCode: 'NOT_SUPPORTED',
      error: 'Failed to load RevenueCat plugin',
    };
  }

  try {
    // Fail-fast guard: surface configuration drift (blank/missing product IDs)
    // BEFORE any purchase flow lands users in an opaque "product not found" error.
    if (platform === 'ios') {
      const productAssertion = assertIosProductIdsConfigured();
      if (!productAssertion.ok) {
        console.error(
          '[RevenueCat] REQUIRED_IOS_PRODUCT_IDS contains blank entries:',
          productAssertion.blank,
        );
      }
    }

    // Configure RevenueCat exactly once for the current user/platform key. Every
    // RevenueCat call path awaits this promise when it is in flight.
    await purchases.configure({
      apiKey,
      appUserID: userId,
    });

    console.log('[RevenueCat] Configured successfully for user:', userId);

    // Fire-and-forget runtime audit: do every REQUIRED iOS product ID exist
    // in the live RevenueCat offerings? Logs missing IDs so dashboard drift
    // surfaces in Sentry/console rather than as opaque purchase failures.
    if (platform === 'ios') {
      void assertIosOfferingsContainRequiredProducts(isDemoMode).catch(err => {
        console.warn('[RevenueCat] Offerings audit failed:', err);
      });
    }

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
 * Identify/log in the current user after RevenueCat is configured.
 * This prevents native-shell fire-and-forget auth effects from no-oping before configure resolves.
 */
export async function identifyUser(
  userId: string,
  isDemoMode: boolean = false,
): Promise<RevenueCatResult> {
  const configured = await configureRevenueCat(userId, isDemoMode);
  if (!configured.success || !configured.supported) {
    return configured;
  }

  const purchases = asRevenueCatPlugin(await loadPurchasesPlugin());
  if (!purchases) {
    return { success: false, supported: true, errorCode: 'NOT_SUPPORTED' };
  }

  try {
    if (purchases.logIn) {
      await purchases.logIn({ appUserID: userId });
    } else if (purchases.identify) {
      await purchases.identify({ appUserID: userId });
    }
    return { success: true, supported: true };
  } catch (error) {
    console.error('[RevenueCat] Identify failed:', error);
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

  const initialized = await awaitActiveRevenueCatInitialization();
  if (initialized && (!initialized.success || !initialized.supported)) {
    return initialized as RevenueCatResult<RevenueCatCustomerInfo>;
  }

  const purchases = asRevenueCatPlugin(await loadPurchasesPlugin());
  if (!purchases?.getCustomerInfo) {
    return { success: false, supported: true, errorCode: 'NOT_SUPPORTED' };
  }

  try {
    const { customerInfo } = await purchases.getCustomerInfo();
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

  const initialized = await awaitActiveRevenueCatInitialization();
  if (initialized && (!initialized.success || !initialized.supported)) {
    return initialized as RevenueCatResult<RevenueCatOfferings>;
  }

  const purchases = asRevenueCatPlugin(await loadPurchasesPlugin());
  if (!purchases?.getOfferings) {
    return { success: false, supported: true, errorCode: 'NOT_SUPPORTED' };
  }

  try {
    // getOfferings returns PurchasesOfferings directly
    const offerings = await purchases.getOfferings();
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

  const initialized = await awaitActiveRevenueCatInitialization();
  if (initialized && (!initialized.success || !initialized.supported)) {
    return initialized as RevenueCatPurchaseResult;
  }

  const purchases = asRevenueCatPlugin(await loadPurchasesPlugin());
  if (!purchases?.getOfferings || !purchases.purchasePackage) {
    return { success: false, supported: true, errorCode: 'NOT_SUPPORTED' };
  }

  try {
    // Get offerings first to find the package
    const offerings = (await purchases.getOfferings()) as RevenueCatOfferingLike;
    const offering = offerings?.all?.[offeringIdentifier] || offerings?.current;

    if (!offering) {
      return { success: false, supported: true, errorCode: 'UNKNOWN', error: 'No offering found' };
    }

    const pkg = offering.availablePackages?.find(p => p.identifier === packageIdentifier);
    if (!pkg) {
      return { success: false, supported: true, errorCode: 'UNKNOWN', error: 'Package not found' };
    }

    const { customerInfo } = await purchases.purchasePackage({ aPackage: pkg });

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
 * Generic: purchase any RevenueCat package by its underlying store
 * product identifier (App Store Connect / Play Console SKU). Looks the
 * product up across **all** offerings so non-default offerings (Pro,
 * Trip Pass, etc.) resolve correctly.
 */
export async function purchaseByProductId(
  productId: string,
  isDemoMode: boolean = false,
): Promise<RevenueCatPurchaseResult> {
  if (isDemoMode) {
    return { success: false, supported: false, error: 'Demo mode active' };
  }

  if (!isRevenueCatAvailable()) {
    return { success: false, supported: false, errorCode: 'NOT_SUPPORTED' };
  }

  const initialized = await awaitActiveRevenueCatInitialization();
  if (initialized && (!initialized.success || !initialized.supported)) {
    return initialized as RevenueCatPurchaseResult;
  }

  const purchases = asRevenueCatPlugin(await loadPurchasesPlugin());
  if (!purchases?.getOfferings || !purchases.purchasePackage) {
    return { success: false, supported: true, errorCode: 'NOT_SUPPORTED' };
  }

  try {
    const offerings = (await purchases.getOfferings()) as RevenueCatOfferingLike;
    const allOfferings = [...Object.values(offerings?.all || {}), offerings?.current].filter(
      Boolean,
    ) as Array<{
      availablePackages?: Array<{ identifier?: string; product?: { identifier?: string } }>;
    }>;

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
        error: `Product ${productId} not found in RevenueCat offerings`,
      };
    }

    const { customerInfo } = await purchases.purchasePackage({ aPackage: pkg });
    console.log('[RevenueCat] Purchase successful', { productId });
    const typedCustomerInfo = customerInfo as unknown as RevenueCatCustomerInfo;
    const syncRes = await syncCustomerInfoToBackend(typedCustomerInfo, { productId });
    if (!syncRes.ok) {
      console.warn('[RevenueCat] Post-purchase sync failed:', syncRes.error);
    }
    verifyEntitlementMapping(typedCustomerInfo);
    return {
      success: true,
      supported: true,
      data: typedCustomerInfo,
    };
  } catch (error: unknown) {
    console.error('[RevenueCat] Purchase failed:', error, { productId });
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
 * Duration (45 / 90 days) is enforced server-side by RevenueCat's
 * non-renewing product configuration in the dashboard.
 */
export async function purchaseTripPass(
  passTier: 'explorer' | 'frequent-chraveler',
  isDemoMode: boolean = false,
): Promise<RevenueCatPurchaseResult> {
  const productId =
    passTier === 'explorer'
      ? REVENUECAT_PRODUCTS.explorerPass45
      : REVENUECAT_PRODUCTS.frequentChravelerPass90;
  return purchaseByProductId(productId, isDemoMode);
}

/**
 * Purchase a recurring consumer subscription (Explorer / Frequent Chraveler)
 * via Apple IAP / Google Play Billing through RevenueCat.
 */
export async function purchaseConsumerSubscription(
  tier: 'explorer' | 'frequent-chraveler',
  cycle: 'monthly' | 'annual',
  isDemoMode: boolean = false,
): Promise<RevenueCatPurchaseResult> {
  const map = {
    explorer: {
      monthly: REVENUECAT_PRODUCTS.explorerMonthly,
      annual: REVENUECAT_PRODUCTS.explorerAnnual,
    },
    'frequent-chraveler': {
      monthly: REVENUECAT_PRODUCTS.frequentChravelerMonthly,
      annual: REVENUECAT_PRODUCTS.frequentChravelerAnnual,
    },
  } as const;
  return purchaseByProductId(map[tier][cycle], isDemoMode);
}

/**
 * Purchase a Chravel Pro subscription via RevenueCat. Pro is B2B and also
 * available through web Stripe checkout, but exposing IAP keeps every plan
 * purchasable on iOS without forcing users to leave the app.
 */
export async function purchaseProSubscription(
  tier: 'pro-starter' | 'pro-growth',
  cycle: 'monthly' = 'monthly',
  isDemoMode: boolean = false,
): Promise<RevenueCatPurchaseResult> {
  const map = {
    'pro-starter': {
      monthly: REVENUECAT_PRODUCTS.proStarterMonthly,
    },
    'pro-growth': {
      monthly: REVENUECAT_PRODUCTS.proGrowthMonthly,
    },
  } as const;
  return purchaseByProductId(map[tier][cycle], isDemoMode);
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

  const initialized = await awaitActiveRevenueCatInitialization();
  if (initialized && (!initialized.success || !initialized.supported)) {
    return initialized as RevenueCatResult<RevenueCatCustomerInfo>;
  }

  const purchases = asRevenueCatPlugin(await loadPurchasesPlugin());
  if (!purchases?.restorePurchases) {
    return { success: false, supported: true, errorCode: 'NOT_SUPPORTED' };
  }

  try {
    const { customerInfo } = await purchases.restorePurchases();
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

  const initialized = await awaitActiveRevenueCatInitialization();
  if (initialized && (!initialized.success || !initialized.supported)) {
    return { success: true, supported: false };
  }

  const purchases = asRevenueCatPlugin(await loadPurchasesPlugin());
  if (!purchases?.logOut) {
    return { success: true, supported: false };
  }

  try {
    await purchases.logOut();
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

  const syncRes = await syncCustomerInfoToBackend(customerInfoResult.data, { syncAll: true });

  if (!syncRes.ok) {
    return {
      success: false,
      supported: true,
      errorCode: 'UNKNOWN',
      error: syncRes.error || 'Failed to sync RevenueCat entitlement',
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
    window.onRevenueCatPurchase = async () => {
      console.log('[Native] Purchase completed — syncing entitlements');
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) return;

        await syncRevenueCatEntitlementsForUser(userId);
        toast.success('Subscription Updated', {
          description: 'Your purchase was successful! Features are unlocking...',
        });
      } catch (err) {
        console.warn('[RevenueCat] onRevenueCatPurchase sync failed:', err);
      }
    };
  }
}

/**
 * Runtime: hit RevenueCat's offerings and confirm every REQUIRED_IOS_PRODUCT_ID
 * is attached to at least one offering. Run this after `configureRevenueCat`
 * on iOS to detect App Store Connect / RevenueCat dashboard misconfiguration
 * before users tap Buy. Non-fatal — returns the diff and logs to console.
 */
export async function assertIosOfferingsContainRequiredProducts(
  isDemoMode: boolean = false,
): Promise<{ ok: boolean; missing: string[]; available: string[] }> {
  if (isDemoMode || getPlatform() !== 'ios') {
    return { ok: true, missing: [], available: [] };
  }
  const offeringsRes = await getOfferings(isDemoMode);
  if (!offeringsRes.success || !offeringsRes.data) {
    return { ok: false, missing: [...REQUIRED_IOS_PRODUCT_IDS], available: [] };
  }
  const offerings = offeringsRes.data;
  const all = [...Object.values(offerings.all || {}), offerings.current].filter(Boolean) as Array<{
    availablePackages?: Array<{ identifier?: string; product?: { identifier?: string } }>;
  }>;

  const available = new Set<string>();
  for (const off of all) {
    for (const pkg of off.availablePackages || []) {
      const id = pkg.product?.identifier;
      if (id) available.add(id);
    }
  }
  const missing = REQUIRED_IOS_PRODUCT_IDS.filter(id => !available.has(id));
  if (missing.length) {
    console.warn('[RevenueCat] Missing iOS products in offerings:', missing);
  }
  return { ok: missing.length === 0, missing, available: [...available] };
}

/**
 * Single entrypoint for the "Restore Purchases" button. Configures
 * RevenueCat for the user (if not already), calls native `restorePurchases`,
 * then pushes the resulting entitlements to the backend via
 * `sync-revenuecat-entitlement` so the rest of the app sees the new tier.
 *
 * Returns derived plan + customerInfo so the caller can update the UI
 * immediately without waiting for the next sync poll.
 */
export async function restoreAndSyncEntitlements(
  userId: string,
  isDemoMode: boolean = false,
): Promise<RevenueCatResult<{ customerInfo: RevenueCatCustomerInfo; plan: DerivedPlan }>> {
  if (isDemoMode) {
    return { success: false, supported: false, error: 'Demo mode active' };
  }
  if (!isRevenueCatAvailable()) {
    return { success: false, supported: false, errorCode: 'NOT_SUPPORTED' };
  }

  const configured = await configureRevenueCat(userId, isDemoMode);
  if (!configured.success || !configured.supported) {
    return {
      success: configured.success,
      supported: configured.supported,
      errorCode: configured.errorCode,
      error: configured.error,
    };
  }

  const restoreRes = await restorePurchases(isDemoMode);
  if (!restoreRes.success || !restoreRes.data) {
    return {
      success: false,
      supported: restoreRes.supported,
      errorCode: restoreRes.errorCode,
      error: restoreRes.error,
    };
  }

  const customerInfo = restoreRes.data;
  const plan = derivePlanFromCustomerInfo(customerInfo);

  const syncRes = await syncCustomerInfoToBackend(customerInfo, { syncAll: true });
  if (!syncRes.ok) {
    console.warn('[RevenueCat] Restore sync failed:', syncRes.error);
  }

  // Sanity-check entitlement → feature mapping for diagnosability after
  // restore / app relaunch. Warnings here mean RevenueCat is returning an
  // entitlement ID we don't know about (dashboard drift).
  verifyEntitlementMapping(customerInfo);

  return { success: true, supported: true, data: { customerInfo, plan } };
}

/**
 * Diagnostic: confirms every active RevenueCat entitlement maps to a known
 * Chravel tier in ENTITLEMENT_TO_TIER. Logs (but does not throw) on drift so
 * we catch dashboard/code divergence after purchase, restore, and app relaunch.
 */
export function verifyEntitlementMapping(customerInfo: RevenueCatCustomerInfo): {
  ok: boolean;
  unmapped: string[];
  mapped: string[];
} {
  const active = customerInfo.entitlements?.active || {};
  const unmapped: string[] = [];
  const mapped: string[] = [];
  for (const id of Object.keys(active)) {
    if (ENTITLEMENT_TO_TIER[id]) mapped.push(id);
    else unmapped.push(id);
  }
  if (unmapped.length) {
    console.warn(
      '[RevenueCat] Active entitlements with no Chravel tier mapping (check ENTITLEMENT_TO_TIER):',
      unmapped,
    );
  }
  return { ok: unmapped.length === 0, unmapped, mapped };
}

/**
 * Shared toast handler for purchase / restore results. Maps error codes to
 * user-readable copy and attaches a Retry action when retry is meaningful
 * (network / unknown errors). Silent on user cancellation per Apple HIG.
 */
export function handlePurchaseResult(
  result: RevenueCatPurchaseResult | RevenueCatResult,
  options: {
    successMessage?: string;
    successDescription?: string;
    onRetry?: () => void;
    context?: string;
  } = {},
): void {
  const { successMessage = 'Purchase successful', successDescription, onRetry, context } = options;

  if (result.success) {
    toast.success(
      successMessage,
      successDescription ? { description: successDescription } : undefined,
    );
    return;
  }

  switch (result.errorCode) {
    case 'CANCELLED':
      // Apple HIG: do not nag the user after they dismiss the sheet.
      return;
    case 'NOT_SUPPORTED':
      toast.error('In-app purchases are not available on this device.');
      return;
    case 'NOT_CONFIGURED':
      toast.error('Purchases are temporarily unavailable. Please try again later.');
      return;
    case 'NETWORK_ERROR':
      toast.error('Network error. Check your connection and try again.', {
        action: onRetry ? { label: 'Retry', onClick: onRetry } : undefined,
      });
      return;
    case 'UNKNOWN':
    default:
      toast.error(result.error || `Purchase failed${context ? ` (${context})` : ''}.`, {
        action: onRetry ? { label: 'Retry', onClick: onRetry } : undefined,
      });
  }
}
