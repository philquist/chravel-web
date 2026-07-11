import React from 'react';
import { AlertCircle, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRestorePurchases } from '@/hooks/useRestorePurchases';
import type { RevenueCatCustomerInfo, DerivedPlan } from '@/integrations/revenuecat/types';

interface RestorePurchasesButtonProps {
  /**
   * Called after a successful restore so the surrounding screen can
   * re-read entitlements from the server (e.g. `checkSubscription()`).
   */
  onRestored?: (payload: {
    customerInfo: RevenueCatCustomerInfo;
    plan: DerivedPlan;
  }) => void | Promise<void>;
  className?: string;
  variant?: 'inline' | 'block';
  /** Show a persistent inline status card under the button. Default true. */
  showStatus?: boolean;
}

/**
 * Apple App Store compliance: every iOS app that sells subscriptions or
 * non-consumable IAPs must expose a "Restore Purchases" affordance.
 *
 * State machine + retry-with-backoff live in `useRestorePurchases`; this
 * component owns the button, spinner, and inline success/error/no-purchases
 * status card that surfaces subscription vs trip-pass restorations separately.
 */
export const RestorePurchasesButton: React.FC<RestorePurchasesButtonProps> = ({
  onRestored,
  className = '',
  variant = 'inline',
  showStatus = true,
}) => {
  const { user } = useAuth();
  const { state, restore } = useRestorePurchases({ userId: user?.id, onRestored });

  const isRestoring = state.status === 'restoring';

  const baseClasses =
    variant === 'block'
      ? 'w-full min-h-[42px] flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white px-4 py-2 font-medium transition-colors disabled:opacity-50'
      : 'inline-flex items-center gap-2 text-sm text-gold-primary hover:text-gold-mid underline-offset-2 hover:underline disabled:opacity-50';

  return (
    <div className={variant === 'block' ? 'w-full space-y-2' : 'space-y-2'}>
      <button
        type="button"
        onClick={restore}
        disabled={isRestoring}
        className={`${baseClasses} ${className}`.trim()}
        aria-label="Restore previous purchases"
        aria-busy={isRestoring}
      >
        <RefreshCw size={16} className={isRestoring ? 'animate-spin' : undefined} />
        {isRestoring
          ? state.attempt > 1
            ? `Retrying… (attempt ${state.attempt})`
            : 'Restoring…'
          : 'Restore Purchases'}
      </button>

      {showStatus && state.status !== 'idle' && state.status !== 'restoring' ? (
        <RestoreStatusCard state={state} onRetry={restore} />
      ) : null}
    </div>
  );
};

const RestoreStatusCard: React.FC<{
  state: Extract<ReturnType<typeof useRestorePurchases>['state'], { status: 'success' | 'error' }>;
  onRetry: () => void;
}> = ({ state, onRetry }) => {
  if (state.status === 'error') {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-100 px-3 py-2 text-sm flex items-start gap-2"
      >
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="font-medium">Restore failed</div>
          <div className="text-red-200/90">{state.message}</div>
          {state.attempts > 1 ? (
            <div className="text-xs text-red-200/70 mt-1">
              Tried {state.attempts} time{state.attempts === 1 ? '' : 's'}.
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-semibold underline underline-offset-2 hover:text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!state.hasAnyPurchase) {
    return (
      <div
        role="status"
        className="rounded-lg border border-white/10 bg-white/5 text-white/80 px-3 py-2 text-sm flex items-start gap-2"
      >
        <Info size={16} className="mt-0.5 shrink-0 text-white/60" />
        <div>
          <div className="font-medium text-white">No purchases found</div>
          <div className="text-white/60">
            This Apple ID has no active Chravel subscriptions or Trip Passes to restore.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 px-3 py-2 text-sm space-y-1"
    >
      <div className="flex items-start gap-2">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
        <div className="font-medium">Purchases restored</div>
      </div>
      {state.subscriptionProductIds.length > 0 ? (
        <div className="pl-6 text-emerald-100/90">
          <span className="font-medium">Subscription:</span> {state.plan.tier.replace('-', ' ')}
          {state.subscriptionProductIds.map(id => (
            <div key={id} className="text-xs text-emerald-100/70">
              {id}
            </div>
          ))}
        </div>
      ) : null}
      {state.tripPassProductIds.length > 0 ? (
        <div className="pl-6 text-emerald-100/90">
          <span className="font-medium">
            Trip Pass{state.tripPassProductIds.length === 1 ? '' : 'es'}:
          </span>
          {state.tripPassProductIds.map(id => (
            <div key={id} className="text-xs text-emerald-100/70">
              {id}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
