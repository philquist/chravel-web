/**
 * Cover photo mutations must invalidate trip detail cache (['trip', id, ...])
 * as well as trip lists — detail previously stayed stale after upload.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import { useTripCoverPhoto } from '../useTripCoverPhoto';
import { tripKeys } from '@/lib/queryKeys';

const invalidateSpy = vi.fn();

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/services/demoModeService', () => ({
  demoModeService: {
    getCoverPhoto: vi.fn(() => null),
    setCoverPhoto: vi.fn(),
    removeCoverPhoto: vi.fn(),
  },
}));

const maybeSingleMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: maybeSingleMock,
    })),
    storage: {
      from: vi.fn(() => ({
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    },
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.invalidateQueries = invalidateSpy;
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useTripCoverPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingleMock.mockResolvedValue({
      data: {
        id: 'trip-abc',
        cover_image_url:
          'https://abc.supabase.co/storage/v1/object/public/trip-covers/trip-abc/cover.jpg?t=1',
      },
      error: null,
    });
  });

  it('invalidates trip list/detail + pro/event collections after successful cover update', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useTripCoverPhoto('trip-abc'), { wrapper });

    await act(async () => {
      const ok = await result.current.updateCoverPhoto(
        'https://abc.supabase.co/storage/v1/object/public/trip-covers/trip-abc/cover.jpg?t=1',
      );
      expect(ok).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: tripKeys.all });
  });

  it('keeps a freshly persisted cover when parent prop is briefly stale', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: {
        id: 'trip-abc',
        cover_image_url:
          'https://abc.supabase.co/storage/v1/object/public/trip-covers/trip-abc/cover.jpg',
      },
      error: null,
    });

    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ url }: { url?: string }) => useTripCoverPhoto('trip-abc', url),
      { wrapper, initialProps: { url: undefined as string | undefined } },
    );

    await act(async () => {
      const ok = await result.current.updateCoverPhoto(
        'https://abc.supabase.co/storage/v1/object/public/trip-covers/trip-abc/cover.jpg',
      );
      expect(ok).toBe(true);
    });

    expect(result.current.coverPhoto).toContain('trip-abc/cover.jpg');

    rerender({ url: undefined });

    await waitFor(() => {
      expect(result.current.coverPhoto).toContain('trip-abc/cover.jpg');
    });
  });

  it('syncs local coverPhoto when initialPhotoUrl prop updates (e.g. after refetch)', async () => {
    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ url }: { url?: string }) => useTripCoverPhoto('trip-abc', url),
      { wrapper, initialProps: { url: undefined as string | undefined } },
    );

    expect(result.current.coverPhoto).toBeUndefined();

    rerender({ url: 'https://abc.supabase.co/storage/v1/object/public/x/new.jpg' });

    await waitFor(() => {
      expect(result.current.coverPhoto).toBe(
        'https://abc.supabase.co/storage/v1/object/public/x/new.jpg',
      );
    });
  });

  it('returns permission failure when trips update affects no rows', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const wrapper = createWrapper();
    const { result } = renderHook(() => useTripCoverPhoto('trip-abc'), { wrapper });

    await act(async () => {
      const ok = await result.current.updateCoverPhoto(
        'https://abc.supabase.co/storage/v1/object/public/trip-covers/trip-abc/cover.jpg?t=2',
      );
      expect(ok).toBe(false);
    });
  });
  it('updates cover display mode and invalidates all trip collections', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useTripCoverPhoto('trip-abc', undefined, 'cover'), {
      wrapper,
    });

    await act(async () => {
      const ok = await result.current.updateCoverDisplayMode('contain');
      expect(ok).toBe(true);
    });

    expect(result.current.coverDisplayMode).toBe('contain');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: tripKeys.all });
  });
});
