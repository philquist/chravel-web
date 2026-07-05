import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import JoinTrip from '../JoinTrip';

const mockInvoke = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockSignUp = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    signIn: vi.fn(),
    signInWithGoogle: (...args: unknown[]) => mockSignInWithOAuth('google', ...args),
    signInWithApple: (...args: unknown[]) => mockSignInWithOAuth('apple', ...args),
    signUp: (...args: unknown[]) => mockSignUp(...args),
    resetPassword: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: (table: string) => {
      if (table === 'trip_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => mockMaybeSingle(),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

describe('JoinTrip auth modal', () => {
  const createWrapper = ({ children }: { children: React.ReactNode }) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        invite: {
          trip_id: '11111111-1111-4111-8111-111111111111',
          is_active: true,
          expires_at: null,
          max_uses: null,
          current_uses: 0,
          require_approval: true,
        },
        trip: {
          name: 'Festival Weekend',
          destination: 'Los Angeles',
          start_date: '2026-05-02',
          end_date: '2026-05-11',
          cover_image_url: null,
          trip_type: 'consumer',
          member_count: 5,
        },
      },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockSignInWithOAuth.mockResolvedValue({});
    mockSignUp.mockResolvedValue({ success: 'Check your email' });
  });

  it('opens the canonical auth modal from invite CTAs and forwards invite returnTo to OAuth', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/join/chravelhmbehnbu']}>
        <Routes>
          <Route path="/join/:token" element={<JoinTrip />} />
        </Routes>
      </MemoryRouter>,
      { wrapper: createWrapper },
    );

    const signupButton = await screen.findByRole('button', { name: /continue to sign up/i });
    await user.click(signupButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /^google$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^apple$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^google$/i }));

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith('google', '/join/chravelhmbehnbu');
    });
  });

  it('forwards invite returnTo to email signup so confirmation links preserve the invite', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/join/chravelhmbehnbu']}>
        <Routes>
          <Route path="/join/:token" element={<JoinTrip />} />
        </Routes>
      </MemoryRouter>,
      { wrapper: createWrapper },
    );

    const signupButton = await screen.findByRole('button', { name: /continue to sign up/i });
    await user.click(signupButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('John'), 'Ada');
    await user.type(screen.getByPlaceholderText('Doe'), 'Lovelace');
    await user.type(screen.getByPlaceholderText('your@email.com'), 'ada@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'sup3r-secret!');

    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith(
        'ada@example.com',
        'sup3r-secret!',
        'Ada',
        'Lovelace',
        '/join/chravelhmbehnbu',
      );
    });
  });
});
