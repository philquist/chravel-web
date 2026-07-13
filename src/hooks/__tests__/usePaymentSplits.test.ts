/**
 * Form-state tests only — no auth, trip access, or settlement ledger mutations.
 * Verifies equal/custom/percentage create payloads before they hit the RPC.
 */
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePaymentSplits } from '../usePaymentSplits';

const members = [
  { id: 'u1', name: 'Alex' },
  { id: 'u2', name: 'Sam' },
  { id: 'u3', name: 'Jordan' },
];

describe('usePaymentSplits custom / percentage', () => {
  it('builds equal payment data by default', () => {
    const { result } = renderHook(() => usePaymentSplits(members));

    act(() => {
      result.current.setAmount(90);
      result.current.setDescription('Dinner');
      result.current.setSelectedParticipants(['u1', 'u2', 'u3']);
      result.current.togglePaymentMethod('venmo');
    });

    const data = result.current.getPaymentData();
    expect(data?.splitType).toBe('equal');
    expect(data?.customAmounts).toEqual({
      u1: 30,
      u2: 30,
      u3: 30,
    });
  });

  it('supports custom amounts that sum to the total', () => {
    const { result } = renderHook(() => usePaymentSplits(members));

    act(() => {
      result.current.setAmount(100);
      result.current.setDescription('Tickets');
      result.current.setSelectedParticipants(['u1', 'u2']);
      result.current.togglePaymentMethod('paypal');
      result.current.setSplitType('custom');
    });

    act(() => {
      result.current.setCustomAmountForParticipant('u1', 70);
      result.current.setCustomAmountForParticipant('u2', 30);
    });

    expect(result.current.isValid).toBe(true);
    const data = result.current.getPaymentData();
    expect(data?.splitType).toBe('custom');
    expect(data?.customAmounts).toEqual({ u1: 70, u2: 30 });
  });

  it('rejects custom amounts that do not sum to total', () => {
    const { result } = renderHook(() => usePaymentSplits(members));

    act(() => {
      result.current.setAmount(100);
      result.current.setDescription('Tickets');
      result.current.setSelectedParticipants(['u1', 'u2']);
      result.current.togglePaymentMethod('venmo');
      result.current.setSplitType('custom');
      result.current.setCustomAmountForParticipant('u1', 70);
      result.current.setCustomAmountForParticipant('u2', 20);
    });

    expect(result.current.isValid).toBe(false);
    expect(result.current.validationError).toMatch(/add up to the total/i);
    expect(result.current.getPaymentData()).toBeNull();
  });

  it('resolves percentage splits into dollar customAmounts', () => {
    const { result } = renderHook(() => usePaymentSplits(members));

    act(() => {
      result.current.setAmount(200);
      result.current.setDescription('Airbnb');
      result.current.setSelectedParticipants(['u1', 'u2']);
      result.current.togglePaymentMethod('cashapp');
      result.current.setSplitType('percentage');
    });

    act(() => {
      result.current.setPercentageForParticipant('u1', 75);
      result.current.setPercentageForParticipant('u2', 25);
    });

    expect(result.current.isValid).toBe(true);
    const data = result.current.getPaymentData();
    expect(data?.splitType).toBe('percentage');
    expect(data?.customAmounts).toEqual({ u1: 150, u2: 50 });
  });
});
