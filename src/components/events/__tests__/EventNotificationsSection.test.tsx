import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { EventNotificationsSection } from '../EventNotificationsSection';

const getNotificationPreferences = vi.fn();

vi.mock('@/services/userPreferencesService', () => ({
  userPreferencesService: {
    getNotificationPreferences: (...args: unknown[]) => getNotificationPreferences(...args),
    updateNotificationPreferences: vi.fn(),
  },
}));

const authState = { user: { id: 'user-1', email: 't@example.com' } };

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useNativePush', () => ({
  useNativePush: () => ({
    isNative: false,
    registerForPush: vi.fn(),
    unregisterFromPush: vi.fn(),
  }),
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ showDemoContent: false }),
}));

vi.mock('@/hooks/useConsumerSubscription', () => ({
  useConsumerSubscription: () => ({
    tier: 'free',
    isSuperAdmin: false,
  }),
}));

describe('EventNotificationsSection', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('stops loading and shows defaults when notification preferences fetch never resolves', async () => {
    getNotificationPreferences.mockImplementation(() => new Promise(() => {}));

    render(<EventNotificationsSection />);

    expect(screen.getByText('Loading your saved notification preferences…')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /toggle broadcasts notifications/i })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    await waitFor(() => {
      expect(screen.getByText('Loading your saved notification preferences…')).toBeInTheDocument();
    });
    expect(screen.getByRole('switch', { name: /toggle broadcasts notifications/i })).toBeDisabled();
  });

  it('renders preferences after a successful fetch', async () => {
    getNotificationPreferences.mockResolvedValue({
      push_enabled: true,
      email_enabled: false,
      broadcasts: true,
      calendar_events: true,
      join_requests: true,
      tasks: true,
      polls: true,
      chat_messages: false,
      mentions_only: true,
      payments: true,
      trip_invites: true,
      basecamp_updates: true,
      quiet_hours_enabled: false,
      quiet_start: '22:00',
      quiet_end: '08:00',
      timezone: 'UTC',
    });

    render(<EventNotificationsSection />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 3, name: 'Event Notifications' }),
      ).toBeInTheDocument();
    });

    expect(getNotificationPreferences).toHaveBeenCalledWith('user-1');
  });

  it('hydrates persisted values and overwrites bootstrap values deterministically across refresh/login', async () => {
    getNotificationPreferences
      .mockResolvedValueOnce({
        push_enabled: false,
        email_enabled: true,
        broadcasts: false,
        calendar_events: false,
        join_requests: true,
        tasks: true,
        polls: true,
      })
      .mockResolvedValueOnce({
        push_enabled: true,
        email_enabled: false,
        broadcasts: true,
        calendar_events: true,
        join_requests: false,
        tasks: false,
        polls: false,
      });

    const { rerender } = render(<EventNotificationsSection />);

    const pushToggle = await screen.findByRole('switch', { name: /toggle push notifications/i });
    expect(pushToggle).toHaveAttribute('aria-checked', 'false');

    authState.user = { id: 'user-2', email: 'next@example.com' };
    rerender(<EventNotificationsSection />);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /toggle push notifications/i })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
    expect(getNotificationPreferences).toHaveBeenNthCalledWith(1, 'user-1');
    expect(getNotificationPreferences).toHaveBeenNthCalledWith(2, 'user-2');
  });
});
