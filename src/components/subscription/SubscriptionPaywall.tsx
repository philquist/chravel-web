import React from 'react';
import { AlertCircle, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { isNativePlatform } from '@/integrations/revenuecat/revenuecatClient';

interface CustomerInfoShape {
  entitlements: {
    active: Record<string, unknown>;
  };
}

interface SubscriptionPaywallProps {
  onPurchaseComplete?: (customerInfo: CustomerInfoShape) => void;
  onClose?: () => void;
  offeringId?: string;
  entitlementId?: string;
  customerEmail?: string;
}

export function SubscriptionStatusBadge({
  status,
}: {
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'none';
}) {
  const config: Record<string, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-green-500/20 text-green-500' },
    trialing: { label: 'Trial', className: 'bg-blue-500/20 text-blue-500' },
    past_due: { label: 'Past Due', className: 'bg-yellow-500/20 text-yellow-500' },
    canceled: { label: 'Canceled', className: 'bg-orange-500/20 text-orange-500' },
    expired: { label: 'Expired', className: 'bg-red-500/20 text-red-500' },
    none: { label: 'Free', className: 'bg-muted text-muted-foreground' },
  };

  const { label, className } = config[status] || config.none;
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        className,
      )}
    >
      {label}
    </span>
  );
}

/**
 * Adapter-only placeholder for legacy web paywall entrypoints.
 * Real native IAP UI lives in chravel-mobile.
 */
export const SubscriptionPaywall: React.FC<SubscriptionPaywallProps> = ({ onClose }) => {
  if (isNativePlatform()) {
    return null;
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold">In-app purchases are mobile-only</h2>
            <p className="text-sm text-muted-foreground">
              This web shell keeps a compatibility placeholder. Purchase and restore flows are owned
              by the native mobile app.
            </p>
          </div>
        </div>
        {onClose ? (
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close paywall">
            <X className="w-4 h-4" />
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border p-3 text-sm text-muted-foreground flex items-center gap-2">
        <Smartphone className="w-4 h-4" aria-hidden="true" />
        Open ChravelApp mobile app to manage subscriptions.
      </div>
    </Card>
  );
};

export default SubscriptionPaywall;
