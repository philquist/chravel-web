import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const deviceLikelyAuthenticated = vi.fn();

vi.mock('@/lib/bootAuthMarker', () => ({
  deviceLikelyAuthenticated: () => deviceLikelyAuthenticated(),
}));

vi.mock('@/components/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

import { BootHydrationFallback } from '../DashboardSkeleton';

describe('BootHydrationFallback', () => {
  beforeEach(() => {
    deviceLikelyAuthenticated.mockReset();
  });

  it('shows a branded non-spinner boot screen for first-run anonymous app opens', () => {
    deviceLikelyAuthenticated.mockReturnValue(false);

    render(<BootHydrationFallback />);

    expect(screen.getByLabelText('Opening Chravel')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('keeps authenticated cold starts on the dashboard skeleton', () => {
    deviceLikelyAuthenticated.mockReturnValue(true);

    render(<BootHydrationFallback />);

    expect(screen.getByLabelText('Loading your trips')).toBeInTheDocument();
  });
});
