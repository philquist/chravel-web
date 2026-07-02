import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { InternalAdminRoute } from '@/components/InternalAdminRoute';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useSuperAdmin', () => ({
  useSuperAdmin: vi.fn(),
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: vi.fn(),
}));

import { useAuth } from '@/hooks/useAuth';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { useDemoMode } from '@/hooks/useDemoMode';

const renderGuarded = (allowDemoPreview?: boolean) =>
  render(
    <MemoryRouter initialEntries={['/admin/scheduled-messages']}>
      <Routes>
        <Route
          path="/admin/scheduled-messages"
          element={
            <InternalAdminRoute allowDemoPreview={allowDemoPreview}>
              <div>secret admin page</div>
            </InternalAdminRoute>
          }
        />
        <Route path="/" element={<div>home page</div>} />
        <Route path="/auth" element={<div>auth page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('InternalAdminRoute', () => {
  beforeEach(() => {
    // Default: demo mode off and resolved. Individual tests override as needed.
    vi.mocked(useDemoMode).mockReturnValue({ demoView: 'off', isLoading: false } as never);
  });

  it('renders child for super admin users', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1', email: 'admin@example.com' },
      isLoading: false,
    } as never);
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: true });

    renderGuarded();

    expect(screen.getByText('secret admin page')).toBeInTheDocument();
  });

  it('redirects non-super-admin users away from admin route', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u2', email: 'member@example.com' },
      isLoading: false,
    } as never);
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: false });

    renderGuarded();

    expect(screen.getByText('home page')).toBeInTheDocument();
    expect(screen.queryByText('secret admin page')).not.toBeInTheDocument();
  });

  it('redirects logged-out users to the auth flow', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false } as never);
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: false });

    renderGuarded();

    expect(screen.getByText('auth page')).toBeInTheDocument();
    expect(screen.queryByText('secret admin page')).not.toBeInTheDocument();
  });

  it('allows app-preview demo access when allowDemoPreview is set (mock user, no super admin)', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false } as never);
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: false });
    vi.mocked(useDemoMode).mockReturnValue({ demoView: 'app-preview', isLoading: false } as never);

    renderGuarded(true);

    expect(screen.getByText('secret admin page')).toBeInTheDocument();
  });

  it('does NOT allow demo access without allowDemoPreview', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false } as never);
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: false });
    vi.mocked(useDemoMode).mockReturnValue({ demoView: 'app-preview', isLoading: false } as never);

    renderGuarded(false);

    expect(screen.getByText('auth page')).toBeInTheDocument();
    expect(screen.queryByText('secret admin page')).not.toBeInTheDocument();
  });
});
