import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Regression: the desktop GroupCalendar (useCalendarManagement) injects
// dynamic demo events for the Cancun demo trip (id "1"), but the mobile
// calendar fetched only persisted events — so demo mode showed
// "No events for this day." on phones while desktop showed a full day.
// MobileGroupCalendar must merge demoModeService.getDynamicDemoEventsForDate.

vi.mock('@/features/calendar/hooks/useCalendarEvents', () => ({
  useCalendarEvents: () => ({
    events: [], // no persisted events — demo injection must fill the day list
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
  useDemoMode: () => ({ isDemoMode: true, isLoading: false }),
}));

vi.mock('@/hooks/useRolePermissions', () => ({
  useRolePermissions: () => ({ canPerformAction: () => true, isLoading: false }),
}));

vi.mock('@/hooks/useTripMembersQuery', () => ({
  useTripMembersQuery: () => ({
    tripMembers: [],
    loading: false,
    hadMembersError: false,
    refreshMembers: vi.fn(),
  }),
}));

vi.mock('@/hooks/useConsumerSubscription', () => ({
  useConsumerSubscription: () => ({ isPlus: false, isLoading: false }),
}));

vi.mock('@/hooks/useDeferredPaidAccess', () => ({
  useDeferredPaidAccess: () => ({ hasPaidAccess: false, isLoading: false }),
}));

vi.mock('@/features/smart-import/hooks/useSmartImportTaste', () => ({
  useSmartImportTaste: () => ({
    taste: null,
    isLoading: false,
    invalidateTaste: vi.fn(),
  }),
}));

vi.mock('@/features/calendar/hooks/useBackgroundImport', () => ({
  useBackgroundImport: () => ({ startImport: vi.fn(), isImporting: false }),
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

import { MobileGroupCalendar } from '../MobileGroupCalendar';

const renderCalendar = (tripId: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MobileGroupCalendar tripId={tripId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('MobileGroupCalendar demo-mode dynamic events', () => {
  it('shows the Cancun dynamic demo events for the selected day (trip 1)', () => {
    renderCalendar('1');
    // Real demoModeService output — wiring test, not a mock echo.
    expect(screen.getByText('Jet Skis + Beach Morning')).toBeInTheDocument();
    expect(screen.queryByText('No events for this day.')).toBeNull();
  });

  it('does not inject Cancun events into other demo trips', () => {
    renderCalendar('2');
    expect(screen.queryByText('Jet Skis + Beach Morning')).toBeNull();
    expect(screen.getByText('No events for this day.')).toBeInTheDocument();
  });
});
