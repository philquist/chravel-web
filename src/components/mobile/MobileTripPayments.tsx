import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatShortDate } from '@/utils/dateFormatters';
import { formatCurrency } from '@/services/currencyService';
import {
  Plus,
  DollarSign,
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
} from 'lucide-react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hapticService } from '@/services/hapticService';
import { safeReload } from '@/utils/safeReload';
import { CreatePaymentModal } from './CreatePaymentModal';
import { demoModeService } from '@/services/demoModeService';
import { paymentService } from '@/services/paymentService';
import {
  paymentBalanceService,
  BalanceSummary as BalanceSummaryType,
} from '@/services/paymentBalanceService';
import { supabase } from '@/integrations/supabase/client';
import { optimisticallyAddPayment, buildPaymentMessage } from '@/lib/paymentCacheUtils';
import { getTripById } from '@/data/tripsData';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useAuth } from '@/hooks/useAuth';
import { useTripMembersQuery } from '@/hooks/useTripMembersQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getConsistentAvatar, getInitials } from '@/utils/avatarUtils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { tripKeys, QUERY_CACHE_CONFIG } from '@/lib/queryKeys';
import { isDemoTrip } from '@/utils/demoUtils';
import { OutstandingPayments } from '@/components/payments/OutstandingPayments';
import { PersonBalanceCard } from '@/components/payments/PersonBalanceCard';

interface Payment {
  id: string;
  payer: string;
  payerId: string;
  payerAvatar: string;
  amount: number;
  currency: string;
  description: string;
  status: 'settled' | 'pending' | 'overdue';
  splitWith: string[];
  splitCount: number;
  date: string;
  isSettled: boolean;
}

interface MobileTripPaymentsProps {
  tripId: string;
}

/**
 * iOS-optimized mobile payments view
 * Shows payment splits, settlements, and status
 * Uses same data source as desktop (Supabase for auth, mock for demo)
 */
export const MobileTripPayments = ({ tripId }: MobileTripPaymentsProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const debouncedMemberSearch = useDebouncedValue(memberSearchQuery, 300);

  const { isDemoMode, isLoading: demoLoading } = useDemoMode();

  // ⚡ PERFORMANCE: Timeout state to prevent indefinite spinners
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const demoActive = isDemoMode && isDemoTrip(tripId);
  const tripIdNum = parseInt(tripId, 10);

  // ⚡ CANONICAL: Use same membership source as Trip Members UI and desktop Payments
  const {
    tripMembers: canonicalMembers,
    loading: membersLoading,
    hadMembersError,
    refreshMembers,
    isPaginatedRoster,
    memberTotalCount,
    isSearchingMembers,
  } = useTripMembersQuery(demoActive ? undefined : tripId, {
    rosterSearch: debouncedMemberSearch,
  });

  // Ensure current user in members when viewing (e.g. shared trip)
  const tripMembers = useMemo(() => {
    if (demoActive) return [];
    const base = canonicalMembers.map(m => ({ id: m.id, name: m.name, avatar: m.avatar }));
    if (user && !base.find(m => m.id === user.id)) {
      return [
        {
          id: user.id,
          name: user.displayName || user.email?.split('@')[0] || 'Unknown',
          avatar: user.avatar,
        },
        ...base,
      ];
    }
    return base;
  }, [demoActive, canonicalMembers, user]);

  // ⚡ PERFORMANCE: TanStack Query for payments + balance (members from canonical useTripMembersQuery)
  const {
    data: authPaymentData,
    isLoading: authQueryLoading,
    refetch: refetchPayments,
  } = useQuery({
    queryKey: tripKeys.payments(tripId),
    queryFn: async () => {
      const [paymentsData, balanceResult] = await Promise.all([
        paymentService.getTripPaymentMessages(tripId),
        user?.id
          ? paymentBalanceService.getBalanceSummary(tripId, user.id).catch(() => ({
              totalOwed: 0,
              totalOwedToYou: 0,
              netBalance: 0,
              baseCurrency: 'USD' as const,
              balances: [],
            }))
          : Promise.resolve(null),
      ]);

      return {
        payments: paymentsData,
        balanceSummary: balanceResult ?? null,
      };
    },
    enabled: !demoActive && !demoLoading && !!user,
    staleTime: QUERY_CACHE_CONFIG.payments.staleTime,
    gcTime: QUERY_CACHE_CONFIG.payments.gcTime,
    refetchOnWindowFocus: QUERY_CACHE_CONFIG.payments.refetchOnWindowFocus,
  });

  // Convert raw payments to Payment format using canonical members (payer names)
  const payments = useMemo(() => {
    const raw = authPaymentData?.payments ?? [];
    if (raw.length === 0) return [];
    return raw.map(p => {
      const payer = tripMembers.find(m => m.id === p.createdBy);
      return {
        id: p.id,
        payer: payer?.name || 'Unknown',
        payerId: p.createdBy,
        payerAvatar: payer?.avatar || getConsistentAvatar(payer?.name || 'Unknown'),
        amount: p.amount,
        currency: p.currency,
        description: p.description,
        status: (p.isSettled ? 'settled' : 'pending') as Payment['status'],
        splitWith: p.splitParticipants,
        splitCount: p.splitCount,
        date: p.createdAt,
        isSettled: p.isSettled,
      };
    });
  }, [authPaymentData?.payments, tripMembers]);

  // Demo mode state (unchanged logic, just separated from auth flow)
  const [demoMembers, setDemoMembers] = useState<
    Array<{ id: string; name: string; avatar?: string }>
  >([]);
  const [demoPayments, setDemoPayments] = useState<Payment[]>([]);
  const [demoBalance, setDemoBalance] = useState<BalanceSummaryType | null>(null);
  const [demoDataLoaded, setDemoDataLoaded] = useState(false);

  useEffect(() => {
    if (!demoActive || demoLoading) return;

    const mockTrip = getTripById(tripIdNum);
    const mockMembers = demoModeService.getMockMembers(tripId);

    let formattedMembers: Array<{ id: string; name: string; avatar?: string }>;
    if (mockTrip && mockTrip.participants) {
      formattedMembers = mockTrip.participants.map(p => ({
        id: String(p.id),
        name: p.name,
        avatar: p.avatar,
      }));
    } else {
      formattedMembers = mockMembers.map(m => ({
        id: m.user_id,
        name: m.display_name,
        avatar: m.avatar_url,
      }));
    }
    setDemoMembers(formattedMembers);

    const getPayerName = (createdBy: string, createdByName?: string): string => {
      if (createdByName) return createdByName;
      const member = formattedMembers.find(m => m.id === createdBy);
      if (member) return member.name;
      const mockMember = mockMembers.find(m => m.user_id === createdBy);
      return mockMember?.display_name || 'Unknown';
    };

    const rawDemoPayments = demoModeService.getMockPayments(tripId, false);
    const sessionPayments = demoModeService.getSessionPayments(tripId);

    const convertedSessionPayments: Payment[] = sessionPayments.map(p => ({
      id: p.id,
      payer: p.createdByName || getPayerName(p.created_by),
      payerId: p.created_by || 'demo-user',
      payerAvatar: getConsistentAvatar(p.createdByName || getPayerName(p.created_by)),
      amount: p.amount,
      currency: p.currency || 'USD',
      description: p.description,
      status: p.is_settled ? ('settled' as const) : ('pending' as const),
      splitWith: p.split_participants || [],
      splitCount: p.split_count || 1,
      date: p.created_at,
      isSettled: p.is_settled || false,
    }));

    const convertedMockPayments: Payment[] = rawDemoPayments.map(p => ({
      id: p.id,
      payer: getPayerName(p.created_by),
      payerId: p.created_by,
      payerAvatar: getConsistentAvatar(getPayerName(p.created_by)),
      amount: p.amount,
      currency: p.currency || 'USD',
      description: p.description,
      status: p.is_settled ? ('settled' as const) : ('pending' as const),
      splitWith: p.split_participants || [],
      splitCount: p.split_count || 1,
      date: p.created_at,
      isSettled: p.is_settled || false,
    }));

    setDemoPayments([...convertedSessionPayments, ...convertedMockPayments]);

    const allDemoPayments = [...sessionPayments, ...rawDemoPayments];
    const totalAmount = allDemoPayments.reduce((sum, p) => sum + p.amount, 0);
    const avgPerPerson = totalAmount / Math.max(mockMembers.length, 1);

    setDemoBalance({
      totalOwed: avgPerPerson * 0.6,
      totalOwedToYou: avgPerPerson * 0.4,
      netBalance: avgPerPerson * 0.2,
      baseCurrency: 'USD',
      balances: mockMembers.slice(0, 3).map((m, i) => ({
        userId: m.user_id,
        userName: m.display_name,
        avatar: m.avatar_url,
        amountOwed: (i === 0 ? avgPerPerson * 0.5 : avgPerPerson * 0.3) * (i % 2 === 0 ? 1 : -1),
        amountOwedCurrency: 'USD',
        preferredPaymentMethod: null,
        unsettledPayments: [],
      })),
    });

    setDemoDataLoaded(true);
  }, [tripId, demoActive, demoLoading, tripIdNum]);

  // ⚡ Unified data accessors — demo or auth (memoized for stable callback deps)
  const effectiveTripMembers = demoActive ? demoMembers : tripMembers;
  const effectivePayments = demoActive ? demoPayments : payments;
  const balanceSummary = demoActive ? demoBalance : (authPaymentData?.balanceSummary ?? null);
  const isLoading = demoActive
    ? !demoDataLoaded && !demoLoading
    : authQueryLoading || (membersLoading && !hadMembersError);

  // Split payments into outstanding and completed
  const outstandingPayments = useMemo(
    () => effectivePayments.filter(p => !p.isSettled),
    [effectivePayments],
  );
  const completedPayments = useMemo(
    () => effectivePayments.filter(p => p.isSettled),
    [effectivePayments],
  );

  // ⚡ PERFORMANCE: 10-second timeout to prevent indefinite spinners
  useEffect(() => {
    if (isLoading && !hasTimedOut) {
      loadingTimeoutRef.current = setTimeout(() => {
        console.warn('[MobileTripPayments] Query timeout - showing fallback UI');
        setHasTimedOut(true);
      }, 10000);
    }

    // Clear timeout when loading completes
    if (!isLoading && loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
      setHasTimedOut(false);
    }

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [isLoading, hasTimedOut]);

  // Retry function for timeout state
  const handleRetryAfterTimeout = useCallback(() => {
    setHasTimedOut(false);
    if (demoActive) {
      safeReload();
    } else {
      refetchPayments();
    }
  }, [demoActive, refetchPayments]);

  // Subscribe to profile updates — invalidate query cache for instant avatar/name refresh
  useEffect(() => {
    if (!tripId || demoActive) return;

    const channel = supabase
      .channel(`mobile-payments-profiles-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: tripKeys.payments(tripId) });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {
        // ignore
      });
    };
  }, [tripId, demoActive, queryClient]);

  // Subscribe to payment changes — trip-scoped via trip_payment_messages only.
  // (payment_splits has no trip_id; settle flow updates trip_payment_messages too)
  useEffect(() => {
    if (!tripId || demoActive) return;

    const channel = supabase
      .channel(`mobile-payments-realtime-${tripId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trip_payment_messages',
          filter: `trip_id=eq.${tripId}`,
        },
        () => queryClient.refetchQueries({ queryKey: tripKeys.payments(tripId) }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {
        // ignore
      });
    };
  }, [tripId, demoActive, queryClient]);

  const selectedPayment = useMemo(() => {
    if (!selectedPaymentId) return null;
    return effectivePayments.find(p => p.id === selectedPaymentId) || null;
  }, [selectedPaymentId, effectivePayments]);

  const handleAddPayment = async () => {
    await hapticService.medium();
    setIsModalOpen(true);
  };

  const handlePaymentCreated = useCallback(
    async (newPayment?: {
      id: string;
      amount: number;
      currency: string;
      description: string;
      splitCount: number;
      splitParticipants: string[];
      paymentMethods: string[];
      createdBy: string;
      createdAt: string;
      isSettled: boolean;
    }) => {
      if (demoActive) {
        // Re-trigger demo data load
        const rawDemoPayments = demoModeService.getMockPayments(tripId, false);
        const sessionPayments = demoModeService.getSessionPayments(tripId);
        const mockMembers = demoModeService.getMockMembers(tripId);

        const getPayerName = (createdBy: string, createdByName?: string): string => {
          if (createdByName) return createdByName;
          const member = effectiveTripMembers.find(m => m.id === createdBy);
          if (member) return member.name;
          const mockMember = mockMembers.find(m => m.user_id === createdBy);
          return mockMember?.display_name || 'Unknown';
        };

        const convertedSessionPayments: Payment[] = sessionPayments.map(p => ({
          id: p.id,
          payer: p.createdByName || getPayerName(p.created_by),
          payerId: p.created_by || 'demo-user',
          payerAvatar: getConsistentAvatar(p.createdByName || getPayerName(p.created_by)),
          amount: p.amount,
          currency: p.currency || 'USD',
          description: p.description,
          status: p.is_settled ? ('settled' as const) : ('pending' as const),
          splitWith: p.split_participants || [],
          splitCount: p.split_count || 1,
          date: p.created_at,
          isSettled: p.is_settled || false,
        }));

        const convertedMockPayments: Payment[] = rawDemoPayments.map(p => ({
          id: p.id,
          payer: getPayerName(p.created_by),
          payerId: p.created_by,
          payerAvatar: getConsistentAvatar(getPayerName(p.created_by)),
          amount: p.amount,
          currency: p.currency || 'USD',
          description: p.description,
          status: p.is_settled ? ('settled' as const) : ('pending' as const),
          splitWith: p.split_participants || [],
          splitCount: p.split_count || 1,
          date: p.created_at,
          isSettled: p.is_settled || false,
        }));

        setDemoPayments([...convertedSessionPayments, ...convertedMockPayments]);
      } else {
        // ⚡ Optimistic update: show payment immediately
        if (newPayment && user?.id) {
          const paymentMessage = buildPaymentMessage(newPayment.id, tripId, user.id, {
            amount: newPayment.amount,
            currency: newPayment.currency,
            description: newPayment.description,
            splitCount: newPayment.splitCount,
            splitParticipants: newPayment.splitParticipants,
            paymentMethods: newPayment.paymentMethods,
          });
          optimisticallyAddPayment(queryClient, tripId, paymentMessage);
        }
        // Refetch to ensure server truth (balance, etc.)
        await Promise.all([
          queryClient.refetchQueries({ queryKey: tripKeys.payments(tripId) }),
          queryClient.invalidateQueries({ queryKey: tripKeys.members(tripId) }),
        ]);
      }
    },
    [tripId, demoActive, effectiveTripMembers, queryClient, user?.id],
  );

  const handlePaymentTap = async (_paymentId: string) => {
    await hapticService.light();
    setSelectedPaymentId(_paymentId);
  };

  const handleUpdatePayment = useCallback(
    async (paymentId: string, updates: { amount?: number; description?: string }) => {
      const success = await paymentService.updatePaymentMessage(paymentId, updates);
      if (success) refetchPayments();
      return success;
    },
    [refetchPayments],
  );

  const handleDeletePayment = useCallback(
    async (paymentId: string) => {
      const success = await paymentService.deletePaymentMessage(paymentId);
      if (success) refetchPayments();
      return success;
    },
    [refetchPayments],
  );

  const handleRefresh = useCallback(async () => {
    if (demoActive) {
      handleRetryAfterTimeout();
    } else {
      await refetchPayments();
    }
  }, [demoActive, handleRetryAfterTimeout, refetchPayments]);

  const { isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
    maxPullDistance: 120,
  });

  const getStatusIcon = (status: Payment['status']) => {
    switch (status) {
      case 'settled':
        return <CheckCircle size={16} className="text-green-500" />;
      case 'pending':
        return <Clock size={16} className="text-yellow-500" />;
      case 'overdue':
        return <AlertCircle size={16} className="text-red-500" />;
    }
  };

  const formatCurrencyFn = (amount: number, currency?: string) =>
    formatCurrency(amount, currency || 'USD');

  // ⚡ PERFORMANCE: Show timeout UI instead of indefinite spinner
  if (hasTimedOut && isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black py-12 px-4">
        <AlertCircle className="w-10 h-10 text-yellow-500 mb-3" />
        <h3 className="text-lg font-semibold text-white mb-2">Taking longer than expected</h3>
        <p className="text-sm text-muted-foreground text-center mb-4">
          Payments are slow to load. This might be a connection issue.
        </p>
        <button
          onClick={handleRetryAfterTimeout}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  }

  if (isLoading || demoLoading) {
    return (
      <div className="flex flex-col h-full bg-black px-4 pt-4 pb-2 space-y-4">
        {/* Balance Card Skeleton */}
        <div className="bg-card/50 border border-border rounded-xl p-4 animate-pulse">
          <div className="grid grid-cols-3 gap-3">
            <div className="h-12 bg-white/5 rounded-lg"></div>
            <div className="h-12 bg-white/5 rounded-lg"></div>
            <div className="h-12 bg-white/5 rounded-lg"></div>
          </div>
        </div>

        {/* Payments List Skeleton */}
        <div className="space-y-3">
          <div className="h-5 w-32 bg-white/5 rounded mt-2 mb-3"></div>
          <div className="h-20 bg-white/5 rounded-xl border border-white/5"></div>
          <div className="h-20 bg-white/5 rounded-xl border border-white/5"></div>
          <div className="h-20 bg-white/5 rounded-xl border border-white/5"></div>
        </div>
      </div>
    );
  }

  // Members failed to load (same error as desktop PaymentsTab)
  if (!demoActive && hadMembersError) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black py-12 px-4">
        <AlertCircle className="w-10 h-10 text-amber-500 mb-3" />
        <h3 className="text-lg font-semibold text-white mb-2">Couldn&apos;t load trip members</h3>
        <p className="text-sm text-muted-foreground text-center mb-4">
          This might be a connection issue. Payments need the member list to split expenses.
        </p>
        <button
          onClick={() => refreshMembers()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full bg-black">
      {(isRefreshing || pullDistance > 0) && (
        <PullToRefreshIndicator
          isRefreshing={isRefreshing}
          pullDistance={pullDistance}
          threshold={80}
        />
      )}
      {/* Balance Summary Card - Matching desktop structure */}
      <div className="px-4 pt-4 pb-2">
        <div className="bg-card/50 border border-border rounded-xl p-4">
          <div className="grid grid-cols-3 gap-3">
            {/* You Owe */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <ArrowUpRight size={14} className="text-orange-500" />
                <span className="text-xs text-muted-foreground">You Owe</span>
              </div>
              <p className="text-lg font-bold text-orange-500">
                {formatCurrencyFn(balanceSummary?.totalOwed || 0)}
              </p>
            </div>

            {/* You Are Owed */}
            <div className="text-center border-x border-border">
              <div className="flex items-center justify-center gap-1 mb-1">
                <ArrowDownLeft size={14} className="text-green-500" />
                <span className="text-xs text-muted-foreground">You're Owed</span>
              </div>
              <p className="text-lg font-bold text-green-500">
                {formatCurrencyFn(balanceSummary?.totalOwedToYou || 0)}
              </p>
            </div>

            {/* Net Balance */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <DollarSign size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Net</span>
              </div>
              <p
                className={`text-lg font-bold ${
                  (balanceSummary?.netBalance || 0) >= 0 ? 'text-green-500' : 'text-orange-500'
                }`}
              >
                {formatCurrencyFn(balanceSummary?.netBalance || 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Per-person balances with preferred-method deeplinks (mobile parity with desktop) */}
      {!demoActive && balanceSummary && balanceSummary.balances.length > 0 && (
        <div className="px-4 pb-2 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Who owes whom</h3>
          {balanceSummary.balances.map(balance => (
            <PersonBalanceCard key={balance.userId} balance={balance} tripId={tripId} />
          ))}
        </div>
      )}

      {/* Payments List */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4 native-scroll mobile-safe-scroll">
        {effectivePayments.length === 0 ? (
          <div className="text-center py-12">
            <DollarSign size={48} className="text-muted-foreground mx-auto mb-4" />
            <h4 className="text-lg font-medium text-muted-foreground mb-2">No payments yet</h4>
            <p className="text-muted-foreground text-sm">Split expenses and track who owes what</p>
          </div>
        ) : (
          <>
            {/* Outstanding Payments Section —
                Auth mode: OutstandingPayments component with settle/unsettle checkboxes.
                Demo mode: simplified read-only cards (no real splits to act on). */}
            {demoActive ? (
              outstandingPayments.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock size={16} className="text-yellow-500" />
                    <h3 className="text-sm font-semibold text-foreground">Outstanding Payments</h3>
                    <span className="text-xs text-muted-foreground">
                      ({outstandingPayments.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {outstandingPayments.map(payment => (
                      <PaymentCard
                        key={payment.id}
                        payment={payment}
                        onTap={handlePaymentTap}
                        formatCurrency={formatCurrencyFn}
                        getStatusIcon={getStatusIcon}
                      />
                    ))}
                  </div>
                </div>
              )
            ) : (
              <OutstandingPayments
                tripId={tripId}
                tripMembers={effectiveTripMembers}
                onPaymentUpdated={() => refetchPayments()}
                payments={authPaymentData?.payments ?? []}
                onUpdatePayment={handleUpdatePayment}
                onDeletePayment={handleDeletePayment}
              />
            )}

            {/* Completed Payments Section */}
            {completedPayments.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle size={16} className="text-green-500" />
                  <h3 className="text-sm font-semibold text-foreground">Completed Payments</h3>
                  <span className="text-xs text-muted-foreground">
                    ({completedPayments.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {completedPayments.map(payment => (
                    <PaymentCard
                      key={payment.id}
                      payment={payment}
                      onTap={handlePaymentTap}
                      formatCurrency={formatCurrencyFn}
                      getStatusIcon={getStatusIcon}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Payment FAB */}
      <div className="sticky bottom-0 px-4 py-2 pb-[env(safe-area-inset-bottom)] bg-gradient-to-t from-black via-black to-transparent border-t border-border">
        <button
          onClick={handleAddPayment}
          className="w-full bg-gray-800/80 text-white cta-gold-ring font-medium py-4 rounded-xl transition-all hover:opacity-90 hover:scale-[1.01] active:scale-[0.99] shadow-lg flex items-center justify-center gap-2 min-h-[44px]"
        >
          <Plus size={20} />
          Add Payment Request
        </button>
      </div>

      {/* Payment Detail Modal */}
      <Dialog open={!!selectedPaymentId} onOpenChange={open => !open && setSelectedPaymentId(null)}>
        <DialogContent className="sm:max-w-md w-[90vw] rounded-xl">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
          </DialogHeader>

          {selectedPayment && (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center justify-center space-y-2 mb-6">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={selectedPayment.payerAvatar} alt={selectedPayment.payer} />
                  <AvatarFallback className="bg-primary/20 text-primary text-xl font-semibold">
                    {getInitials(selectedPayment.payer)}
                  </AvatarFallback>
                </Avatar>
                <h3 className="text-xl font-semibold text-foreground text-center">
                  {selectedPayment.description}
                </h3>
                <p className="text-3xl font-bold text-foreground">
                  {formatCurrencyFn(selectedPayment.amount, selectedPayment.currency)}
                </p>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-card rounded-full border border-border">
                  {getStatusIcon(selectedPayment.status)}
                  <span
                    className={`text-sm font-medium ${selectedPayment.isSettled ? 'text-green-500' : 'text-yellow-500'}`}
                  >
                    {selectedPayment.isSettled ? 'Settled' : 'Pending'}
                  </span>
                </div>
              </div>

              <div className="space-y-3 bg-card/50 p-4 rounded-xl border border-border">
                <div className="flex justify-between items-center pb-3 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Paid by</span>
                  <span className="text-sm font-medium text-foreground">
                    {selectedPayment.payer}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Date</span>
                  <span className="text-sm font-medium text-foreground">
                    {formatShortDate(selectedPayment.date)}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Split</span>
                  <span className="text-sm font-medium text-foreground">
                    {selectedPayment.splitCount} ways
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Per person</span>
                  <span className="text-sm font-medium text-foreground">
                    {formatCurrencyFn(
                      selectedPayment.amount / selectedPayment.splitCount,
                      selectedPayment.currency,
                    )}
                  </span>
                </div>
              </div>

              {selectedPayment.splitWith && selectedPayment.splitWith.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-foreground mb-2">Participants</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedPayment.splitWith.map(userId => {
                      const member = effectiveTripMembers.find(m => m.id === userId);
                      return (
                        <div
                          key={userId}
                          className="flex items-center gap-2 bg-card/50 px-2.5 py-1.5 rounded-full border border-border"
                        >
                          <Avatar className="w-5 h-5">
                            <AvatarImage
                              src={member?.avatar || getConsistentAvatar(member?.name || 'Unknown')}
                            />
                            <AvatarFallback className="text-[10px]">
                              {getInitials(member?.name || 'Unknown')}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs font-medium">{member?.name || 'Unknown'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="sm:justify-center">
            <DialogClose asChild>
              <Button type="button" variant="secondary" className="w-full">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Payment Modal */}
      <CreatePaymentModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setMemberSearchQuery('');
        }}
        tripId={tripId}
        tripMembers={effectiveTripMembers}
        onPaymentCreated={handlePaymentCreated}
        demoActive={demoActive}
        userId={user?.id}
        isPaginatedRoster={isPaginatedRoster}
        memberSearchQuery={memberSearchQuery}
        onMemberSearchChange={setMemberSearchQuery}
        memberTotalCount={memberTotalCount}
        isSearchingMembers={isSearchingMembers}
      />
    </div>
  );
};

// Extracted PaymentCard component for cleaner code
interface PaymentCardProps {
  payment: Payment;
  onTap: (id: string) => void;
  formatCurrency: (amount: number, currency?: string) => string;
  getStatusIcon: (status: Payment['status']) => React.ReactNode;
}

const PaymentCard: React.FC<PaymentCardProps> = ({
  payment,
  onTap,
  formatCurrency,
  getStatusIcon,
}) => {
  return (
    <button
      onClick={() => onTap(payment.id)}
      className={`w-full border rounded-xl p-3 transition-all active:scale-[0.98] text-left ${
        payment.isSettled
          ? 'bg-green-500/5 border-green-500/20 hover:bg-green-500/10'
          : 'bg-card/50 border-border hover:bg-card/80'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Payer Avatar */}
        <Avatar className="w-9 h-9">
          <AvatarImage src={payment.payerAvatar} alt={payment.payer} />
          <AvatarFallback className="bg-primary/20 text-primary font-semibold text-xs">
            {getInitials(payment.payer)}
          </AvatarFallback>
        </Avatar>

        {/* Payment Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{payment.description}</p>
              <p className="text-xs text-muted-foreground">Paid by {payment.payer}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-foreground">
                {formatCurrency(payment.amount, payment.currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(payment.amount / payment.splitCount, payment.currency)} each
              </p>
            </div>
          </div>

          {/* Status and Split Info */}
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-1.5">
              {getStatusIcon(payment.status)}
              <span
                className={`text-xs ${payment.isSettled ? 'text-green-500' : 'text-yellow-500'}`}
              >
                {payment.isSettled ? 'Settled' : 'Pending'}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Split {payment.splitCount} ways</span>
          </div>
        </div>
      </div>
    </button>
  );
};
