import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePendingRequestTripCards } from '../usePendingRequestTripCards';

const rpcMock = vi.fn();
const pendingRequestsSelectEqStatusMock = vi.fn();
const pendingRequestsSelectEqUserMock = vi.fn();
const pendingRequestsSelectMock = vi.fn();
const tripsSelectInMock = vi.fn();
const tripsSelectMock = vi.fn();
const fromMock = vi.fn((table: string) => {
  if (table === 'trip_join_requests') return { select: pendingRequestsSelectMock };
  if (table === 'trips') return { select: tripsSelectMock };
  throw new Error(`Unexpected table ${table}`);
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const channelOnMock = vi.fn();
const channelSubscribeMock = vi.fn();
const removeChannelMock = vi.fn();
const channelMock = vi.fn((_name: string) => {
  const channel = {
    on: (...args: unknown[]) => {
      channelOnMock(...args);
      return channel;
    },
    subscribe: (...args: unknown[]) => {
      channelSubscribeMock(...args);
      return channel;
    },
  };
  return channel;
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (table: string) => fromMock(table),
    channel: (name: string) => channelMock(name),
    removeChannel: (...args: unknown[]) => removeChannelMock(...args),
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

describe('usePendingRequestTripCards', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockClear();
    pendingRequestsSelectEqStatusMock.mockReset();
    pendingRequestsSelectEqUserMock.mockReset();
    pendingRequestsSelectMock.mockReset();
    tripsSelectInMock.mockReset();
    tripsSelectMock.mockReset();

    pendingRequestsSelectEqUserMock.mockReturnValue({ eq: pendingRequestsSelectEqStatusMock });
    pendingRequestsSelectMock.mockReturnValue({ eq: pendingRequestsSelectEqUserMock });
    tripsSelectMock.mockReturnValue({ in: tripsSelectInMock });
  });

  it('hydrates pending request cards from RPC rows', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          request_id: 'req-1',
          trip_id: 'trip-1',
          trip_type: 'consumer',
          requested_at: '2026-04-01T00:00:00Z',
          title: 'Investfest Chat',
          destination: 'Paris, France',
          start_date: '2026-04-20',
          end_date: '2026-06-25',
          cover_image_url: 'https://example.com/cover.jpg',
          member_count: 3,
          places_count: 4,
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => usePendingRequestTripCards(false), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.cards).toHaveLength(1);
    expect(result.current.cards[0]).toMatchObject({
      requestId: 'req-1',
      tripId: 'trip-1',
      title: 'Investfest Chat',
      destination: 'Paris, France',
      peopleCount: 3,
      placesCount: 4,
    });
    expect(result.current.cards[0].dateLabel).toContain('Apr');
    expect(result.current.cards[0].dateLabel).toContain('Jun');
  });

  it('drops rows with missing trip title instead of rendering placeholders', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          request_id: 'req-2',
          trip_id: 'trip-2',
          trip_type: 'consumer',
          requested_at: '2026-04-01T00:00:00Z',
          title: null,
          destination: null,
          start_date: null,
          end_date: null,
          cover_image_url: null,
          member_count: null,
          places_count: null,
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => usePendingRequestTripCards(false), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.cards).toHaveLength(0);
  });

  it('uses fallback table queries when RPC succeeds but returns empty rows', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    pendingRequestsSelectEqStatusMock.mockResolvedValueOnce({
      data: [{ id: 'req-3', trip_id: 'trip-3', created_at: '2026-04-02T00:00:00Z' }],
      error: null,
    });
    tripsSelectInMock.mockResolvedValueOnce({
      data: [
        {
          id: 'trip-3',
          trip_type: 'event',
          name: 'Fallback Trip',
          destination: 'Austin, TX',
          start_date: '2026-04-30',
          end_date: '2026-05-02',
          cover_image_url: null,
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => usePendingRequestTripCards(false), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.cards).toHaveLength(1);
    expect(result.current.cards[0]).toMatchObject({
      requestId: 'req-3',
      tripId: 'trip-3',
      title: 'Fallback Trip',
      tripType: 'event',
    });
    expect(fromMock).toHaveBeenCalledWith('trip_join_requests');
    expect(fromMock).toHaveBeenCalledWith('trips');
  });
});
