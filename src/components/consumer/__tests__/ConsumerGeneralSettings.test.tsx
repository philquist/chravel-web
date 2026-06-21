import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';

import { ConsumerGeneralSettings } from '../ConsumerGeneralSettings';

const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockNavigate = vi.fn();
const mockToast = vi.fn();
const mockDeleteAccountImmediately = vi.fn();

let mockSession: Session | null = null;

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockSession
      ? {
          id: mockSession.user.id,
          email: mockSession.user.email,
          displayName: 'Traveler',
          namePreference: 'display' as const,
          hasCompletedProfileSetup: true,
          isPro: false,
          showEmail: false,
          showPhone: false,
          permissions: [],
          notificationSettings: {
            messages: true,
            broadcasts: true,
            tripUpdates: true,
            email: true,
            push: true,
          },
        }
      : null,
    session: mockSession,
  }),
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({
    showDemoContent: false,
  }),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    isDarkMode: true,
    toggleTheme: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

vi.mock('@/features/smart-import/components/SmartImportSettings', () => ({
  SmartImportSettings: () => <div>Smart Import Settings</div>,
}));

vi.mock('../BlockedUsersList', () => ({
  BlockedUsersList: () => <div>Blocked Users</div>,
}));

vi.mock('@/lib/accountDeletion', () => ({
  deleteAccountImmediately: (...args: unknown[]) => mockDeleteAccountImmediately(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
  },
}));

function makeSession(provider: 'google' | 'apple' | 'email'): Session {
  return {
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'user-1',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'traveler@example.com',
      app_metadata: { provider, providers: [provider] },
      user_metadata: {},
      identities: [{ provider, identity_id: `${provider}-1` }],
      created_at: '2026-01-01T00:00:00.000Z',
    },
  } as Session;
}

describe('ConsumerGeneralSettings account deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = makeSession('google');
    mockDeleteAccountImmediately.mockResolvedValue({
      success: true,
      message: 'Your account and data have been permanently deleted.',
    });
    mockSignInWithPassword.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({ error: null });
  });

  it('does not ask OAuth users for a password before deleting immediately', async () => {
    const user = userEvent.setup();
    render(<ConsumerGeneralSettings />);

    await user.click(screen.getByRole('button', { name: /delete account/i }));
    expect(screen.queryByPlaceholderText(/enter your password/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no password is required/i)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/type delete to confirm/i), 'DELETE');
    await user.click(screen.getByRole('button', { name: /delete account permanently/i }));

    expect(mockSignInWithPassword).not.toHaveBeenCalled();
    expect(mockDeleteAccountImmediately).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('requires password re-auth for email/password users', async () => {
    mockSession = makeSession('email');
    const user = userEvent.setup();
    render(<ConsumerGeneralSettings />);

    await user.click(screen.getByRole('button', { name: /delete account/i }));
    expect(screen.getByPlaceholderText(/enter your password/i)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/type delete to confirm/i), 'DELETE');
    const submitButton = screen.getByRole('button', { name: /delete account permanently/i });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/enter your password/i), 'secret-password');
    await user.click(submitButton);

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'traveler@example.com',
      password: 'secret-password',
    });
    expect(mockDeleteAccountImmediately).toHaveBeenCalledTimes(1);
  });
});
