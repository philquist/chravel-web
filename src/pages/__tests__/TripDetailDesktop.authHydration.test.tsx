import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { TripDetailDesktop } from '../TripDetailDesktop';

const mockUseTripDetailData = vi.fn();

vi.mock('../../hooks/useTripDetailData', () => ({
  useTripDetailData: (...args: unknown[]) => mockUseTripDetailData(...args),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isLoading: false, isHydrated: true }),
}));

vi.mock('../../hooks/useDemoMode', () => ({ useDemoMode: () => ({ isDemoMode: false }) }));
vi.mock('../../hooks/useTripMembers', () => ({
  useTripMembers: () => ({ canRemoveMembers: true, removeMember: vi.fn(), leaveTrip: vi.fn() }),
}));
vi.mock('../../hooks/usePendingActions', () => ({ usePendingActions: vi.fn() }));
vi.mock('../../hooks/usePerformanceMonitor', () => ({ usePerformanceMonitor: vi.fn() }));
vi.mock('../../data/tripsData', () => ({ generateTripMockData: () => ({}) }));

const createClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const renderPage = () =>
  render(
    <QueryClientProvider client={createClient()}>
      <MemoryRouter initialEntries={['/trip/abc-123']}>
        <Routes>
          <Route path="/trip/:tripId" element={<TripDetailDesktop />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('TripDetailDesktop auth hydration states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render Trip Not Found before auth hydration completes', () => {
    mockUseTripDetailData.mockReturnValue({
      trip: null,
      tripMembers: [],
      tripCreatorId: null,
      isLoading: false,
      isMembersLoading: false,
      isAuthLoading: true,
      tripError: null,
      membersError: null,
    });

    renderPage();

    expect(screen.queryByText('Trip Not Found')).not.toBeInTheDocument();
  });

  it('renders Trip Not Found only after auth resolves and trip query resolves empty', () => {
    mockUseTripDetailData.mockReturnValue({
      trip: null,
      tripMembers: [],
      tripCreatorId: null,
      isLoading: false,
      isMembersLoading: false,
      isAuthLoading: false,
      tripError: null,
      membersError: null,
    });

    renderPage();

    expect(screen.getByText('Trip Not Found')).toBeInTheDocument();
  });
});
