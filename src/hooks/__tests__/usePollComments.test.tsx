import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePollComments, useTripPollCommentCounts } from '@/hooks/usePollComments';

const storage = new Map<string, unknown>();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'demo-user', displayName: 'Demo Traveler', avatar: '' },
  }),
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: true }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/platform/storage', () => ({
  getStorageItem: vi.fn(async (key: string, fallback: unknown) => storage.get(key) ?? fallback),
  setStorageItem: vi.fn(async (key: string, value: unknown) => {
    storage.set(key, value);
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

describe('usePollComments (demo mode)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    storage.clear();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  it('adds and counts demo comments without touching mock poll data', async () => {
    const { result: commentsResult } = renderHook(
      () => usePollComments('trip-1', 'mock-poll-1-1', true),
      { wrapper },
    );

    await waitFor(() => expect(commentsResult.current.isLoading).toBe(false));

    await act(async () => {
      await commentsResult.current.addComment('Taco Stand has the best salsa');
    });

    await waitFor(() => {
      expect(commentsResult.current.comments).toHaveLength(1);
      expect(commentsResult.current.comments[0]?.body).toBe('Taco Stand has the best salsa');
    });

    const { result: countsResult } = renderHook(() => useTripPollCommentCounts('trip-1'), {
      wrapper,
    });

    await waitFor(() => {
      expect(countsResult.current.data?.['mock-poll-1-1']).toBe(1);
    });
  });

  it('rejects empty comments', async () => {
    const { result } = renderHook(() => usePollComments('trip-1', 'mock-poll-1-1', true), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(result.current.addComment('   ')).rejects.toThrow(/empty/i);
  });
});
