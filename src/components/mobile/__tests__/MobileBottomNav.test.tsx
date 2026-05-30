import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { MobileBottomNav } from '@/components/mobile/MobileBottomNav';

vi.mock('@/hooks/useRecsAccess', () => ({ useRecsAccess: vi.fn() }));
vi.mock('@/services/hapticService', () => ({
  hapticService: { light: vi.fn(), selectionChanged: vi.fn() },
}));

import { useRecsAccess } from '@/hooks/useRecsAccess';

const renderNav = () =>
  render(
    <MemoryRouter>
      <MobileBottomNav />
    </MemoryRouter>,
  );

describe('MobileBottomNav — Recs visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the Recs tab when the user can access Recs', () => {
    vi.mocked(useRecsAccess).mockReturnValue({
      canAccessRecs: true,
      isSuperAdmin: true,
      isAppPreview: false,
    });

    renderNav();
    expect(screen.getByText('Recs')).toBeInTheDocument();
  });

  it('hides the Recs tab entirely for non-eligible users (no teaser)', () => {
    vi.mocked(useRecsAccess).mockReturnValue({
      canAccessRecs: false,
      isSuperAdmin: false,
      isAppPreview: false,
    });

    renderNav();
    expect(screen.queryByText('Recs')).not.toBeInTheDocument();
    // The other tabs remain.
    expect(screen.getByText('Trips')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
