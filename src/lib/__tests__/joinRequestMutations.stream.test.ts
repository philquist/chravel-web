import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { approveJoinRequestById } from '@/lib/joinRequestMutations';

const mockRpc = vi.fn();
const mockMaybeSingle = vi.fn();
const mockEq1 = vi.fn();
const mockSelect = vi.fn();

const syncTripMemberToStreamAndEmitMemberJoined = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: vi.fn(() => ({
      select: mockSelect,
    })),
  },
}));

vi.mock('@/lib/streamTripMemberInlineActivity', () => ({
  syncTripMemberToStreamAndEmitMemberJoined: (...args: unknown[]) =>
    syncTripMemberToStreamAndEmitMemberJoined(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('approveJoinRequestById Stream activity', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ eq: mockEq1 });
    mockEq1.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockMaybeSingle.mockResolvedValue({
      data: {
        resolved_display_name: 'Alex',
        display_name: null,
        first_name: null,
        last_name: null,
      },
      error: null,
    });
  });

  it('passes emitMemberJoinedMessage false when RPC reports member_inserted false', async () => {
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        trip_id: 'trip-a',
        user_id: 'user-b',
        member_inserted: false,
      },
      error: null,
    });

    await approveJoinRequestById(queryClient, { requestId: 'req-1', tripId: 'trip-a' });

    expect(syncTripMemberToStreamAndEmitMemberJoined).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip-a',
        joiningUserId: 'user-b',
        emitMemberJoinedMessage: false,
      }),
    );
  });

  it('defaults emitMemberJoinedMessage to true when member_inserted is omitted (older RPC)', async () => {
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        trip_id: 'trip-a',
        user_id: 'user-b',
      },
      error: null,
    });

    await approveJoinRequestById(queryClient, { requestId: 'req-1' });

    expect(syncTripMemberToStreamAndEmitMemberJoined).toHaveBeenCalledWith(
      expect.objectContaining({
        emitMemberJoinedMessage: true,
      }),
    );
  });

  it('passes emitMemberJoinedMessage true when member_inserted is true', async () => {
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        trip_id: 'trip-a',
        user_id: 'user-b',
        member_inserted: true,
      },
      error: null,
    });

    await approveJoinRequestById(queryClient, { requestId: 'req-1' });

    expect(syncTripMemberToStreamAndEmitMemberJoined).toHaveBeenCalledWith(
      expect.objectContaining({
        emitMemberJoinedMessage: true,
      }),
    );
  });
});
