import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/features/calendar/hooks/useCalendarEvents', () => ({
  useCalendarEvents: () => ({
    events: [
      {
        id: 'evt-1',
        trip_id: 'trip-layout',
        title: 'Airport Pickup',
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        location: 'Terminal 2',
        event_category: 'transportation',
        include_in_itinerary: true,
        source_type: 'manual',
        source_data: {},
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    loading: false,
    isFetching: false,
    isError: false,
    error: null,
    refreshEvents: vi.fn(),
    deleteEvent: vi.fn(),
    updateEvent: vi.fn(),
  }),
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false, isLoading: false }),
}));

vi.mock('@/hooks/useRolePermissions', () => ({
  useRolePermissions: () => ({ canPerformAction: () => true, isLoading: false }),
}));

vi.mock('@/hooks/useTripMembersQuery', () => ({
  useTripMembersQuery: () => ({
    tripMembers: [{ id: 'm1' }, { id: 'm2' }],
    loading: false,
    hadMembersError: false,
    refreshMembers: vi.fn(),
  }),
}));

vi.mock('@/hooks/useConsumerSubscription', () => ({
  useConsumerSubscription: () => ({
    tier: 'free',
    subscription: null,
    isSuperAdmin: false,
    isPlus: false,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useDeferredPaidAccess', () => ({
  useDeferredPaidAccess: () => false,
}));

vi.mock('@/features/smart-import/hooks/useSmartImportTaste', () => ({
  useSmartImportTaste: () => ({
    canUseFreeImport: true,
    taste: null,
    isLoading: false,
    invalidateTaste: vi.fn(),
  }),
}));

vi.mock('@/features/calendar/hooks/useBackgroundImport', () => ({
  useBackgroundImport: () => ({
    pendingResult: null,
    startImport: vi.fn(),
    clearResult: vi.fn(),
    isImporting: false,
  }),
}));

vi.mock('@/features/calendar/hooks/useCalendarExport', () => ({
  useCalendarExport: () => ({ exportTripEvents: vi.fn() }),
}));

vi.mock('@/hooks/usePullToRefresh', () => ({
  usePullToRefresh: () => ({ isRefreshing: false, pullDistance: 0 }),
}));

vi.mock('@/services/hapticService', () => ({
  hapticService: { medium: vi.fn(), light: vi.fn() },
}));

vi.mock('../CreateEventModal', () => ({
  CreateEventModal: () => null,
}));

vi.mock('@/features/calendar/components/CalendarImportModal', () => ({
  CalendarImportModal: () => null,
}));

import { MobileGroupCalendar } from '../MobileGroupCalendar';

const renderCalendar = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <div style={{ height: 800 }}>
          <MobileGroupCalendar tripId="trip-layout" />
        </div>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('MobileGroupCalendar Day/Month layout', () => {
  it('defaults to Day view with agenda cards and a height-capped mini calendar', () => {
    renderCalendar();

    expect(screen.getByTestId('calendar-view-day')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('calendar-view-month')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('calendar-day-view')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-month-view')).toBeNull();

    expect(screen.getByTestId('calendar-day-event-card')).toHaveTextContent('Airport Pickup');
    expect(screen.getByTestId('calendar-day-event-card')).toHaveTextContent('Terminal 2');

    const miniGrid = screen.getByTestId('calendar-day-mini-grid');
    expect(miniGrid.className).toContain('max-h-[42%]');
    expect(miniGrid.className).toContain('shrink-0');
    expect(miniGrid.className).not.toContain('flex-1');
  });

  it('switches to a distinct Month view with capped grid and selected-day agenda', async () => {
    renderCalendar();

    fireEvent.click(screen.getByTestId('calendar-view-month'));

    expect(screen.getByTestId('calendar-view-month')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('calendar-month-view')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-day-view')).toBeNull();

    const monthGrid = screen.getByTestId('calendar-month-grid');
    expect(monthGrid.className).toContain('max-h-[48%]');
    expect(monthGrid.className).toContain('shrink-0');

    const monthView = screen.getByTestId('calendar-month-view');
    expect(within(monthView).getByText(/Events for/)).toBeInTheDocument();
    expect(within(monthView).getByText('Open Day view')).toBeInTheDocument();
    // Title appears in the compact month cell preview and the agenda strip
    expect(within(monthView).getAllByText('Airport Pickup').length).toBeGreaterThanOrEqual(1);
  });

  it('returns to Day view from the Month agenda link', () => {
    renderCalendar();
    fireEvent.click(screen.getByTestId('calendar-view-month'));
    fireEvent.click(screen.getByText('Open Day view'));

    expect(screen.getByTestId('calendar-day-view')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-view-day')).toHaveAttribute('aria-selected', 'true');
  });
});
