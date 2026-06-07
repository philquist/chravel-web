import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TripGrid } from '../TripGrid';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'default' }),
  };
});

vi.mock('../../TripCard', () => ({
  TripCard: ({
    trip,
    pendingApproval,
    pendingSecondaryActionLabel,
  }: {
    trip: { title: string };
    pendingApproval?: boolean;
    pendingSecondaryActionLabel?: string;
  }) => (
    <div data-testid="trip-card">
      <span>{trip.title}</span>
      <span>{pendingApproval ? 'pending-enabled' : 'standard'}</span>
      {pendingSecondaryActionLabel ? <span>{pendingSecondaryActionLabel}</span> : null}
    </div>
  ),
}));

vi.mock('../../EventCard', () => ({ EventCard: () => null }));
vi.mock('../../MobileEventCard', () => ({ MobileEventCard: () => null }));
vi.mock('../../RecommendationCard', () => ({ RecommendationCard: () => null }));
vi.mock('../LocationSearchBar', () => ({ LocationSearchBar: () => null }));
vi.mock('../ArchivedTripCard', () => ({ ArchivedTripCard: () => null }));
vi.mock('../../UpgradeModal', () => ({ UpgradeModal: () => null }));
vi.mock('../../../contexts/SwipeableRowContext', () => ({
  SwipeableRowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../SwipeableTripCardWrapper', () => ({
  SwipeableTripCardWrapper: () => null,
  SwipeableProTripCardWrapper: () => null,
}));
vi.mock('../../../hooks/use-mobile', () => ({ useIsMobile: () => false }));

// Guardrail: Requests tab rendering must not depend on useDashboardJoinRequests.
vi.mock('@/hooks/useDashboardJoinRequests', () => ({
  useDashboardJoinRequests: () => {
    throw new Error('useDashboardJoinRequests must not be used by outbound requests rendering');
  },
}));

vi.mock('../../../hooks/useDeleteTrip', () => ({ useDeleteTrip: () => ({ deleteTrip: vi.fn() }) }));
vi.mock('../../../hooks/useLocationFilteredRecommendations', () => ({
  useLocationFilteredRecommendations: () => ({
    recommendations: [],
    activeLocation: '',
    isBasecampLocation: false,
  }),
}));
vi.mock('@/hooks/useSavedRecommendations', () => ({ useSavedRecommendations: () => ({}) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useDemoMode', () => ({ useDemoMode: () => ({ isDemoMode: false }) }));
vi.mock('@/hooks/useConsumerSubscription', () => ({
  useConsumerSubscription: () => ({ tier: 'pro' }),
}));
const sortableTripGridProps: Array<{ onLongPressEnterReorder?: () => void }> = [];
vi.mock('../../dashboard/SortableTripGrid', () => ({
  SortableTripGrid: (props: { onLongPressEnterReorder?: () => void }) => {
    sortableTripGridProps.push(props);
    return null;
  },
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      delete: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ error: null }) }) }) }),
    }),
  },
}));

describe('TripGrid requests tab', () => {
  it('does not render pending trip cards in my trips view outside requests filter', () => {
    render(<TripGrid viewMode="myTrips" trips={[]} proTrips={{}} events={{}} activeFilter="all" />);

    expect(screen.queryByText('pending-enabled')).not.toBeInTheDocument();
  });

  it('renders empty requests state when no pending request cards are provided', () => {
    render(
      <TripGrid
        viewMode="myTrips"
        trips={[]}
        proTrips={{}}
        events={{}}
        activeFilter="requests"
        pendingRequestCards={[]}
      />,
    );

    expect(screen.getByText('No pending requests')).toBeInTheDocument();
    expect(screen.queryByText('Pending Trip')).not.toBeInTheDocument();
  });

  it('marks card grids with responsive trips layout classes', () => {
    const { container } = render(
      <TripGrid
        viewMode="myTrips"
        trips={[]}
        proTrips={{}}
        events={{}}
        activeFilter="requests"
        pendingRequestCards={[
          {
            requestId: 'req-layout',
            tripId: 'trip-layout',
            tripType: 'consumer',
            requestedAt: null,
            title: 'Layout Trip',
            destination: 'Tokyo',
            startDate: '2026-05-01',
            endDate: '2026-05-06',
            dateLabel: 'May 1, 2026 - May 6, 2026',
            coverImageUrl: null,
            peopleCount: 3,
            placesCount: 4,
          },
        ]}
      />,
    );

    expect(container.querySelector('.trips-mobile-scroll-safe')).toBeInTheDocument();
    expect(container.querySelector('.trips-responsive-grid')).toBeInTheDocument();
  });

  it('renders pending request cards in Requests using standard TripCard pending mode', () => {
    render(
      <TripGrid
        viewMode="myTrips"
        trips={[]}
        proTrips={{}}
        events={{}}
        activeFilter="requests"
        pendingRequestCards={[
          {
            requestId: 'req-100',
            tripId: 'trip-100',
            tripType: 'consumer',
            requestedAt: null,
            title: 'Pending via Trips Query',
            destination: 'Paris',
            startDate: '2026-04-01',
            endDate: '2026-04-08',
            dateLabel: 'Apr 1, 2026 - Apr 8, 2026',
            coverImageUrl: null,
            peopleCount: 2,
            placesCount: 0,
          },
        ]}
      />,
    );

    expect(screen.getByText('Pending via Trips Query')).toBeInTheDocument();
    expect(screen.getByText('pending-enabled')).toBeInTheDocument();
    expect(screen.getByText('Cancel request')).toBeInTheDocument();
  });

  it('shows empty requests state when the RPC returns no pending-card rows', () => {
    render(
      <TripGrid
        viewMode="myTrips"
        trips={[]}
        proTrips={{}}
        events={{}}
        activeFilter="requests"
        pendingRequestCards={[]}
      />,
    );

    expect(screen.getByText('No pending requests')).toBeInTheDocument();
    expect(screen.queryByText('Outbound Source Of Truth')).not.toBeInTheDocument();
  });

  it('does not render pending request cards in standard My Trips mode', () => {
    render(<TripGrid viewMode="myTrips" trips={[]} proTrips={{}} events={{}} activeFilter="all" />);

    expect(screen.queryByText('Requests Only Trip')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel request')).not.toBeInTheDocument();
  });

  it('exits reorder mode when activeTab changes from "trips" to a different tab', () => {
    sortableTripGridProps.length = 0;
    const trip = {
      id: 1,
      title: 'Trip A',
      location: 'Paris',
      dateRange: 'May 1 - May 8',
      participants: [],
    };
    const { rerender } = render(
      <TripGrid
        viewMode="myTrips"
        trips={[trip]}
        proTrips={{}}
        events={{}}
        activeFilter="all"
        activeTab="trips"
      />,
    );

    // Capture the latest long-press handler and fire it to enter reorder mode.
    const enterReorder =
      sortableTripGridProps[sortableTripGridProps.length - 1]?.onLongPressEnterReorder;
    expect(enterReorder).toBeTypeOf('function');
    act(() => {
      enterReorder?.();
    });

    expect(screen.getByText('Drag to reorder')).toBeInTheDocument();

    // Simulate a mobile tab switch — pathname does not change, only activeTab.
    rerender(
      <TripGrid
        viewMode="myTrips"
        trips={[trip]}
        proTrips={{}}
        events={{}}
        activeFilter="all"
        activeTab="alerts"
      />,
    );

    expect(screen.queryByText('Drag to reorder')).not.toBeInTheDocument();
  });
});
