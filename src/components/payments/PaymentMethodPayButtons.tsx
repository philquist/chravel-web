/**
 * Clickable preferred-payment-method actions.
 * Opens Venmo / Cash App / PayPal (etc.) via deeplink when possible;
 * falls back to copy-handle for Zelle-style methods that can't deep-link.
 */

import React from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useOpenPaymentApp } from '@/hooks/useOpenPaymentApp';
import { buildPaymentDeeplink, getPaymentMethodDisplayName } from '@/utils/paymentDeeplinks';
import type { PaymentMethod as ReceiptPaymentMethod } from '@/types/receipts';

export interface PaymentMethodPayTarget {
  method: string;
  identifier: string;
  displayName?: string;
  isPreferred?: boolean;
}

const SUPPORTED_DEEPLINK_TYPES: ReceiptPaymentMethod[] = [
  'venmo',
  'cashapp',
  'zelle',
  'paypal',
  'applecash',
];

interface PaymentMethodPayButtonsProps {
  methods: PaymentMethodPayTarget[];
  /** Amount to pre-fill in the payment app when supported */
  amount: number;
  /** Optional note / description passed into the deeplink */
  note?: string;
  /** Who is being paid — used in aria labels */
  payeeName?: string;
  className?: string;
}

export function PaymentMethodPayButtons({
  methods,
  amount,
  note,
  payeeName,
  className,
}: PaymentMethodPayButtonsProps) {
  const openPaymentApp = useOpenPaymentApp();
  const { toast } = useToast();

  const targets = methods
    .filter(method =>
      SUPPORTED_DEEPLINK_TYPES.includes(method.method.toLowerCase() as ReceiptPaymentMethod),
    )
    .map(method => {
      const normalized = method.method.toLowerCase() as ReceiptPaymentMethod;
      const target = buildPaymentDeeplink({
        method: normalized,
        amount,
        handle: method.identifier,
        note,
      });
      return {
        source: method,
        target,
        label: method.displayName || getPaymentMethodDisplayName(normalized),
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        source: PaymentMethodPayTarget;
        target: NonNullable<ReturnType<typeof buildPaymentDeeplink>>;
        label: string;
      } => Boolean(entry.target),
    )
    // Preferred methods first so the primary CTA is obvious on mobile
    .sort((a, b) => Number(Boolean(b.source.isPreferred)) - Number(Boolean(a.source.isPreferred)));

  if (targets.length === 0) return null;

  const copyHandle = async (label: string, identifier: string) => {
    try {
      await navigator.clipboard.writeText(identifier);
      toast({ title: `${label} copied`, description: identifier });
    } catch {
      toast({
        title: 'Could not copy',
        description: identifier,
        variant: 'destructive',
      });
    }
  };

  const payee = payeeName || 'them';

  return (
    <div className={className ?? 'flex flex-wrap gap-2'}>
      {targets.map(({ source, target, label }) => {
        const isPreferred = Boolean(source.isPreferred);
        if (!target.canOpenDirectly) {
          return (
            <Button
              key={`${source.method}-${source.identifier}`}
              type="button"
              size="sm"
              variant={isPreferred ? 'default' : 'outline'}
              className="text-xs px-3 py-2 min-h-[44px]"
              onClick={() => void copyHandle(label, target.displayHandle)}
              aria-label={`Copy ${payee}'s ${label} identifier ${target.displayHandle}`}
            >
              <Copy className="w-3 h-3 mr-1" />
              Copy {label}
            </Button>
          );
        }

        return (
          <Button
            key={`${source.method}-${source.identifier}`}
            type="button"
            size="sm"
            variant={isPreferred ? 'default' : 'outline'}
            className="text-xs px-3 py-2 min-h-[44px]"
            onClick={() => void openPaymentApp(target)}
            aria-label={`Pay ${payee} via ${label}`}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            {label}
            {source.identifier ? (
              <span className="ml-1 opacity-70 font-normal truncate max-w-[7rem]">
                {target.displayHandle}
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
