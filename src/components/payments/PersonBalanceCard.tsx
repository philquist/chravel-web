import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ChevronDown, ChevronUp, ExternalLink, Clock, Copy } from 'lucide-react';
import { PersonalBalance } from '../../services/paymentBalanceService';
import { SettlePaymentDialog } from './SettlePaymentDialog';
import { ConfirmPaymentDialog } from './ConfirmPaymentDialog';
import { buildPaymentDeeplink, getPaymentMethodDisplayName } from '../../utils/paymentDeeplinks';
import { formatCurrency } from '../../services/currencyService';
import type { PaymentMethod as ReceiptPaymentMethod } from '../../types/receipts';
import { useOpenPaymentApp } from '../../hooks/useOpenPaymentApp';
import { useToast } from '../../hooks/use-toast';

interface PersonBalanceCardProps {
  balance: PersonalBalance;
  tripId: string;
}

const SUPPORTED_DEEPLINK_TYPES: ReceiptPaymentMethod[] = [
  'venmo',
  'cashapp',
  'zelle',
  'paypal',
  'applecash',
];

export const PersonBalanceCard = ({ balance, tripId }: PersonBalanceCardProps) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const openPaymentApp = useOpenPaymentApp();
  const { toast } = useToast();

  const isPendingConfirmation = balance.confirmationStatus === 'pending';
  const currency = balance.amountOwedCurrency || 'USD';

  const formatAmount = (amt: number) => formatCurrency(Math.abs(amt), currency);

  const youOweThem = balance.amountOwed < 0;
  const amount = Math.abs(balance.amountOwed);

  const getPaymentMethodDisplay = () => {
    if (!balance.preferredPaymentMethod) return 'No payment method set';
    const method = balance.preferredPaymentMethod;
    const displayName = getPaymentMethodDisplayName(method.type as ReceiptPaymentMethod);
    return `${displayName}: ${method.identifier}`;
  };

  const paymentTargets = (balance.availablePaymentMethods || [])
    .filter(method => SUPPORTED_DEEPLINK_TYPES.includes(method.type as ReceiptPaymentMethod))
    .map(method => ({
      source: method,
      target: buildPaymentDeeplink({
        method: method.type as ReceiptPaymentMethod,
        amount,
        handle: method.identifier,
      }),
    }))
    .filter(
      (
        entry,
      ): entry is {
        source: NonNullable<typeof balance.availablePaymentMethods>[number];
        target: NonNullable<ReturnType<typeof buildPaymentDeeplink>>;
      } => Boolean(entry.target),
    );

  const copyPaymentHandle = async (label: string, identifier: string) => {
    await navigator.clipboard.writeText(identifier);
    toast({ title: `${label} copied`, description: identifier });
  };

  return (
    <>
      <Card className={`${youOweThem ? 'border-orange-600/30' : 'border-green-600/30'} rounded-lg`}>
        <CardContent className="py-3 px-4">
          {/* Single row layout with all info inline */}
          <div className="flex items-center justify-between gap-3">
            {/* Left: User Info */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar className="w-10 h-10 flex-shrink-0">
                <AvatarImage src={balance.avatar} alt={balance.userName} />
                <AvatarFallback>{balance.userName.charAt(0)}</AvatarFallback>
              </Avatar>

              <div className="min-w-0">
                <h4 className="font-semibold text-foreground truncate">{balance.userName}</h4>
                <p className="text-xs text-muted-foreground truncate">
                  {getPaymentMethodDisplay()}
                </p>
              </div>
            </div>

            {/* Middle: Action Button */}
            {isPendingConfirmation && !youOweThem ? (
              <Button
                size="sm"
                className="text-xs px-3 py-2 min-h-[44px] flex-shrink-0 bg-orange-600 hover:bg-orange-700"
                onClick={() => setShowConfirmDialog(true)}
                aria-label={`Confirm payment from ${balance.userName}`}
              >
                <Clock className="w-3 h-3 mr-1" />
                Confirm Payment
              </Button>
            ) : youOweThem ? (
              <div className="flex flex-wrap justify-end gap-2 flex-shrink min-w-[9rem] max-w-[18rem]">
                {paymentTargets.map(({ source, target }) => {
                  const label = getPaymentMethodDisplayName(target.method);
                  const isPreferred = source.isPreferred || source.is_preferred;
                  if (!target.canOpenDirectly) {
                    return (
                      <Button
                        key={source.id}
                        size="sm"
                        variant={isPreferred ? 'default' : 'outline'}
                        className="text-xs px-3 py-2 min-h-[44px]"
                        onClick={() => copyPaymentHandle(label, target.displayHandle)}
                        aria-label={`Copy ${balance.userName}'s ${label} identifier ${target.displayHandle}`}
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy {label}
                      </Button>
                    );
                  }

                  return (
                    <Button
                      key={source.id}
                      size="sm"
                      variant={isPreferred ? 'default' : 'outline'}
                      className="text-xs px-3 py-2 min-h-[44px]"
                      onClick={() => openPaymentApp(target)}
                      aria-label={`Pay ${balance.userName} ${formatAmount(amount)} via ${label}`}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      {label}
                    </Button>
                  );
                })}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs px-3 py-2 min-h-[44px]"
                  onClick={() => setShowSettleDialog(true)}
                  aria-label={`Mark payment to ${balance.userName} as paid`}
                >
                  Mark as Paid
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="text-xs px-3 py-2 min-h-[44px] flex-shrink-0"
                onClick={() => setShowSettleDialog(true)}
                aria-label={`Mark payment from ${balance.userName} as paid`}
              >
                Mark as Paid
              </Button>
            )}

            {/* Right: Amount */}
            <div className="text-right flex-shrink-0">
              <p
                className={`text-sm font-semibold ${youOweThem ? 'text-orange-600' : 'text-green-600'}`}
              >
                {youOweThem ? 'You owe' : 'Owes you'}
              </p>
              <p className="text-lg font-bold">{formatAmount(amount)}</p>
            </div>

            {/* Chevron toggle */}
            <Button
              size="sm"
              variant="ghost"
              className="flex-shrink-0 min-h-[44px] min-w-[44px] p-2"
              onClick={() => setShowDetails(!showDetails)}
              aria-label={
                showDetails
                  ? `Hide payment details for ${balance.userName}`
                  : `Show payment details for ${balance.userName}`
              }
              aria-expanded={showDetails}
            >
              {showDetails ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Details Section */}
          {showDetails && (
            <div className="mt-3 pt-3 border-t border-border space-y-1.5">
              <h5 className="font-medium text-sm text-muted-foreground mb-2">
                Individual Payments
              </h5>
              {balance.unsettledPayments.length > 0 ? (
                balance.unsettledPayments.map((payment, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{payment.description}</span>
                    <span className={payment.amount < 0 ? 'text-orange-600' : 'text-green-600'}>
                      {formatAmount(Math.abs(payment.amount))}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No itemized breakdown available
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <SettlePaymentDialog
        open={showSettleDialog}
        onOpenChange={setShowSettleDialog}
        balance={balance}
        tripId={tripId}
      />

      <ConfirmPaymentDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        balance={balance}
        tripId={tripId}
      />
    </>
  );
};
