import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, Users, CheckSquare, Wand2, Check, Search, Loader2 } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { usePaymentSplits } from '@/hooks/usePaymentSplits';
import { useDemoMode } from '@/hooks/useDemoMode';
import { PAYMENT_METHOD_OPTIONS } from '@/types/paymentMethods';
import {
  getAutomaticParticipantSuggestions,
  detectPaymentParticipantsFromMessage,
} from '@/services/chatAnalysisService';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '../ui/badge';
import { CurrencySelector } from './CurrencySelector';
import { useFeatureFlag } from '@/lib/featureFlags';
import { usePaymentAttachmentDraft } from '@/features/payments/hooks/usePaymentAttachmentDraft';
import { PaymentAttachmentPicker } from '@/features/payments/components/PaymentAttachmentPicker';
import { LARGE_LIST_THRESHOLDS } from '@/lib/largeListThresholds';
import { PaymentSplitAllocator } from './PaymentSplitAllocator';

interface PaymentInputProps {
  /**
   * Persists the payment. Returns the new payment id on success (used to attach staged
   * proof/context after creation) and `success: false` on failure. May also return void for
   * surfaces that route the payment elsewhere (e.g. chat payment mode) — those skip attachments.
   * Form only resets on success.
   */
  onSubmit: (paymentData: {
    amount: number;
    currency: string;
    description: string;
    splitCount: number;
    splitParticipants: string[];
    paymentMethods: string[];
    splitType?: 'equal' | 'custom' | 'percentage';
    customAmounts?: Record<string, number>;
  }) => void | Promise<{ success: boolean; paymentId?: string } | void>;
  tripMembers: Array<{ id: string; name: string; avatar?: string }>;
  isVisible: boolean;
  tripId: string;
  /**
   * When true, member search is server-driven (list_trip_members RPC).
   * Parent should pass debounced search via memberSearchQuery / onMemberSearchChange.
   */
  isPaginatedRoster?: boolean;
  memberSearchQuery?: string;
  onMemberSearchChange?: (query: string) => void;
  memberTotalCount?: number;
  isSearchingMembers?: boolean;
  /**
   * Whether to offer the optional attachment picker. Off for surfaces that don't persist a
   * payment id we can attach to (e.g. chat payment mode). Defaults to true.
   */
  enableAttachments?: boolean;
}

export const PaymentInput = ({
  onSubmit,
  tripMembers,
  isVisible,
  tripId,
  isPaginatedRoster = false,
  memberSearchQuery = '',
  onMemberSearchChange,
  memberTotalCount,
  isSearchingMembers = false,
  enableAttachments = true,
}: PaymentInputProps) => {
  const { user } = useAuth();
  const attachmentsEnabled = useFeatureFlag('payment_attachments', true);
  const attachmentDraft = usePaymentAttachmentDraft();
  const {
    amount,
    currency,
    description,
    selectedParticipants,
    selectedPaymentMethods,
    perPersonAmount,
    allParticipantsSelected,
    allPaymentMethodsSelected,
    splitType,
    customAmounts,
    percentages,
    resolvedAmounts,
    validationError,
    isValid,
    setAmount,
    setCurrency,
    setDescription,
    toggleParticipant,
    togglePaymentMethod,
    selectAllParticipants,
    selectAllPaymentMethods,
    setSplitType,
    setCustomAmountForParticipant,
    setPercentageForParticipant,
    redistributeEvenly,
    getPaymentData,
    resetForm,
    setSelectedParticipants,
  } = usePaymentSplits(tripMembers);

  const [autoSuggestions, setAutoSuggestions] = useState<
    Array<{ userId: string; reason: string; confidence: number }>
  >([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localMemberSearchQuery, setLocalMemberSearchQuery] = useState('');
  const isControlledMemberSearch = onMemberSearchChange !== undefined;
  const effectiveMemberSearchQuery = isControlledMemberSearch
    ? memberSearchQuery
    : localMemberSearchQuery;
  const handleMemberSearchChange = (query: string) => {
    if (isControlledMemberSearch) {
      onMemberSearchChange?.(query);
      return;
    }
    setLocalMemberSearchQuery(query);
  };

  const filteredTripMembers = useMemo(() => {
    if (isPaginatedRoster) return tripMembers;
    const normalized = effectiveMemberSearchQuery.trim().toLowerCase();
    if (!normalized) return tripMembers;
    return tripMembers.filter(member => member.name.toLowerCase().includes(normalized));
  }, [effectiveMemberSearchQuery, isPaginatedRoster, tripMembers]);

  const showMemberSearch =
    isPaginatedRoster || tripMembers.length >= LARGE_LIST_THRESHOLDS.paymentPickerSearchMinCount;
  const resolvedMemberTotalCount = memberTotalCount ?? tripMembers.length;
  const hasActiveMemberSearch = effectiveMemberSearchQuery.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const paymentData = getPaymentData();
    if (!paymentData) return;

    setIsSubmitting(true);
    try {
      const result = await onSubmit(paymentData);
      if (result && result.success) {
        // Attach staged proof/context AFTER the payment exists. The draft hook handles per-item
        // failures, cache invalidation, and clearing itself; failures never block the payment.
        if (showAttachments && result.paymentId && user?.id && attachmentDraft.count > 0) {
          await attachmentDraft.commit({
            tripId,
            paymentId: result.paymentId,
            uploadedBy: user.id,
            context: {
              description: paymentData.description,
              amount: paymentData.amount,
              currency: paymentData.currency,
            },
          });
        }
        resetForm();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const amountPerPerson = perPersonAmount;
  const { isDemoMode } = useDemoMode();
  const showAttachments = enableAttachments && attachmentsEnabled && !isDemoMode;

  // Auto-detect participants when description changes
  useEffect(() => {
    if (!user?.id || !tripId || isDemoMode || !description.trim()) {
      return;
    }

    const analyzeDescription = async () => {
      setIsAnalyzing(true);
      try {
        // Try to parse payment info from description
        const result = await detectPaymentParticipantsFromMessage(description, tripId, user.id);

        if (result.suggestedParticipants.length > 0 && result.confidence > 0.5) {
          setAutoSuggestions(result.suggestedParticipants);

          // Auto-select high-confidence suggestions
          const highConfidenceIds = result.suggestedParticipants
            .filter(s => s.confidence >= 0.7)
            .map(s => s.userId);

          if (highConfidenceIds.length > 0 && selectedParticipants.length === 0) {
            setSelectedParticipants(highConfidenceIds);
          }

          // Auto-fill amount and currency if detected
          if (result.amount && !amount) {
            setAmount(result.amount);
          }
          if (result.currency && currency === 'USD') {
            setCurrency(result.currency);
          }
        } else {
          setAutoSuggestions([]);
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error analyzing payment description:', error);
        }
      } finally {
        setIsAnalyzing(false);
      }
    };

    // Debounce analysis
    const timeoutId = setTimeout(analyzeDescription, 500);
    return () => clearTimeout(timeoutId);
  }, [
    description,
    tripId,
    user?.id,
    isDemoMode,
    amount,
    currency,
    selectedParticipants.length,
    setAmount,
    setCurrency,
    setSelectedParticipants,
  ]);

  // Load automatic suggestions on mount
  useEffect(() => {
    if (!user?.id || !tripId || isDemoMode) {
      return;
    }

    const loadSuggestions = async () => {
      try {
        const suggestions = await getAutomaticParticipantSuggestions(tripId, user.id);
        setAutoSuggestions(suggestions);

        // Auto-select top suggestions if none selected
        if (selectedParticipants.length === 0 && suggestions.length > 0) {
          const topSuggestions = suggestions
            .filter(s => s.confidence >= 0.6)
            .slice(0, 3)
            .map(s => s.userId);

          if (topSuggestions.length > 0) {
            setSelectedParticipants(topSuggestions);
          }
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error loading automatic suggestions:', error);
        }
      }
    };

    loadSuggestions();
  }, [tripId, user?.id, isDemoMode, selectedParticipants.length, setSelectedParticipants]);

  if (!isVisible) return null;

  return (
    <Card className="bg-glass-slate-card border border-glass-slate-border rounded-2xl shadow-enterprise-lg">
      <CardContent className="px-4 pt-4 pb-4 md:px-6 md:pt-6 md:pb-6">
        <div className="flex items-center gap-2 mb-5">
          <DollarSign size={20} className="text-emerald-400" />
          <span className="text-base font-semibold text-foreground">Payment Details</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Amount, Description & Currency - 3 Column Grid (UX-optimized order) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Amount (first - most important) */}
            <div className="flex flex-col space-y-1">
              <Label htmlFor="amount" className="text-sm font-medium text-muted-foreground">
                Amount
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount || ''}
                onChange={e => setAmount(Number(e.target.value))}
                placeholder="0.00"
                className="w-full h-12 rounded-xl bg-glass-slate-bg border border-glass-slate-border text-foreground px-4 focus:ring-2 focus:ring-primary/40 focus:outline-none placeholder-gray-500 transition-all"
                required
              />
            </div>

            {/* 2. Description (second - what was it for?) */}
            <div className="flex flex-col space-y-1">
              <Label htmlFor="description" className="text-sm font-medium text-muted-foreground">
                What's this for?
              </Label>
              <textarea
                id="description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Dinner, taxi, tickets, etc."
                className="w-full h-12 resize-none rounded-xl bg-glass-slate-bg border border-glass-slate-border text-foreground px-4 py-2 focus:ring-2 focus:ring-primary/40 focus:outline-none placeholder-gray-500 transition-all"
                required
              />
            </div>

            {/* 3. Currency (third - typically less frequently changed) */}
            <div className="flex flex-col space-y-1">
              <Label htmlFor="currency" className="text-sm font-medium text-muted-foreground">
                Currency
              </Label>
              <CurrencySelector value={currency} onChange={setCurrency} />
            </div>
          </div>

          {/* Split Between People - Unified Box with 2-Column Grid */}
          <div className="bg-glass-slate-bg/30 border border-glass-slate-border/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-emerald-400" />
                <h4 className="text-sm font-semibold text-muted-foreground">
                  Split between {selectedParticipants.length} people
                  {splitType === 'equal' && amountPerPerson > 0 && (
                    <span className="text-emerald-400 font-semibold ml-1.5">
                      (${amountPerPerson.toFixed(2)} each)
                    </span>
                  )}
                </h4>
                {isAnalyzing && <Wand2 size={14} className="text-emerald-400 animate-pulse" />}
              </div>
              <button
                type="button"
                onClick={selectAllParticipants}
                className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
                aria-label={
                  allParticipantsSelected
                    ? hasActiveMemberSearch
                      ? 'Deselect all shown members'
                      : 'Deselect all trip members'
                    : hasActiveMemberSearch
                      ? 'Select all shown members'
                      : 'Select all trip members'
                }
              >
                {allParticipantsSelected
                  ? 'Deselect All'
                  : hasActiveMemberSearch
                    ? 'Select All Shown'
                    : 'Select All Trip Members'}
              </button>
            </div>

            <div className="mb-3">
              <PaymentSplitAllocator
                splitType={splitType}
                onSplitTypeChange={setSplitType}
                participants={tripMembers.filter(m => selectedParticipants.includes(m.id))}
                currency={currency}
                totalAmount={amount}
                equalPerPerson={perPersonAmount}
                customAmounts={customAmounts}
                percentages={percentages}
                resolvedAmounts={resolvedAmounts}
                onCustomAmountChange={setCustomAmountForParticipant}
                onPercentageChange={setPercentageForParticipant}
                onRedistributeEvenly={redistributeEvenly}
                validationError={
                  validationError &&
                  (validationError.includes('amount') ||
                    validationError.includes('Percent') ||
                    validationError.includes('Custom'))
                    ? validationError
                    : undefined
                }
              />
            </div>

            {showMemberSearch && (
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={effectiveMemberSearchQuery}
                  onChange={event => handleMemberSearchChange(event.target.value)}
                  placeholder="Search members to split with…"
                  className="pl-9 pr-9"
                  aria-label="Search trip members"
                />
                {isSearchingMembers && (
                  <Loader2
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                )}
              </div>
            )}

            {selectedParticipants.length > 0 && (
              <p className="text-xs text-muted-foreground mb-2">
                {selectedParticipants.length} of {resolvedMemberTotalCount} members selected
              </p>
            )}

            {showMemberSearch && hasActiveMemberSearch && (
              <p className="text-xs text-muted-foreground mb-2">
                Showing {filteredTripMembers.length} of {resolvedMemberTotalCount}
              </p>
            )}

            {/* Auto-suggestions badge */}
            {autoSuggestions.length > 0 && !isDemoMode && (
              <div className="mb-2 flex flex-wrap gap-1">
                {autoSuggestions.slice(0, 3).map(suggestion => {
                  const member = tripMembers.find(m => m.id === suggestion.userId);
                  if (!member) return null;
                  const isSelected = selectedParticipants.includes(suggestion.userId);
                  return (
                    <Badge
                      key={suggestion.userId}
                      variant={isSelected ? 'default' : 'outline'}
                      className="text-xs cursor-pointer hover:bg-emerald-500/20"
                      onClick={() => toggleParticipant(suggestion.userId)}
                    >
                      {member.name}
                      {suggestion.confidence >= 0.7 && <Wand2 size={10} className="ml-1" />}
                    </Badge>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {tripMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No trip members found.</p>
              ) : filteredTripMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No members match your search.</p>
              ) : (
                filteredTripMembers.map(member => {
                  const isSelected = selectedParticipants.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleParticipant(member.id)}
                      aria-label={`${isSelected ? 'Remove' : 'Add'} ${member.name} from split`}
                      aria-pressed={isSelected}
                      className={`
                      inline-flex items-center gap-2 rounded-lg px-3 py-3 min-h-[44px] cursor-pointer transition-all w-auto shrink-0
                      ${
                        isSelected
                          ? 'bg-emerald-500/20 border-2 border-emerald-500 ring-1 ring-emerald-500/30'
                          : 'bg-glass-slate-bg/50 hover:bg-muted/60 border-2 border-transparent'
                      }
                    `}
                    >
                      {/* Checkmark indicator */}
                      <div
                        className={`
                      w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all
                      ${
                        isSelected
                          ? 'bg-emerald-500 text-foreground'
                          : 'bg-muted border border-border'
                      }
                    `}
                      >
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </div>
                      {member.avatar && (
                        <img
                          src={member.avatar}
                          alt={member.name}
                          className="w-6 h-6 rounded-full object-cover shrink-0"
                        />
                      )}
                      <span
                        className={`text-sm whitespace-nowrap ${isSelected ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                      >
                        {member.name}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Preferred Payment Methods - Consistent Grid Layout */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckSquare size={16} className="text-emerald-400" />
                <h4 className="text-sm font-semibold text-muted-foreground">
                  Preferred payment methods
                </h4>
              </div>
              <button
                type="button"
                onClick={selectAllPaymentMethods}
                className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
              >
                {allPaymentMethodsSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3">
              {PAYMENT_METHOD_OPTIONS.map(method => {
                const isSelected = selectedPaymentMethods.includes(method.id);
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => togglePaymentMethod(method.id)}
                    aria-label={`${isSelected ? 'Remove' : 'Add'} ${method.label} as payment method`}
                    aria-pressed={isSelected}
                    className={`
                      flex items-center justify-center gap-2 rounded-lg min-h-[44px] cursor-pointer transition-all
                      ${
                        isSelected
                          ? 'bg-emerald-500/20 border-2 border-emerald-500 ring-1 ring-emerald-500/30'
                          : 'bg-glass-slate-bg border-2 border-glass-slate-border hover:bg-muted/60'
                      }
                    `}
                  >
                    {/* Checkmark indicator */}
                    <div
                      className={`
                      w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all
                      ${
                        isSelected
                          ? 'bg-emerald-500 text-foreground'
                          : 'bg-muted border border-border'
                      }
                    `}
                    >
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </div>
                    <span
                      className={`text-sm ${isSelected ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                    >
                      {method.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional attachments */}
          {showAttachments && (
            <PaymentAttachmentPicker
              pending={attachmentDraft.pending}
              onAddFiles={attachmentDraft.addFiles}
              onAddUrl={attachmentDraft.addUrl}
              onRemove={attachmentDraft.remove}
              disabled={isSubmitting}
            />
          )}

          <Button
            type="submit"
            className="w-full mt-2 py-3 bg-gray-800/80 text-white cta-gold-ring font-semibold rounded-xl shadow-lg transition-all duration-200 hover:opacity-90 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSubmitting || !isValid}
          >
            {isSubmitting ? 'Creating...' : 'Add Payment Request'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
