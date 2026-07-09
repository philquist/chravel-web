import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SubscriptionStatus from '../SubscriptionStatus';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@chravelapp.com' },
  }),
}));

vi.mock('@/hooks/useConsumerSubscription', () => ({
  useConsumerSubscription: () => ({
    subscription: {
      status: 'active',
      subscriptionEndsAt: '2027-04-05T00:00:00.000Z',
      stripeCustomerId: null,
    },
    tier: 'frequent-chraveler',
    isLoading: false,
    checkSubscription: vi.fn(),
    isSuperAdmin: false,
  }),
}));

vi.mock('@/integrations/revenuecat/revenuecatClient', () => ({
  getCustomerInfo: vi.fn().mockResolvedValue({ success: false, errorCode: 'NOT_SUPPORTED' }),
  isNativePlatform: () => false,
}));

vi.mock('@/components/billing/RestorePurchasesButton', () => ({
  RestorePurchasesButton: () => <button type="button">Restore Purchases</button>,
}));

describe('SubscriptionStatus layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies safe-area top padding on the sticky header for iOS notch/Dynamic Island', () => {
    const { container } = render(
      <MemoryRouter>
        <SubscriptionStatus />
      </MemoryRouter>,
    );

    const header = container.querySelector('header');
    expect(header).toBeTruthy();
    expect(header?.className).toContain('mobile-safe-header');
    expect(header?.className).toContain('sticky');
  });

  it('applies safe-area bottom padding so restore actions stay reachable', () => {
    const { container } = render(
      <MemoryRouter>
        <SubscriptionStatus />
      </MemoryRouter>,
    );

    const content = container.querySelector('.mx-auto.max-w-2xl.space-y-6');
    expect(content).toBeTruthy();
    expect(content?.className).toContain('safe-area-inset-bottom');
  });

  it('renders the subscription management affordances', () => {
    render(
      <MemoryRouter>
        <SubscriptionStatus />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /back/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /subscription/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restore purchases/i })).toBeInTheDocument();
  });
});
