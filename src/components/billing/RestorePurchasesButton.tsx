import React, { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  restoreAndSyncEntitlements,
  handlePurchaseResult,
} from '@/integrations/revenuecat/revenuecatClient';

interface RestorePurchasesButtonProps {
  /**
   * Called after a successful restore so the surrounding screen can
   * re-read entitlements from the server (e.g. `checkSubscription()`).
   */
  onRestored?: () => void | Promise<void>;
  className?: string;
  variant?: 'inline' | 'block';
}

/**
 * Apple App Store compliance: every iOS app that sells subscriptions or
 * non-consumable IAPs must expose a "Restore Purchases" affordance.
 * This component is the single shared implementation across surfaces
 * (NativeSettings, ConsumerBillingSection, Pricing modals).
 */
export const RestorePurchasesButton: React.FC<RestorePurchasesButtonProps> = ({
  onRestored,
  className = '',
  variant = 'inline',
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleRestore = useCallback(async () => {
    if (!user?.id) {
      toast.error('Please sign in before restoring purchases.');
      return;
    }
    setLoading(true);
    try {
      const result = await restoreAndSyncEntitlements(user.id);
      if (result.success && result.data) {
        const tier = result.data.plan.tier;
        toast.success('Purchases restored', {
          description:
            tier === 'free'
              ? 'No active purchases were found on this Apple ID.'
              : `Your ${tier.replace('-', ' ')} entitlement is now active.`,
        });
        await onRestored?.();
      } else {
        handlePurchaseResult(
          { ...result, success: false },
          { onRetry: handleRestore, context: 'restore' },
        );
      }
    } finally {
      setLoading(false);
    }
  }, [onRestored, user?.id]);

  const baseClasses =
    variant === 'block'
      ? 'w-full min-h-[42px] flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white px-4 py-2 font-medium transition-colors disabled:opacity-50'
      : 'inline-flex items-center gap-2 text-sm text-gold-primary hover:text-gold-mid underline-offset-2 hover:underline disabled:opacity-50';

  return (
    <button
      type="button"
      onClick={handleRestore}
      disabled={loading}
      className={`${baseClasses} ${className}`.trim()}
      aria-label="Restore previous purchases"
    >
      <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
      {loading ? 'Restoring…' : 'Restore Purchases'}
    </button>
  );
};
