import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { supabase } from '../../integrations/supabase/client';
import { paymentService } from '../../services/paymentService';
import { demoModeService } from '../../services/demoModeService';
import { useDemoMode } from '../../hooks/useDemoMode';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/use-toast';
import { Clock, Users, Pencil, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { EditPaymentDialog } from './EditPaymentDialog';
import { PaymentMessage } from '../../types/payments';
import { hapticService as haptics } from '@/services/hapticService';
import { isDemoTrip } from '@/utils/demoUtils';
import { formatCurrency } from '@/services/currencyService';
import { formatShortDate } from '@/utils/dateFormatters';
import { PAYMENT_METHOD_DISPLAY_NAMES } from '@/types/paymentMethods';
import { usePaymentAttachments } from '@/hooks/usePaymentAttachments';
import { PaymentAttachmentsViewer } from '@/features/payments/components/PaymentAttachmentsViewer';
import { PaymentAttachmentAddControl } from '@/features/payments/components/PaymentAttachmentAddControl';
import { PaymentMethodPayButtons } from './PaymentMethodPayButtons';
import { notifyPaymentSettledInChat, resolvePaymentActorName } from '@/lib/paymentActivityMessages';
import { useFeatureFlag } from '@/lib/featureFlags';

interface PaymentSplit {
  id: string;
  debtor_user_id: string;
  amount_owed: number;
  is_settled: boolean;
  settled_at: string | null;
  debtor_name?: string;
  debtor_avatar?: string;
}

interface PaymentMethodDetail {
  method: string;
  displayName: string;
  identifier: string;
  isPreferred?: boolean;
}

interface EnrichedPayment {
  id: string;
  description: string;
  amount: number;
  currency: string;
  splitCount: number;
  createdBy: string;
  createdAt: string;
  isSettled: boolean;
  splits: PaymentSplit[];
  settledCount: number;
  paymentMethods: string[];
  creatorPaymentDetails: PaymentMethodDetail[];
  splitParticipants?: string[];
}

interface TripMember {
  id: string;
  name: string;
  avatar?: string;
}

interface OutstandingPaymentsProps {
  tripId: string;
  tripMembers?: TripMember[];
  onPaymentUpdated?: () => void;
  payments: PaymentMessage[]; // Centralized payment data from parent
  onUpdatePayment: (
    paymentId: string,
    updates: { amount?: number; description?: string },
  ) => Promise<boolean>;
  onDeletePayment: (paymentId: string) => Promise<boolean>;
}

export const OutstandingPayments = ({
  tripId,
  tripMembers = [],
  onPaymentUpdated,
  payments,
  onUpdatePayment,
  onDeletePayment,
}: OutstandingPaymentsProps) => {
  const [enrichedPayments, setEnrichedPayments] = useState<EnrichedPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPayment, setEditingPayment] = useState<EnrichedPayment | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { isDemoMode } = useDemoMode();
  const { user } = useAuth();
  const { toast } = useToast();

  const demoActive = isDemoMode && isDemoTrip(tripId);
  const attachmentsEnabled = useFeatureFlag('payment_attachments', true);

  // Filter to unsettled payments from the centralized source
  const unsettledPayments = useMemo(() => {
    return payments.filter(p => !p.isSettled);
  }, [payments]);

  // Optional attachments (proof/context) for the visible payments — read-only on the card.
  const attachmentPaymentIds = useMemo(() => unsettledPayments.map(p => p.id), [unsettledPayments]);
  const { getAttachments } = usePaymentAttachments(tripId, attachmentPaymentIds);

  // Enrich payments with splits and creator payment methods
  useEffect(() => {
    const enrichPayments = async () => {
      if (unsettledPayments.length === 0) {
        setEnrichedPayments([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const creatorIds = [...new Set(unsettledPayments.map(p => p.createdBy))];

        // Demo mode: create mock splits and payment methods
        if (demoActive) {
          const mockMembers = demoModeService.getMockMembers(tripId);

          const mockCreatorMethods: Record<string, PaymentMethodDetail[]> = {};
          creatorIds.forEach(creatorId => {
            mockCreatorMethods[creatorId] = [
              { method: 'venmo', displayName: 'Venmo', identifier: '@demo-user' },
              { method: 'paypal', displayName: 'PayPal', identifier: 'demo@email.com' },
              { method: 'zelle', displayName: 'Zelle', identifier: '555-123-4567' },
              { method: 'cashapp', displayName: 'Cash App', identifier: '$demouser' },
            ];
          });

          const paymentsWithSplits = unsettledPayments.map(payment => {
            const splits: PaymentSplit[] = payment.splitParticipants.map((participantId, idx) => {
              const member = mockMembers.find(m => m.user_id === participantId);
              return {
                id: `demo-split-${payment.id}-${idx}`,
                debtor_user_id: participantId,
                amount_owed: payment.amount / payment.splitCount,
                is_settled: false,
                settled_at: null,
                debtor_name: member?.display_name || `Participant ${idx + 1}`,
                debtor_avatar: member?.avatar_url,
              };
            });

            const allCreatorMethods = mockCreatorMethods[payment.createdBy] || [];
            const selectedMethods = payment.paymentMethods || [];
            const creatorPaymentDetails = allCreatorMethods.filter(m =>
              selectedMethods.includes(m.method),
            );

            return {
              ...payment,
              splits,
              settledCount: 0,
              creatorPaymentDetails,
            };
          });

          setEnrichedPayments(paymentsWithSplits);
          setLoading(false);
          return;
        }

        // Authenticated mode: fetch real splits and creator payment methods
        const paymentIds = unsettledPayments.map(p => p.id);

        const [splitsResult, creatorMethodsResult] = await Promise.all([
          supabase.from('payment_splits').select('*').in('payment_message_id', paymentIds),
          supabase
            .from('user_payment_methods')
            .select('user_id, method_type, identifier, display_name, is_preferred, is_visible')
            .in('user_id', creatorIds),
        ]);

        if (splitsResult.error) throw splitsResult.error;

        // Build creator methods map (prefer visible methods; still show preferred first)
        const creatorMethodsMap = new Map<string, PaymentMethodDetail[]>();
        (creatorMethodsResult.data || []).forEach(method => {
          if (method.is_visible === false) return;
          const existing = creatorMethodsMap.get(method.user_id) || [];
          existing.push({
            method: method.method_type?.toLowerCase() || 'other',
            displayName:
              method.display_name ||
              PAYMENT_METHOD_DISPLAY_NAMES[method.method_type?.toLowerCase() || 'other'] ||
              method.method_type ||
              'Other',
            identifier: method.identifier || '',
            isPreferred: Boolean(method.is_preferred),
          });
          creatorMethodsMap.set(method.user_id, existing);
        });

        // Get debtor profiles
        const debtorIds = [...new Set((splitsResult.data || []).map(s => s.debtor_user_id))];
        const { data: profiles } = await supabase
          .from('profiles_public')
          .select('user_id, display_name, resolved_display_name, avatar_url')
          .in('user_id', debtorIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

        // Map splits to payments
        const paymentsWithSplits = unsettledPayments.map(payment => {
          const paymentSplits = (splitsResult.data || [])
            .filter(s => s.payment_message_id === payment.id)
            .map(s => {
              const profile = profileMap.get(s.debtor_user_id);
              return {
                id: s.id,
                debtor_user_id: s.debtor_user_id,
                amount_owed: parseFloat(s.amount_owed.toString()),
                is_settled: s.is_settled,
                settled_at: s.settled_at,
                debtor_name: profile?.resolved_display_name || profile?.display_name || 'Unknown',
                debtor_avatar: profile?.avatar_url,
              };
            });

          const allCreatorMethods = creatorMethodsMap.get(payment.createdBy) || [];
          const selectedMethods = (payment.paymentMethods || []).map(m => m.toLowerCase());
          const creatorPaymentDetails =
            selectedMethods.length > 0
              ? allCreatorMethods.filter(m => selectedMethods.includes(m.method))
              : allCreatorMethods;

          return {
            ...payment,
            splits: paymentSplits,
            settledCount: paymentSplits.filter(s => s.is_settled).length,
            creatorPaymentDetails,
          };
        });

        setEnrichedPayments(paymentsWithSplits);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error enriching outstanding payments:', error);
        }
        setEnrichedPayments([]);
      } finally {
        setLoading(false);
      }
    };

    enrichPayments();
  }, [unsettledPayments, tripId, demoActive]);

  const handleToggleSplit = async (
    splitId: string,
    paymentId: string,
    currentlySettled: boolean,
  ) => {
    if (demoActive) {
      // Demo mode: just update local state
      setEnrichedPayments(prev => {
        const updated = prev.map(payment => {
          if (payment.id === paymentId) {
            const updatedSplits = payment.splits.map(s =>
              s.id === splitId
                ? {
                    ...s,
                    is_settled: !currentlySettled,
                    settled_at: !currentlySettled ? new Date().toISOString() : null,
                  }
                : s,
            );
            return {
              ...payment,
              splits: updatedSplits,
              settledCount: updatedSplits.filter(s => s.is_settled).length,
            };
          }
          return payment;
        });
        return updated;
      });

      await haptics.selectionChanged();
      return;
    }

    // Authenticated mode: toggle in database
    // Creator OR debtor can mark paid/unpaid (enforced server-side in settle RPCs).
    try {
      let success: boolean;
      let allSettled = false;
      if (currentlySettled) {
        success = await paymentService.unsettlePayment(splitId);
      } else {
        const defaultMethod =
          enrichedPayments.find(p => p.id === paymentId)?.creatorPaymentDetails[0]?.method ||
          'other';
        const settleResult = await paymentService.settlePaymentWithMeta(splitId, defaultMethod);
        success = settleResult.success;
        allSettled = settleResult.allSettled;
      }

      if (success) {
        await haptics.selectionChanged();

        // Optimistic local update so paid/unpaid status is instantly visible to the actor
        setEnrichedPayments(prev =>
          prev.map(payment => {
            if (payment.id !== paymentId) return payment;
            const updatedSplits = payment.splits.map(s =>
              s.id === splitId
                ? {
                    ...s,
                    is_settled: !currentlySettled,
                    settled_at: !currentlySettled ? new Date().toISOString() : null,
                  }
                : s,
            );
            return {
              ...payment,
              splits: updatedSplits,
              settledCount: updatedSplits.filter(s => s.is_settled).length,
            };
          }),
        );

        if (allSettled && !currentlySettled) {
          const payment = enrichedPayments.find(p => p.id === paymentId);
          if (payment) {
            notifyPaymentSettledInChat(
              tripId,
              resolvePaymentActorName(user),
              paymentId,
              payment.description,
            );
          }
        }

        onPaymentUpdated?.();
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error toggling split status:', error);
      }
      toast({
        title: 'Error',
        description: 'Failed to update payment status',
        variant: 'destructive',
      });
    }
  };

  const handleEditComplete = async () => {
    setEditingPayment(null);
    onPaymentUpdated?.();
  };

  const handleDelete = async (paymentId: string) => {
    if (demoActive) {
      setEnrichedPayments(prev => prev.filter(p => p.id !== paymentId));
      setDeleteConfirmId(null);
      toast({ title: 'Payment deleted', description: 'Demo payment has been removed.' });
      return;
    }

    setDeleting(true);
    try {
      const success = await onDeletePayment(paymentId);
      if (success) {
        toast({ title: 'Payment deleted', description: 'Payment has been removed.' });
        onPaymentUpdated?.();
      } else {
        toast({
          title: 'Error',
          description: 'Failed to delete payment',
          variant: 'destructive',
        });
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error deleting payment:', error);
      }
      toast({
        title: 'Error',
        description: 'Failed to delete payment',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  const getCreatorName = (creatorId: string): string => {
    const member = tripMembers.find(m => m.id === creatorId);
    return member?.name || 'Unknown';
  };

  const getCreatorAvatar = (creatorId: string): string | undefined => {
    const member = tripMembers.find(m => m.id === creatorId);
    return member?.avatar;
  };

  if (loading) {
    return (
      <Card className="bg-card border border-border rounded-lg">
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock size={18} className="text-yellow-500" />
            Outstanding Payments
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 animate-spin gold-gradient-spinner" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (enrichedPayments.length === 0) {
    return (
      <Card className="bg-card border border-border rounded-lg">
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock size={18} className="text-yellow-500" />
            Outstanding Payments
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="text-center py-6 text-muted-foreground">
            <Users size={28} className="mx-auto mb-2 opacity-60" />
            <p className="text-sm">No outstanding payments right now.</p>
            <p className="text-xs mt-1">Everyone is currently settled.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-card border border-border rounded-lg">
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock size={18} className="text-yellow-500" />
            Outstanding Payments
            <Badge variant="secondary" className="ml-auto text-xs">
              {enrichedPayments.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          {enrichedPayments.map(payment => (
            <Card key={payment.id} className="bg-muted/30 border-border/50">
              <CardContent className="p-4">
                {/* Payment header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10 border border-border">
                      <AvatarImage src={getCreatorAvatar(payment.createdBy)} />
                      <AvatarFallback className="bg-primary/20 text-primary text-sm">
                        {getCreatorName(payment.createdBy).substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{payment.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Paid by {getCreatorName(payment.createdBy)} •{' '}
                        {formatShortDate(payment.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-base">
                      {formatCurrency(payment.amount, payment.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const shares = payment.splits.map(s => s.amount_owed);
                        const uniform =
                          shares.length > 0 && shares.every(s => Math.abs(s - shares[0]) < 0.005);
                        return uniform
                          ? `${formatCurrency(shares[0] ?? payment.amount / payment.splitCount, payment.currency)} each`
                          : 'Custom split';
                      })()}
                    </p>
                  </div>
                </div>

                {/* Preferred payment methods — tappable deeplinks (Venmo / Cash App / PayPal) */}
                {payment.creatorPaymentDetails.length > 0 && (
                  <div className="mb-3 p-2 bg-background/50 rounded-lg space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Pay {getCreatorName(payment.createdBy)} via:
                    </p>
                    <PaymentMethodPayButtons
                      methods={payment.creatorPaymentDetails.map(m => ({
                        method: m.method,
                        identifier: m.identifier,
                        displayName: m.displayName,
                        isPreferred: m.isPreferred,
                      }))}
                      amount={
                        payment.splits.find(s => s.debtor_user_id === user?.id)?.amount_owed ??
                        payment.amount / Math.max(payment.splitCount, 1)
                      }
                      note={payment.description}
                      payeeName={getCreatorName(payment.createdBy)}
                    />
                  </div>
                )}

                {/* Split participants — creator (or debtor) can mark paid/unpaid for group visibility */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2 min-w-0">
                      <Users size={14} className="shrink-0" />
                      <span className="truncate">
                        Split {payment.splitCount} ways • {payment.settledCount}/
                        {payment.splits.length} paid
                      </span>
                    </div>
                    {payment.settledCount === payment.splits.length && payment.splits.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 shrink-0">
                        <CheckCircle2 size={14} />
                        All paid
                      </span>
                    ) : (
                      <span className="shrink-0 tabular-nums">
                        {Math.round(
                          (payment.settledCount / Math.max(payment.splits.length, 1)) * 100,
                        )}
                        %
                      </span>
                    )}
                  </div>
                  {/* Progress bar for paid vs unpaid */}
                  <div
                    className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
                    role="progressbar"
                    aria-valuenow={payment.settledCount}
                    aria-valuemin={0}
                    aria-valuemax={payment.splits.length}
                    aria-label={`${payment.settledCount} of ${payment.splits.length} participants paid`}
                  >
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      style={{
                        width: `${(payment.settledCount / Math.max(payment.splits.length, 1)) * 100}%`,
                      }}
                    />
                  </div>
                  {user?.id === payment.createdBy && (
                    <p className="text-[11px] text-muted-foreground/80">
                      Tap a checkbox to mark who has paid you back.
                    </p>
                  )}
                  {payment.splits.map(split => (
                    <div
                      key={split.id}
                      className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                        split.is_settled
                          ? 'bg-green-500/10 border border-green-500/20'
                          : 'bg-background/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Checkbox
                          checked={split.is_settled}
                          onCheckedChange={() =>
                            handleToggleSplit(split.id, payment.id, split.is_settled)
                          }
                          aria-label={`Mark ${split.debtor_name || 'participant'} as ${split.is_settled ? 'unpaid' : 'paid'}`}
                          className="min-h-[20px] min-w-[20px]"
                        />
                        <Avatar className="w-6 h-6 shrink-0">
                          <AvatarImage src={split.debtor_avatar} />
                          <AvatarFallback className="text-xs bg-muted">
                            {(split.debtor_name || 'U').substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate">{split.debtor_name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-sm font-medium ${split.is_settled ? 'text-green-500 line-through' : ''}`}
                        >
                          {formatCurrency(split.amount_owed, payment.currency)}
                        </span>
                        {split.is_settled && (
                          <Badge
                            variant="outline"
                            className="text-green-500 border-green-500/30 text-xs"
                          >
                            Paid
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Optional attachments (proof/context) — view + post-create upload */}
                <PaymentAttachmentsViewer attachments={getAttachments(payment.id)} />
                {attachmentsEnabled && !demoActive && user?.id && (
                  <PaymentAttachmentAddControl
                    tripId={tripId}
                    paymentId={payment.id}
                    uploadedBy={user.id}
                    existingCount={getAttachments(payment.id).length}
                    context={{
                      description: payment.description,
                      amount: payment.amount,
                      currency: payment.currency,
                    }}
                  />
                )}

                {/* Edit/Delete buttons - only show for payment creator */}
                {user?.id === payment.createdBy && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs min-h-[44px]"
                      onClick={() => setEditingPayment(payment)}
                      aria-label={`Edit payment: ${payment.description}`}
                    >
                      <Pencil size={14} className="mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-destructive hover:text-destructive min-h-[44px]"
                      onClick={() => setDeleteConfirmId(payment.id)}
                      aria-label={`Delete payment: ${payment.description}`}
                    >
                      <Trash2 size={14} className="mr-1" />
                      Delete
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      {/* Edit Payment Dialog */}
      {editingPayment && (
        <EditPaymentDialog
          payment={{
            id: editingPayment.id,
            amount: editingPayment.amount,
            description: editingPayment.description,
            currency: editingPayment.currency,
            splitCount: editingPayment.splitCount,
            createdBy: editingPayment.createdBy,
            paymentMethods: editingPayment.paymentMethods,
            splits: editingPayment.splits,
            splitParticipants: editingPayment.splitParticipants,
          }}
          tripId={tripId}
          tripMembers={tripMembers}
          isOpen={!!editingPayment}
          onClose={() => setEditingPayment(null)}
          onSave={handleEditComplete}
          isDemoMode={demoActive}
          onUpdatePayment={onUpdatePayment}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-destructive" size={20} />
              Delete Payment?
            </DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            This will permanently delete this payment and all its splits. This action cannot be
            undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <div className="w-4 h-4 mr-2 animate-spin gold-gradient-spinner" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
