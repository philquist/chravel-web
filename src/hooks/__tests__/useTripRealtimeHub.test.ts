import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useTripRealtimeHub } from '@/hooks/useTripRealtimeHub';

const mocks = vi.hoisted(() => {
  const removeChannel = vi.fn();
  const subscribe = vi.fn((cb: (status: string) => void) => {
    cb('SUBSCRIBED');
    return { unsubscribe: vi.fn() };
  });
  const on = vi.fn().mockReturnThis();
  const channel = vi.fn(() => ({ on, subscribe }));
  return { removeChannel, subscribe, on, channel };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('useTripRealtimeHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.__tripRealtimeHubs = undefined;
  });

  it('registers a multiplexed hub per trip id', async () => {
    renderHook(() => useTripRealtimeHub('trip-123'), { wrapper });

    await waitFor(() => {
      expect(window.__tripRealtimeHubs?.has('trip-123')).toBe(true);
    });

    expect(mocks.channel).toHaveBeenCalledWith('trip_hub:trip-123');
    expect(mocks.on).toHaveBeenCalled();
    expect(mocks.subscribe).toHaveBeenCalled();
  });

  it('cleans up hub registry on unmount', async () => {
    const { unmount } = renderHook(() => useTripRealtimeHub('trip-abc'), { wrapper });

    await waitFor(() => {
      expect(window.__tripRealtimeHubs?.has('trip-abc')).toBe(true);
    });

    unmount();

    expect(window.__tripRealtimeHubs?.has('trip-abc')).toBe(false);
    expect(mocks.removeChannel).toHaveBeenCalled();
  });
});
