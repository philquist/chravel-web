/**
 * Unified Entitlements Hook
 *
 * Single hook for checking feature access across all billing sources.
 * Works with demo mode, RevenueCat (iOS/Android), Stripe (web), and super admin override.
 */

import { useCallback, useEffect } from 'react';
import { useEntitlementsStore } from '@/store/entitlementsStore';
import { useDemoMode } from './useDemoMode';
import { useAuth } from './useAuth';
import { getEntitlementsForTier, FEATURE_LIMITS } from '@/billing/entitlements';
import {
  syncRevenueCatEntitlementsForUser,
  logoutRevenueCat,
  isNativePlatform,
} from '@/integrations/revenuecat/revenuecatClient';
import { REVENUECAT_CONFIG } from '@/constants/revenuecat';
import { isSuperAdminEmail } from '@/utils/isSuperAdmin';
import type { FeatureName, FeatureContext, SubscriptionTier, EntitlementId } from '@/billing/types';
import type { EntitlementStatus } from '@/store/entitlementsStore';

// FEATURE_LIMITS imported from '@/billing/entitlements' — single source of truth

export interface UseUnifiedEntitlementsReturn {
  plan: SubscriptionTier;
  status: EntitlementStatus;
  source: 'revenuecat' | 'stripe' | 'admin' | 'demo' | 'none';
  isLoading: boolean;
  isSubscribed: boolean;
  isPaid: boolean;
  isExplorer: boolean;
  isFrequentChraveler: boolean;
  isOrgPro: boolean;
  /** @deprecated Use isPaid or isOrgPro depending on intent. */
  isPro: boolean;
  isSuperAdmin: boolean;
  canUse: (feature: FeatureName, context?: FeatureContext) => boolean;
  getLimit: (feature: FeatureName) => number;
  hasEntitlement: (entitlement: EntitlementId) => boolean;
  refreshEntitlements: () => Promise<void>;
}

export function useUnifiedEntitlements(): UseUnifiedEntitlementsReturn {
  const { isDemoMode } = useDemoMode();
  const { user } = useAuth();
  const store = useEntitlementsStore();

  // Check super admin by email (founder failsafe)
  const isSuperAdminByEmail = isSuperAdminEmail(user?.email);

  useEffect(() => {
    const init = async () => {
      // Super admin by email takes highest priority
      if (isSuperAdminByEmail) {
        store.setSuperAdminMode();
        return;
      }

      if (isDemoMode) {
        store.setDemoMode(true);
        return;
      }
      if (!user?.id) {
        store.clear();
        await logoutRevenueCat();
        return;
      }

      if (isNativePlatform() && REVENUECAT_CONFIG.enabled) {
        await syncRevenueCatEntitlementsForUser(user.id, isDemoMode);
      }
      // Pass email for super admin check inside refreshEntitlements
      await store.refreshEntitlements(user.id, user.email);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store from Zustand is unstable; would cause infinite loop
  }, [isDemoMode, user?.id, user?.email, isSuperAdminByEmail]);

  const refreshEntitlements = useCallback(async () => {
    if (isSuperAdminByEmail) {
      store.setSuperAdminMode();
      return;
    }
    if (isDemoMode) {
      store.setDemoMode(true);
      return;
    }
    if (!user?.id) {
      store.clear();
      return;
    }
    await store.refreshEntitlements(user.id, user.email);
  }, [isDemoMode, user?.id, user?.email, isSuperAdminByEmail, store]);

  // Super admins and demo mode get unlimited access to everything
  const hasUnlimitedAccess = isSuperAdminByEmail || isDemoMode || store.isSuperAdmin;

  const canUse = useCallback(
    (feature: FeatureName, context?: FeatureContext): boolean => {
      if (hasUnlimitedAccess) return true;
      const _tierEnts = getEntitlementsForTier(store.plan);
      const limits = FEATURE_LIMITS[feature];
      if (!limits) return true;
      const limit = limits[store.plan] ?? limits.free ?? 0;
      if (limit === -1) return true;
      if (limit === 0) return false;
      if (context?.usageCount !== undefined) return context.usageCount < limit;
      return true;
    },
    [hasUnlimitedAccess, store.plan],
  );

  const getLimit = useCallback(
    (feature: FeatureName): number => {
      if (hasUnlimitedAccess) return -1;
      const limits = FEATURE_LIMITS[feature];
      if (!limits) return -1;
      return limits[store.plan] ?? limits.free ?? -1;
    },
    [hasUnlimitedAccess, store.plan],
  );

  const hasEntitlement = useCallback(
    (entitlement: EntitlementId): boolean => {
      if (hasUnlimitedAccess) return true;
      return store.entitlements.has(entitlement);
    },
    [hasUnlimitedAccess, store.entitlements],
  );

  return {
    plan: hasUnlimitedAccess ? 'pro-enterprise' : store.plan,
    status: hasUnlimitedAccess ? 'active' : store.status,
    source: isSuperAdminByEmail ? 'admin' : isDemoMode ? 'demo' : store.source,
    isLoading: store.isLoading,
    isSubscribed: hasUnlimitedAccess ? true : store.isSubscribed,
    isPaid: hasUnlimitedAccess ? true : store.isPaid,
    isExplorer: hasUnlimitedAccess ? false : store.isExplorer,
    isFrequentChraveler: hasUnlimitedAccess ? false : store.isFrequentChraveler,
    isOrgPro: hasUnlimitedAccess ? true : store.isOrgPro,
    isPro: hasUnlimitedAccess ? true : store.isOrgPro,
    isSuperAdmin: isSuperAdminByEmail || store.isSuperAdmin,
    canUse,
    getLimit,
    hasEntitlement,
    refreshEntitlements,
  };
}

export function useFeature(feature: FeatureName, context?: FeatureContext) {
  const { canUse, getLimit, isLoading } = useUnifiedEntitlements();
  return { canAccess: canUse(feature, context), limit: getLimit(feature), isLoading };
}

export function useProTier() {
  const { plan, isPro, isLoading, canUse } = useUnifiedEntitlements();
  return {
    isPro,
    plan,
    canCreateProTrip: canUse('pro_trip_creation'),
    canCreateEvent: canUse('event_creation'),
    isLoading,
  };
}
