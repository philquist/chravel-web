import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  amountsFromPercentageMap,
  getDisplayPerPersonAmount,
  resolveSplitAmounts,
  seedEqualAmountMap,
  seedEqualPercentageMap,
  type PaymentSplitType,
} from '@/lib/splitAmountUtils';
import { PAYMENT_METHOD_OPTIONS } from '@/types/paymentMethods';

/**
 * Create-form state for payment splits (equal / custom / percentage).
 * Does not mutate settlement ledger state — only builds the create payload.
 * Server RPC still validates membership + amount sum before inserting splits.
 */

export interface TripMember {
  id: string;
  name: string;
  avatar?: string;
}

export type PaymentMethodType = 'venmo' | 'cashapp' | 'zelle' | 'paypal' | 'applecash';

export interface PaymentSplitData {
  amount: number;
  currency: string;
  description: string;
  splitCount: number;
  splitParticipants: string[];
  paymentMethods: PaymentMethodType[];
  /** How the split was chosen in the UI */
  splitType: PaymentSplitType;
  /**
   * Per-participant dollar amounts. Always populated for the create path so the
   * server can persist exact shares (equal/custom/percentage all resolve here).
   * Omitted only when validation fails (getPaymentData returns null).
   */
  customAmounts: Record<string, number>;
}

export const SUPPORTED_PAYMENT_METHODS: PaymentMethodType[] = PAYMENT_METHOD_OPTIONS.map(o => o.id);

export const usePaymentSplits = (tripMembers: TripMember[] = []) => {
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<PaymentMethodType[]>([]);
  const [splitCount, setSplitCount] = useState(0);
  const [splitType, setSplitTypeState] = useState<PaymentSplitType>('equal');
  const [customAmounts, setCustomAmounts] = useState<Record<string, number>>({});
  const [percentages, setPercentages] = useState<Record<string, number>>({});

  // Update split count when participants change
  useEffect(() => {
    setSplitCount(selectedParticipants.length);
  }, [selectedParticipants]);

  const seedAllocationsForParticipants = useCallback(
    (participantIds: string[], nextType: PaymentSplitType, nextAmount: number) => {
      if (nextType === 'equal') {
        setCustomAmounts({});
        setPercentages({});
        return;
      }
      if (nextType === 'custom') {
        setCustomAmounts(seedEqualAmountMap(nextAmount, participantIds));
        setPercentages({});
        return;
      }
      // percentage
      const pctMap = seedEqualPercentageMap(participantIds);
      setPercentages(pctMap);
      setCustomAmounts(amountsFromPercentageMap(nextAmount, participantIds, pctMap));
    },
    [],
  );

  const setSplitType = useCallback(
    (nextType: PaymentSplitType) => {
      setSplitTypeState(nextType);
      seedAllocationsForParticipants(selectedParticipants, nextType, amount);
    },
    [amount, selectedParticipants, seedAllocationsForParticipants],
  );

  const redistributeEvenly = useCallback(() => {
    seedAllocationsForParticipants(selectedParticipants, splitType, amount);
  }, [amount, selectedParticipants, splitType, seedAllocationsForParticipants]);

  const toggleParticipant = useCallback(
    (participantId: string) => {
      setSelectedParticipants(prev => {
        const next = prev.includes(participantId)
          ? prev.filter(id => id !== participantId)
          : [...prev, participantId];

        // Keep custom/% maps in sync with selection without wiping user edits
        // for remaining people — new joiners get 0 until redistributed.
        if (splitType === 'custom') {
          setCustomAmounts(current => {
            const updated: Record<string, number> = {};
            for (const id of next) {
              updated[id] = current[id] ?? 0;
            }
            return updated;
          });
        } else if (splitType === 'percentage') {
          setPercentages(current => {
            const updated: Record<string, number> = {};
            for (const id of next) {
              updated[id] = current[id] ?? 0;
            }
            return updated;
          });
        }

        return next;
      });
    },
    [splitType],
  );

  const setCustomAmountForParticipant = useCallback((participantId: string, value: number) => {
    const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
    setCustomAmounts(prev => ({ ...prev, [participantId]: safe }));
  }, []);

  const setPercentageForParticipant = useCallback(
    (participantId: string, value: number) => {
      const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
      setPercentages(prev => {
        const next = { ...prev, [participantId]: safe };
        if (amount > 0 && selectedParticipants.length > 0) {
          setCustomAmounts(amountsFromPercentageMap(amount, selectedParticipants, next));
        }
        return next;
      });
    },
    [amount, selectedParticipants],
  );

  // When total amount changes in percentage mode, refresh dollar preview.
  useEffect(() => {
    if (splitType !== 'percentage' || selectedParticipants.length === 0 || amount <= 0) return;
    setCustomAmounts(amountsFromPercentageMap(amount, selectedParticipants, percentages));
    // Percentages are owned by setter; re-run only when total/selection/type change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, selectedParticipants, splitType]);

  const togglePaymentMethod = useCallback((method: PaymentMethodType) => {
    setSelectedPaymentMethods(prev =>
      prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method],
    );
  }, []);

  const selectAllParticipants = useCallback(() => {
    const allSelected = selectedParticipants.length === tripMembers.length;
    const next = allSelected ? [] : tripMembers.map(m => m.id);
    setSelectedParticipants(next);
    if (!allSelected && splitType !== 'equal') {
      seedAllocationsForParticipants(next, splitType, amount);
    } else if (allSelected) {
      setCustomAmounts({});
      setPercentages({});
    }
  }, [selectedParticipants.length, tripMembers, splitType, amount, seedAllocationsForParticipants]);

  const selectAllPaymentMethods = useCallback(() => {
    const allSelected = selectedPaymentMethods.length === SUPPORTED_PAYMENT_METHODS.length;
    setSelectedPaymentMethods(allSelected ? [] : [...SUPPORTED_PAYMENT_METHODS]);
  }, [selectedPaymentMethods.length]);

  const calculatePerPersonAmount = useCallback((): number => {
    if (splitCount === 0 || splitType !== 'equal') return 0;
    return getDisplayPerPersonAmount(amount, splitCount);
  }, [amount, splitCount, splitType]);

  const resolvedAmounts = useMemo(() => {
    if (selectedParticipants.length === 0 || amount <= 0) return {} as Record<string, number>;
    const result = resolveSplitAmounts(
      splitType,
      amount,
      selectedParticipants,
      customAmounts,
      percentages,
    );
    return 'amounts' in result ? result.amounts : customAmounts;
  }, [splitType, amount, selectedParticipants, customAmounts, percentages]);

  const validatePayment = useCallback((): { isValid: boolean; error?: string } => {
    if (amount <= 0) {
      return { isValid: false, error: 'Amount must be greater than 0' };
    }

    if (!description.trim()) {
      return { isValid: false, error: 'Description is required' };
    }

    if (selectedParticipants.length === 0) {
      return { isValid: false, error: 'At least one participant must be selected' };
    }

    if (selectedPaymentMethods.length === 0) {
      return { isValid: false, error: 'At least one payment method must be selected' };
    }

    if (splitType !== 'equal') {
      const resolved = resolveSplitAmounts(
        splitType,
        amount,
        selectedParticipants,
        customAmounts,
        percentages,
      );
      if ('error' in resolved) {
        return { isValid: false, error: resolved.error };
      }
    }

    return { isValid: true };
  }, [
    amount,
    description,
    selectedParticipants,
    selectedPaymentMethods,
    splitType,
    customAmounts,
    percentages,
  ]);

  const getPaymentData = useCallback((): PaymentSplitData | null => {
    const validation = validatePayment();
    if (!validation.isValid) {
      return null;
    }

    const resolved = resolveSplitAmounts(
      splitType,
      amount,
      selectedParticipants,
      customAmounts,
      percentages,
    );
    if ('error' in resolved) {
      return null;
    }

    return {
      amount,
      currency,
      description: description.trim(),
      splitCount,
      splitParticipants: selectedParticipants,
      paymentMethods: selectedPaymentMethods,
      splitType,
      customAmounts: resolved.amounts,
    };
  }, [
    amount,
    currency,
    description,
    splitCount,
    selectedParticipants,
    selectedPaymentMethods,
    splitType,
    customAmounts,
    percentages,
    validatePayment,
  ]);

  const resetForm = useCallback(() => {
    setAmount(0);
    setCurrency('USD');
    setDescription('');
    setSelectedParticipants([]);
    setSelectedPaymentMethods([]);
    setSplitCount(0);
    setSplitTypeState('equal');
    setCustomAmounts({});
    setPercentages({});
  }, []);

  return {
    // State
    amount,
    currency,
    description,
    selectedParticipants,
    selectedPaymentMethods,
    splitCount,
    splitType,
    customAmounts,
    percentages,
    resolvedAmounts,

    // Computed
    perPersonAmount: calculatePerPersonAmount(),
    isValid: validatePayment().isValid,
    validationError: validatePayment().error,
    allParticipantsSelected: selectedParticipants.length === tripMembers.length,
    allPaymentMethodsSelected: selectedPaymentMethods.length === SUPPORTED_PAYMENT_METHODS.length,

    // Actions
    setAmount,
    setCurrency,
    setDescription,
    setSelectedParticipants,
    setSplitType,
    setCustomAmountForParticipant,
    setPercentageForParticipant,
    redistributeEvenly,
    toggleParticipant,
    togglePaymentMethod,
    selectAllParticipants,
    selectAllPaymentMethods,
    getPaymentData,
    validatePayment,
    resetForm,
  };
};
