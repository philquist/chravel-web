import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PaymentMethodsSettings } from '../PaymentMethodsSettings';
import { paymentService } from '../../../services/paymentService';
import type { PaymentMethod } from '../../../types/payments';

vi.mock('../../../hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('../../../services/paymentService', () => ({
  paymentService: {
    getUserPaymentMethods: vi.fn(),
    updatePaymentMethod: vi.fn(),
    savePaymentMethod: vi.fn(),
    deletePaymentMethod: vi.fn(),
  },
}));

const preferredVenmo: PaymentMethod = {
  id: 'pm-venmo',
  type: 'venmo',
  identifier: '@camechi',
  displayName: 'Venmo',
  isPreferred: true,
  isVisible: true,
};

describe('PaymentMethodsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentService.getUserPaymentMethods).mockResolvedValue([preferredVenmo]);
  });

  it('shows full platform name with a star for preferred methods (not a Preferred pill)', async () => {
    render(<PaymentMethodsSettings userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Venmo')).toBeInTheDocument();
    });

    expect(screen.queryByText('Preferred')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Preferred payment method' })).toBeInTheDocument();
  });
});
