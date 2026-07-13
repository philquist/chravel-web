import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentMethodPayButtons } from '../PaymentMethodPayButtons';

const openPaymentApp = vi.fn();

vi.mock('@/hooks/useOpenPaymentApp', () => ({
  useOpenPaymentApp: () => openPaymentApp,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('PaymentMethodPayButtons', () => {
  beforeEach(() => {
    openPaymentApp.mockReset();
  });

  it('renders a Venmo deeplink button that opens the payment app', async () => {
    const user = userEvent.setup();
    render(
      <PaymentMethodPayButtons
        methods={[{ method: 'venmo', identifier: '@meech', isPreferred: true }]}
        amount={42.5}
        note="Dinner"
        payeeName="Alex"
      />,
    );

    const button = screen.getByRole('button', { name: /Pay Alex via Venmo/i });
    expect(button).toBeInTheDocument();
    await user.click(button);

    expect(openPaymentApp).toHaveBeenCalledTimes(1);
    expect(openPaymentApp.mock.calls[0][0]).toMatchObject({
      method: 'venmo',
      canOpenDirectly: true,
      displayHandle: '@meech',
    });
    expect(openPaymentApp.mock.calls[0][0].appUrl).toContain('venmo://paycharge');
  });

  it('renders a copy action for Zelle (no direct pay deeplink)', async () => {
    const user = userEvent.setup();

    render(
      <PaymentMethodPayButtons
        methods={[{ method: 'zelle', identifier: '555-123-4567' }]}
        amount={20}
        payeeName="Sam"
      />,
    );

    const button = screen.getByRole('button', { name: /Copy Sam's Zelle/i });
    expect(button).toBeInTheDocument();
    await user.click(button);
    // Zelle cannot open a pay deep link — only copy / web fallback.
    expect(openPaymentApp).not.toHaveBeenCalled();
  });
});
