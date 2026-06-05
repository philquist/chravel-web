import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import { useTripDetailData } from '../useTripDetailData';
import { tripService, type Trip } from '@/services/tripService';

vi.mock('@/services/tripService', () => ({
  tripService: {
    getTripById: vi.fn(),
    getTripMembersWithCreator: vi.fn(),
  },
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', displayName: 'Member One', avatar: null },
    session: { user: { id: 'user-1' } },
    isLoading: false,
    // 🔒 The hook gates queries on a fully *hydrated* auth session (isHydrated &&
    // !isLoading). Without this the hook is stuck in its loading state forever.
    isHydrated: true,
  }),
}));

vi.mock('@/store/demoTripMembersStore', () => {
  // Used both as a selector hook (useDemoTripMembersStore(selector)) and imperatively
  // (useDemoTripMembersStore.getState().getAddedMembers(tripId)) inside the demo path.
  const store: { (): number; getState: () => { getAddedMembers: () => unknown[] } } = (() =>
    0) as never;
  store.getState = () => ({ getAddedMembers: () => [] });
  return { useDemoTripMembersStore: store };
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    // The hook sets its own per-query retry policy (which overrides the client default),
    // so error-path tests DO retry. Collapse the backoff to 0 so those retries settle
    // within the test instead of leaking pending timers into the next test (flaky failures).
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useTripDetailData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns trip data when row exists and membership is valid', async () => {
    const trip: Trip = {
      id: 'trip-1',
      name: 'Trip One',
      created_by: 'user-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_archived: false,
      trip_type: 'consumer',
    };
    vi.mocked(tripService.getTripById).mockResolvedValue(trip);
    vi.mocked(tripService.getTripMembersWithCreator).mockResolvedValue({
      members: [{ id: 'user-1', name: 'Member One', isCreator: true }],
      creatorId: 'user-1',
    });

    const { result } = renderHook(() => useTripDetailData('trip-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.trip?.id).toBe('trip-1');
    expect(result.current.tripError).toBeNull();
  });

  it('returns explicit access denied error when trip exists but user is not a member', async () => {
    vi.mocked(tripService.getTripById).mockRejectedValue(new Error('ACCESS_DENIED'));
    vi.mocked(tripService.getTripMembersWithCreator).mockRejectedValue(new Error('ACCESS_DENIED'));

    const { result } = renderHook(() => useTripDetailData('trip-2'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.trip).toBeNull();
    expect(result.current.tripError?.message).toContain('ACCESS_DENIED');
  });

  it('serves canonical demo data for numeric demo trip ids even when isDemoMode is false', async () => {
    // 🔒 RESILIENCE (root-cause fix for "Couldn't Load Trip"): the demo fast path is gated on
    // the structural isDemoTrip() check, NOT on the fragile isDemoMode flag (mocked false here).
    // A numeric demo id must load local data with no network call, no auth requirement, and no
    // error — even when the demo-mode flag is off (e.g. cleared by a race during onboarding).
    const { result } = renderHook(() => useTripDetailData('1'), {
      wrapper: createWrapper(),
    });

    // Synchronous demo path — resolves immediately, never enters loading/error.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.tripError).toBeNull();
    expect(result.current.trip?.id).toBe(1);
    expect(result.current.tripMembers.length).toBeGreaterThan(0);
    // Critically: no Supabase fetch is attempted for a demo trip id.
    expect(tripService.getTripById).not.toHaveBeenCalled();
  });

  it('maps missing trip row to not-found outcome (null trip without access-denied error)', async () => {
    vi.mocked(tripService.getTripById).mockResolvedValue(null);
    vi.mocked(tripService.getTripMembersWithCreator).mockRejectedValue(new Error('TRIP_NOT_FOUND'));

    const { result } = renderHook(() => useTripDetailData('trip-missing'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.trip).toBeNull();
    expect(result.current.tripError).toBeNull();
  });
});
