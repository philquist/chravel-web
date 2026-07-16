/**
 * PlacesSection — header layout regression (narrow viewport / Android WebView overlap)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlacesSection } from '../PlacesSection';

vi.mock('@/contexts/TripVariantContext', () => ({
  useTripVariant: () => ({ variant: 'consumer' }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}));

vi.mock('@/hooks/useTripBasecamp', () => ({
  useTripBasecamp: () => ({ data: null, isLoading: false }),
  tripBasecampKeys: { trip: (id: string) => ['tripBasecamp', id] as const },
}));

vi.mock('@/hooks/usePersonalBasecamp', () => ({
  usePersonalBasecamp: () => ({ data: null }),
  personalBasecampKeys: {
    tripUser: (tripId: string, userId: string) => ['personalBasecamp', tripId, userId] as const,
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const chainable: { on: () => typeof chainable; subscribe: () => Record<string, unknown> } = {
    on: () => chainable,
    subscribe: () => ({}),
  };
  return {
    supabase: {
      channel: () => chainable,
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('@/services/tripPlacesService', () => ({
  fetchTripPlaces: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/components/mobile/PullToRefreshIndicator', () => ({
  PullToRefreshIndicator: () => null,
}));

vi.mock('@/components/places/BasecampsPanel', () => ({
  BasecampsPanel: () => <div data-testid="basecamps-panel" />,
}));

vi.mock('@/components/places/LinksPanel', () => ({
  LinksPanel: () => <div data-testid="links-panel" />,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('PlacesSection header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a column layout container on small screens so title and tab pills do not overlap', () => {
    render(<PlacesSection tripId="trip-1" />, { wrapper });

    const header = screen.getByTestId('places-section-header');
    expect(header).toHaveClass('flex-col');
    expect(header).toHaveClass('md:flex-row');
    expect(header).toHaveClass('px-4');
    expect(header).toHaveClass('lg:px-0');
    expect(screen.getByTestId('places-subtab-rail')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Places' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Base Camps' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore' })).toBeInTheDocument();
    expect(screen.getByTestId('places-subtab-links').className).toContain(
      'mobile-trip-filter-pill',
    );
  });

  it('switches to Explore tab when Explore is clicked', async () => {
    const user = userEvent.setup();
    render(<PlacesSection tripId="trip-1" />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Explore' }));

    expect(await screen.findByTestId('links-panel')).toBeInTheDocument();
  });
});
