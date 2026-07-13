/**
 * Regression tests for canonical trip membership hook
 * Ensures Trip Members and Payments stay in sync (single source of truth)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import { useTripMembersQuery } from '../useTripMembersQuery';
import { tripService } from '@/services/tripService';

vi.mock('@/services/tripService', () => ({
  tripService: {
    getTripMembersWithCreator: vi.fn(),
    getTripMemberMeta: vi.fn(),
    listTripMembersPage: vi.fn(),
  },
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/store/demoTripMembersStore', () => ({
  useDemoTripMembersStore: () => 0,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }),
    removeChannel: vi.fn().mockResolvedValue(undefined),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useTripMembersQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tripService.getTripMemberMeta).mockResolvedValue({
      memberCount: 10,
      creatorId: 'user-1',
    });
  });

  it('returns members from getTripMembersWithCreator', async () => {
    vi.mocked(tripService.getTripMembersWithCreator).mockResolvedValue({
      members: [
        { id: 'user-1', name: 'Creator', avatar: undefined, isCreator: true },
        { id: 'user-2', name: 'Member', avatar: undefined, isCreator: false, role: 'admin' },
      ],
      creatorId: 'user-1',
    });

    const { result } = renderHook(() => useTripMembersQuery('trip-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.tripMembers).toHaveLength(2);
    });

    expect(result.current.tripMembers[0].name).toBe('Creator');
    expect(result.current.tripMembers[1].role).toBe('admin');
    expect(result.current.hadMembersError).toBe(false);
  });

  it('sets hadMembersError when fetch fails', async () => {
    vi.mocked(tripService.getTripMembersWithCreator).mockRejectedValue(new Error('Failed to load'));

    const { result } = renderHook(() => useTripMembersQuery('trip-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.hadMembersError).toBe(true);
    });

    expect(result.current.tripMembers).toEqual([]);
  });

  it('includes creator when trip_members is empty (creator fallback)', async () => {
    vi.mocked(tripService.getTripMembersWithCreator).mockResolvedValue({
      members: [{ id: 'creator-1', name: 'Trip Creator', avatar: undefined, isCreator: true }],
      creatorId: 'creator-1',
    });

    const { result } = renderHook(() => useTripMembersQuery('trip-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.tripCreatorId).toBe('creator-1');
    });

    expect(result.current.tripMembers).toHaveLength(1);
    expect(result.current.tripMembers[0].isCreator).toBe(true);
    expect(result.current.tripCreatorId).toBe('creator-1');
  });

  it('uses list_trip_members RPC when paginated roster has an active search', async () => {
    vi.mocked(tripService.getTripMemberMeta).mockResolvedValue({
      memberCount: 75,
      creatorId: 'user-1',
    });
    vi.mocked(tripService.listTripMembersPage).mockResolvedValue({
      members: [{ id: 'user-9', name: 'Sam', avatar: undefined, isCreator: false, role: 'member' }],
      total_count: 1,
      limit: 100,
      offset: 0,
      creatorId: 'user-1',
    });

    const { result } = renderHook(() => useTripMembersQuery('trip-123', { rosterSearch: 'sam' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(tripService.listTripMembersPage).toHaveBeenCalled();
    });

    expect(tripService.listTripMembersPage).toHaveBeenCalledWith('trip-123', {
      search: 'sam',
      offset: 0,
      limit: 100,
    });
    expect(result.current.isPaginatedRoster).toBe(true);
    expect(result.current.tripMembers).toHaveLength(1);
    expect(result.current.tripMembers[0].name).toBe('Sam');
    expect(result.current.memberTotalCount).toBe(1);
  });
});
