import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { approveJoinRequestById } from '../joinRequestMutations';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/streamTripMemberInlineActivity', () => ({
  syncTripMemberToStreamAndEmitMemberJoined: vi.fn(),
}));

describe('approveJoinRequestById TRIP_FULL', () => {
  const queryClient = {
    invalidateQueries: vi.fn(),
  } as unknown as QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces TRIP_FULL with invite error copy', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: {
        success: false,
        error_code: 'TRIP_FULL',
        message: 'Trip is full',
      },
      error: null,
    } as never);

    await expect(
      approveJoinRequestById(queryClient, { requestId: 'req-1', tripId: 'trip-1' }),
    ).rejects.toThrow(/member limit/i);

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/member limit/i));
  });
});
