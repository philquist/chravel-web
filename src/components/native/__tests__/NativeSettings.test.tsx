import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NativeSettings } from '../NativeSettings';

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ isDarkMode: false, toggleTheme: vi.fn() }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('@/services/hapticService', () => ({
  hapticService: {
    light: vi.fn().mockResolvedValue(undefined),
    warning: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/integrations/revenuecat/revenuecatClient', () => ({
  getPlatform: () => 'web',
}));

// useNotificationPreferences requires an AuthProvider; this spec targets the
// upgrade-press routing, so a static preferences stub is sufficient.
vi.mock('@/hooks/useNotificationPreferences', () => ({
  useNotificationPreferences: () => ({
    preferences: {},
    updatePreference: vi.fn(),
  }),
}));

describe('NativeSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes free-plan upgrade press to subscription navigation on web', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();

    render(<NativeSettings subscriptionTier="free" onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: /free plan/i }));

    expect(onNavigate).toHaveBeenCalledWith('subscription');
  });

  // App Store Guideline 5.1.1: a signed-in user must be able to reach the
  // actionable in-app account-deletion flow. The Delete Account row must open
  // the General Settings deletion surface (?openSettings=settings) — NOT the
  // public /delete-account informational page.
  it('opens the actionable in-app deletion surface from the Delete Account row', async () => {
    const user = userEvent.setup();

    render(<NativeSettings user={{ id: 'u1', email: 'reviewer@example.com', name: 'Reviewer' }} />);

    await user.click(screen.getByRole('button', { name: /delete account/i }));

    expect(navigateMock).toHaveBeenCalledWith('/?openSettings=settings');
  });

  it('does not render the Delete Account row when no user is signed in', () => {
    render(<NativeSettings onNavigate={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /delete account/i })).toBeNull();
  });
});
