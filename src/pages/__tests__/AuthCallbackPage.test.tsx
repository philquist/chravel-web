import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const getSessionMock = vi.fn();
const exchangeCodeForSessionMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
      exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSessionMock(...args),
    },
  },
}));

// Import AFTER mocks so the module picks them up.
import AuthCallbackPage from '../AuthCallbackPage';

function renderAt(url: string) {
  // Reset window.location.hash since AuthCallbackPage reads it directly.
  const [, hash = ''] = url.split('#');
  window.location.hash = hash ? `#${hash}` : '';
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AuthCallbackPage />
    </MemoryRouter>,
  );
}

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    getSessionMock.mockReset();
    exchangeCodeForSessionMock.mockReset();
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('PKCE success: exchanges code, navigates to returnTo, no error UI', async () => {
    getSessionMock
      .mockResolvedValueOnce({ data: { session: null } }) // pre-check
      .mockResolvedValueOnce({ data: { session: { user: { id: 'u1' } } } }); // after exchange
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    renderAt('/auth-callback?code=abc123');

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    });
    expect(exchangeCodeForSessionMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/didn't complete/i)).not.toBeInTheDocument();
  });

  it('Provider error: shows error_description and never navigates to /auth', async () => {
    renderAt('/auth-callback?error=access_denied&error_description=User%20cancelled');

    await waitFor(() => {
      expect(screen.getByText(/Sign-in didn't complete/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/User cancelled/i)).toBeInTheDocument();
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
    // It must NOT auto-redirect anywhere — buttons are user-initiated only.
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('Empty landing: no code/hash/error → fast error, no /auth bounce', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    renderAt('/auth-callback');

    await waitFor(() => {
      expect(screen.getByText(/No sign-in response detected/i)).toBeInTheDocument();
    });
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
