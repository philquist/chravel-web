import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { SubscriptionPaywall, SubscriptionStatusBadge } from '../SubscriptionPaywall';

vi.mock('@/integrations/revenuecat/revenuecatClient', () => ({
  isNativePlatform: () => false,
}));

describe('SubscriptionPaywall', () => {
  it('renders adapter-only copy on web', () => {
    render(<SubscriptionPaywall />);

    expect(screen.getByText('In-app purchases are mobile-only')).toBeInTheDocument();
    expect(
      screen.getByText(/Open ChravelApp mobile app to manage subscriptions/i),
    ).toBeInTheDocument();
  });

  it('calls onClose when close button is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<SubscriptionPaywall onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close paywall' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SubscriptionStatusBadge', () => {
  it('renders known status label', () => {
    render(<SubscriptionStatusBadge status="active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});
