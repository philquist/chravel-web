import { describe, expect, it } from 'vitest';
import { generateFallbackResponse } from './chatHelpers';

describe('generateFallbackResponse payments fallback', () => {
  it('does not throw when payments is missing and still returns payment fallback copy', () => {
    expect(() =>
      generateFallbackResponse('what do i owe?', {
        payments: undefined,
      }),
    ).not.toThrow();

    expect(generateFallbackResponse('what do i owe?', { payments: undefined })).toContain(
      'No payment data available yet',
    );
  });

  it('returns outstanding payments summary for unsettled items', () => {
    const response = generateFallbackResponse('payment status', {
      payments: [
        { description: 'Dinner', amount: 80, isSettled: false },
        { description: 'Taxi', amount: 20, isSettled: true },
      ],
    });

    expect(response).toContain('Outstanding Payments');
    expect(response).toContain('Dinner');
    expect(response).toContain('Total Outstanding: $80.00');
  });
});
