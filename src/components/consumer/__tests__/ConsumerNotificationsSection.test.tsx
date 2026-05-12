import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsumerNotificationsSection } from '../ConsumerNotificationsSection';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getNotificationPreferences: vi.fn(),
    updateNotificationPreferences: vi.fn(),
  },
}));

vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('../../../hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../../../hooks/useNativePush', () => ({
  useNativePush: () => ({ isNative: false, registerForPush: vi.fn(), unregisterFromPush: vi.fn() }),
}));
vi.mock('../../../hooks/useDemoMode', () => ({ useDemoMode: () => ({ showDemoContent: false }) }));
vi.mock('@/hooks/useConsumerSubscription', () => ({
  useConsumerSubscription: () => ({ tier: 'explorer', isSuperAdmin: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    })),
  },
}));
vi.mock('../../../services/userPreferencesService', () => ({
  userPreferencesService: {
    getNotificationPreferences: mocks.getNotificationPreferences,
    updateNotificationPreferences: mocks.updateNotificationPreferences,
  },
}));

describe('ConsumerNotificationsSection loading hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables toggles until preferences hydrate and then applies fetched values', async () => {
    let resolvePrefs: (value: unknown) => void = () => undefined;
    mocks.getNotificationPreferences.mockReturnValue(
      new Promise(resolve => {
        resolvePrefs = resolve;
      }),
    );

    render(<ConsumerNotificationsSection />);

    const broadcastsToggle = screen.getAllByRole('switch')[0];
    expect(broadcastsToggle).toBeDisabled();
    expect(screen.getByText(/loading saved preferences/i)).toBeInTheDocument();

    resolvePrefs({ broadcasts: false, push_enabled: true });

    await waitFor(() => expect(broadcastsToggle).not.toBeDisabled());
    expect(broadcastsToggle).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(broadcastsToggle);
    expect(mocks.updateNotificationPreferences).toHaveBeenCalledWith('user-1', {
      broadcasts: true,
    });
  });
});
