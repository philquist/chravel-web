import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { tripKeys } from '@/lib/queryKeys';
import { PersonalBalance } from '../../services/paymentBalanceService';
import { supabase } from '../../integrations/supabase/client';
import { settleSplitsForDebtor } from '../../services/paymentSettlementService';
import { toast } from '../ui/use-toast';
import { CheckCircle2 } from 'lucide-react';
import { hapticService as haptics } from '@/services/hapticService';
import { formatCurrency } from '../../services/currencyService';

interface ConfirmPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balance: PersonalBalance;
  tripId: string;
}

export const ConfirmPaymentDialog = ({
  open,
  onOpenChange,
  balance,
  tripId,
}: ConfirmPaymentDialogProps) => {
  const queryClient = useQueryClient();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currency = balance.amountOwedCurrency || 'USD';

  const handleConfirm = async () => {
    setIsConfirming(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Crediting transition for this payer/payee pair — must go through the
      // atomic settlement RPC (row lock + status guard prevents double-credit),
      // scoped to THESE payment messages rather than every pending split the
      // debtor has anywhere in the app.
      const paymentIds = balance.unsettledPayments.map(p => p.paymentId);
      const result = await settleSplitsForDebtor(
        paymentIds,
        balance.userId,
        balance.preferredPaymentMethod?.type || null,
      );
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to confirm payment');
      }

      toast({
        title: 'Payment Confirmed',
        description: `You've confirmed receiving ${formatCurrency(Math.abs(balance.amountOwed), currency)} from ${balance.userName}`,
      });

      // Payment marked paid: success haptic (native-only, hard-gated).
      void haptics.success();

      onOpenChange(false);

      // Invalidate payment queries to refresh balances without full page reload
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tripKeys.payments(tripId) }),
        queryClient.invalidateQueries({
          queryKey: tripKeys.paymentBalances(tripId, user.id),
        }),
      ]);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error confirming payment:', error);
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to confirm payment';
      setError(errorMessage);
      toast({
        title: 'Confirmation Failed',
        description: errorMessage + '. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleLeavePending = () => {
    onOpenChange(false);
    toast({
      title: 'Payment Still Pending',
      description: 'The payment confirmation request will remain open.',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            Confirm Payment Received
          </DialogTitle>
          <DialogDescription>
            {balance.userName} marked their payment as complete. Please confirm you've received the
            money.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Amount:</span>
              <span className="font-semibold">
                {formatCurrency(Math.abs(balance.amountOwed), currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">From:</span>
              <span className="font-medium">{balance.userName}</span>
            </div>
            {balance.preferredPaymentMethod && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Via:</span>
                <span className="font-medium capitalize">
                  {balance.preferredPaymentMethod.type}
                </span>
              </div>
            )}
          </div>

          <div className="mt-4 text-sm text-muted-foreground">
            By confirming, you're acknowledging that you've received this payment and the
            transaction will be marked as complete.
          </div>

          {error && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-destructive font-medium">Error: {error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleConfirm}
                disabled={isConfirming}
                className="mt-2 w-full"
              >
                Retry Confirmation
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleLeavePending}
            disabled={isConfirming}
          >
            Leave Pending
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isConfirming} className="flex-1">
            {isConfirming ? (
              <>
                <div className="w-4 h-4 mr-2 animate-spin gold-gradient-spinner" />
                Confirming...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Confirm Received
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
