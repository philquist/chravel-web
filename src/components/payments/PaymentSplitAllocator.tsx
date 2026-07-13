/**
 * Split-type selector + per-person amount/% editors for payment create forms.
 * Used by desktop PaymentInput and mobile CreatePaymentModal.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/services/currencyService';
import type { PaymentSplitType } from '@/lib/splitAmountUtils';

export interface SplitParticipantOption {
  id: string;
  name: string;
}

interface PaymentSplitAllocatorProps {
  splitType: PaymentSplitType;
  onSplitTypeChange: (type: PaymentSplitType) => void;
  participants: SplitParticipantOption[];
  currency: string;
  totalAmount: number;
  /** Equal-mode display amount (majority share) */
  equalPerPerson: number;
  customAmounts: Record<string, number>;
  percentages: Record<string, number>;
  resolvedAmounts: Record<string, number>;
  onCustomAmountChange: (participantId: string, value: number) => void;
  onPercentageChange: (participantId: string, value: number) => void;
  onRedistributeEvenly: () => void;
  validationError?: string;
  /** Compact styling for mobile sheet */
  compact?: boolean;
}

const SPLIT_TYPE_OPTIONS: Array<{ id: PaymentSplitType; label: string; hint: string }> = [
  { id: 'equal', label: 'Equal', hint: 'Split evenly' },
  { id: 'custom', label: 'Custom', hint: 'Enter amounts' },
  { id: 'percentage', label: '%', hint: 'By percent' },
];

export const PaymentSplitAllocator: React.FC<PaymentSplitAllocatorProps> = ({
  splitType,
  onSplitTypeChange,
  participants,
  currency,
  totalAmount,
  equalPerPerson,
  customAmounts,
  percentages,
  resolvedAmounts,
  onCustomAmountChange,
  onPercentageChange,
  onRedistributeEvenly,
  validationError,
  compact = false,
}) => {
  return (
    <div className="space-y-3">
      <div
        className="grid grid-cols-3 gap-2"
        role="radiogroup"
        aria-label="How to split this payment"
      >
        {SPLIT_TYPE_OPTIONS.map(option => {
          const selected = splitType === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSplitTypeChange(option.id)}
              className={`
                min-h-[44px] rounded-xl border-2 px-2 py-2 text-center transition-all
                ${
                  selected
                    ? 'border-emerald-500 bg-emerald-500/15 text-foreground ring-1 ring-emerald-500/30'
                    : 'border-border/60 bg-background/40 text-muted-foreground hover:bg-muted/50'
                }
              `}
            >
              <span className="block text-sm font-semibold">{option.label}</span>
              <span className="block text-[11px] opacity-80">{option.hint}</span>
            </button>
          );
        })}
      </div>

      {splitType === 'equal' && participants.length > 0 && equalPerPerson > 0 && (
        <p className={`text-muted-foreground ${compact ? 'text-xs' : 'text-sm'}`}>
          {formatCurrency(equalPerPerson, currency)} each
          {participants.length > 1 ? ` · ${participants.length} people` : ''}
        </p>
      )}

      {(splitType === 'custom' || splitType === 'percentage') && participants.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {splitType === 'custom'
                ? 'Enter how much each person owes'
                : 'Enter each person’s share of the total'}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-[44px] text-xs text-emerald-400 hover:text-emerald-300"
              onClick={onRedistributeEvenly}
              disabled={totalAmount <= 0}
            >
              Split evenly
            </Button>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto native-scroll">
            {participants.map(participant => {
              const dollars = resolvedAmounts[participant.id] ?? customAmounts[participant.id] ?? 0;
              return (
                <div
                  key={participant.id}
                  className="flex items-center gap-2 rounded-lg bg-background/50 px-2 py-2 border border-border/40"
                >
                  <span className="flex-1 min-w-0 text-sm text-foreground truncate">
                    {participant.name}
                  </span>
                  {splitType === 'percentage' ? (
                    <>
                      <div className="relative w-24 shrink-0">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          min={0}
                          max={100}
                          value={percentages[participant.id] ?? ''}
                          onChange={e => onPercentageChange(participant.id, Number(e.target.value))}
                          className="h-10 pr-7 text-right"
                          aria-label={`${participant.name} percentage`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          %
                        </span>
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                        {formatCurrency(dollars, currency)}
                      </span>
                    </>
                  ) : (
                    <div className="relative w-28 shrink-0">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        $
                      </span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        value={customAmounts[participant.id] ?? ''}
                        onChange={e => onCustomAmountChange(participant.id, Number(e.target.value))}
                        className="h-10 pl-5 text-right"
                        aria-label={`${participant.name} amount`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {validationError && splitType !== 'equal' && (
        <p className="text-xs text-amber-400" role="alert">
          {validationError}
        </p>
      )}
    </div>
  );
};
