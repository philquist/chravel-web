import { describe, it, expect, vi } from 'vitest';
import {
  notifyPaymentRecordedInChat,
  notifyPaymentSettledInChat,
  resolvePaymentActorName,
} from '../paymentActivityMessages';

vi.mock('@/services/systemMessageService', () => ({
  systemMessageService: {
    paymentRecorded: vi.fn().mockResolvedValue(true),
    paymentSettled: vi.fn().mockResolvedValue(true),
  },
}));

import { systemMessageService } from '@/services/systemMessageService';

describe('paymentActivityMessages', () => {
  it('resolves actor display name with email fallback', () => {
    expect(resolvePaymentActorName({ displayName: 'Alex' })).toBe('Alex');
    expect(resolvePaymentActorName({ email: 'alex@chravel.app' })).toBe('alex');
    expect(resolvePaymentActorName(null)).toBe('Someone');
  });

  it('forwards payment recorded events to the chat system message service', () => {
    notifyPaymentRecordedInChat('trip-1', 'Alex', 'pay-1', 50, 'USD', 'Dinner');
    expect(systemMessageService.paymentRecorded).toHaveBeenCalledWith(
      'trip-1',
      'Alex',
      'pay-1',
      50,
      'USD',
      'Dinner',
    );
  });

  it('forwards payment settled events to the chat system message service', () => {
    notifyPaymentSettledInChat('trip-1', 'Alex', 'pay-1', 'Dinner');
    expect(systemMessageService.paymentSettled).toHaveBeenCalledWith(
      'trip-1',
      'Alex',
      'pay-1',
      'Dinner',
    );
  });
});
