import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { ConsumerSubscription } from '../types/consumer';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ENTITLEMENTS_UPDATED_EVENT } from '@/integrations/revenuecat/revenuecatClient';
import { openExternalUrl } from '@/platform/navigation';
import { detectNativeBillingPlatform, isNativeWebView } from '@/utils/platformDetection';
import { toast } from 'sonner';
import { SUPER_ADMIN_EMAILS } from '@/constants/admins';
import type { ConsumerSubscription as ConsumerSubscriptionShape } from '../types/consumer';

interface ConsumerSubscriptionContextType {
  subscription: ConsumerSubscription | null;
  tier:
    | 'free'
    | 'explorer'
    | 'frequent-chraveler'
    | 'pro-starter'
    | 'pro-growth'
    | 'pro-enterprise';
  isPlus: boolean; // Legacy - true for any paid tier
  isSubscribed: boolean;
  isLoading: boolean;
  checkSubscription: () => Promise<void>;
  upgradeToPlus: () => Promise<void>; // Legacy
  upgradeToTier: (
    tier: 'explorer' | 'frequent-chraveler',
    billingCycle: 'monthly' | 'annual',
  ) => Promise<void>;
  canCreateProTrip: boolean;
  proTripQuota: number;
  isSuperAdmin: boolean;
  proTier: string | null;
}

const ConsumerSubscriptionContext = createContext<ConsumerSubscriptionContextType | undefined>(
  undefined,
);

const SUBSCRIPTION_CACHE_STALE_MS = 5 * 60 * 1000;

type SubscriptionRefreshReason =
  | 'initial'
  | 'foreground'
  | 'paywall_open'
  | 'post_checkout_return'
  | 'manual';

export const ConsumerSubscriptionProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  // useAuth sets a session-derived user first and the enriched user moments
  // later — two object identities for the same login. Key effects/callbacks on
  // the stable id so the initial check-subscription edge call fires once.
  const userId = user?.id;
  const [subscription, setSubscription] = useState<ConsumerSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRevalidatedAt, setLastRevalidatedAt] = useState<number | null>(null);

  const mapSubscriptionStatus = (
    rawStatus: string | null | undefined,
    subscribed: boolean,
  ): ConsumerSubscriptionShape['status'] => {
    if (!subscribed) return 'expired';
    if (rawStatus === 'trialing') return 'trial';
    if (rawStatus === 'canceled') return 'cancelled';
    return 'active';
  };

  const checkSubscription = useCallback(
    async (reason: SubscriptionRefreshReason = 'manual') => {
      if (!userId) return;

      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('check-subscription', {
          body: { reason },
        });
        setLastRevalidatedAt(Date.now());

        if (error) throw error;

        const { subscribed, status, tier, subscription_end } = data;

        // Map tier from backend or detect from product_id
        let userTier:
          | 'free'
          | 'explorer'
          | 'frequent-chraveler'
          | 'pro-starter'
          | 'pro-growth'
          | 'pro-enterprise' = 'free';
        if (tier) {
          userTier = tier as
            | 'free'
            | 'explorer'
            | 'frequent-chraveler'
            | 'pro-starter'
            | 'pro-growth'
            | 'pro-enterprise';
        }

        setSubscription({
          tier: userTier,
          status: mapSubscriptionStatus(status, subscribed),
          subscriptionEndsAt: subscription_end,
          stripeCustomerId: data.stripe_customer_id,
        });
      } catch (error) {
        console.error('Error checking subscription:', error);
        setSubscription({ tier: 'free', status: 'expired' });
      } finally {
        setIsLoading(false);
      }
    },
    [userId],
  );

  const checkSubscriptionWithStaleGuard = useCallback(
    async (reason: SubscriptionRefreshReason, force = false) => {
      if (
        !force &&
        lastRevalidatedAt &&
        Date.now() - lastRevalidatedAt < SUBSCRIPTION_CACHE_STALE_MS
      ) {
        return;
      }
      await checkSubscription(reason);
    },
    [checkSubscription, lastRevalidatedAt],
  );

  useEffect(() => {
    if (userId) {
      checkSubscription('initial');
    }
  }, [userId, checkSubscription]);

  useEffect(() => {
    if (!user) return;

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkSubscriptionWithStaleGuard('foreground');
      }
    };

    window.addEventListener('visibilitychange', onVisibility);
    return () => window.removeEventListener('visibilitychange', onVisibility);
  }, [user, checkSubscriptionWithStaleGuard]);

  useEffect(() => {
    if (!user) return;

    const onEntitlementsUpdated = () => {
      void checkSubscriptionWithStaleGuard('manual', true);
    };

    window.addEventListener(ENTITLEMENTS_UPDATED_EVENT, onEntitlementsUpdated);
    return () => window.removeEventListener(ENTITLEMENTS_UPDATED_EVENT, onEntitlementsUpdated);
  }, [user, checkSubscriptionWithStaleGuard]);

  useEffect(() => {
    if (!user) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      void checkSubscriptionWithStaleGuard('post_checkout_return', true);
    }
  }, [user, checkSubscriptionWithStaleGuard]);

  const upgradeToPlus = async () => {
    // Legacy function - defaults to Explorer tier with monthly billing
    await upgradeToTier('explorer', 'monthly');
  };

  const upgradeToTier = async (
    tier: 'explorer' | 'frequent-chraveler',
    billingCycle: 'monthly' | 'annual',
  ) => {
    if (!user) {
      toast.error('Please sign in to upgrade');
      return;
    }

    setIsLoading(true);
    try {
      const billingPlatform =
        typeof navigator === 'undefined'
          ? 'web'
          : detectNativeBillingPlatform(navigator.userAgent || '', isNativeWebView());
      const tierMap = {
        explorer: 'consumer-explorer',
        'frequent-chraveler': 'consumer-frequent-chraveler',
      };

      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          tier: tierMap[tier],
          billing_cycle: billingCycle,
          platform: billingPlatform,
        },
      });

      if (error) throw error;

      if (data.url) {
        openExternalUrl(data.url);
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      toast.error('Failed to start checkout');
    } finally {
      setIsLoading(false);
    }
  };

  // Check if user is super admin - bypass all limits
  const isSuperAdmin = user?.email && SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase());

  const currentTier = isSuperAdmin ? 'frequent-chraveler' : subscription?.tier || 'free';
  // Mirror the canonical hasEffectiveAccess policy on the mapped consumer-subscription
  // vocabulary: active and trial keep access, and a cancelled subscription keeps access
  // until its paid period actually ends (past_due already maps to 'active' upstream).
  // Previously this required status === 'active', so trialing and canceled-in-period
  // subscribers were shown as non-premium even though the server still grants them access.
  const hasActivePaidStatus =
    subscription?.status === 'active' ||
    subscription?.status === 'trial' ||
    (subscription?.status === 'cancelled' &&
      !!subscription?.subscriptionEndsAt &&
      new Date(subscription.subscriptionEndsAt) > new Date());
  const isPlus = isSuperAdmin || (hasActivePaidStatus && currentTier !== 'free');
  const isSubscribed = isPlus;
  const canCreateProTrip = isSuperAdmin || currentTier === 'frequent-chraveler';
  const proTripQuota = isSuperAdmin ? -1 : currentTier === 'frequent-chraveler' ? 1 : 0; // -1 = unlimited for super admins

  return (
    <ConsumerSubscriptionContext.Provider
      value={{
        subscription,
        tier: currentTier,
        isPlus,
        isSubscribed,
        isLoading,
        checkSubscription: () => checkSubscriptionWithStaleGuard('manual', true),
        upgradeToPlus,
        upgradeToTier,
        canCreateProTrip,
        proTripQuota,
        isSuperAdmin,
        proTier: isSuperAdmin ? 'pro-enterprise' : null,
      }}
    >
      {children}
    </ConsumerSubscriptionContext.Provider>
  );
};

export const useConsumerSubscription = () => {
  const context = useContext(ConsumerSubscriptionContext);
  if (context === undefined) {
    throw new Error('useConsumerSubscription must be used within a ConsumerSubscriptionProvider');
  }
  return context;
};
