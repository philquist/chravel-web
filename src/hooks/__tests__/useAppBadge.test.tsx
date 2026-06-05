import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// useAppBadge mirrors the OS app-icon badge to the count of the signed-in user's
// unread, badge-countable notifications. It reads that count from Supabase (not
// from the realtime store's raw unread total), gated on the authed user, and
// no-ops where the Web Badging API is unavailable.
//
// `supportsBadge` is evaluated at module load against `navigator`, so each test
// configures the Badging API globals first and then imports the hook fresh
// (vi.resetModules) so support detection reflects that setup.

const { mocks } = vi.hoisted(() => ({
  mocks: {
    user: { id: 'user-1' } as { id: string } | null,
    getNotificationPreferences: vi.fn(),
    badgeQueryResult: { count: 0, error: null } as {
      count: number | null;
      error: unknown;
    },
  },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/services/userPreferencesService', () => ({
  userPreferencesService: { getNotificationPreferences: mocks.getNotificationPreferences },
}));
vi.mock('@/integrations/supabase/client', () => {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => Promise.resolve(mocks.badgeQueryResult)),
  };
  return { supabase: { from: vi.fn(() => builder) } };
});

const setAppBadge = vi.fn().mockResolvedValue(undefined);
const clearAppBadge = vi.fn().mockResolvedValue(undefined);

async function importHook() {
  vi.resetModules();
  return (await import('../useAppBadge')).useAppBadge;
}

describe('useAppBadge', () => {
  beforeEach(() => {
    setAppBadge.mockClear();
    clearAppBadge.mockClear();
    mocks.user = { id: 'user-1' };
    mocks.getNotificationPreferences.mockClear();
    mocks.getNotificationPreferences.mockResolvedValue({ chat_messages: true });
    mocks.badgeQueryResult = { count: 0, error: null };
    (navigator as unknown as { setAppBadge: unknown }).setAppBadge = setAppBadge;
    (navigator as unknown as { clearAppBadge: unknown }).clearAppBadge = clearAppBadge;
  });

  afterEach(() => {
    delete (navigator as unknown as { setAppBadge?: unknown }).setAppBadge;
    delete (navigator as unknown as { clearAppBadge?: unknown }).clearAppBadge;
  });

  it('sets the app badge to the badge-countable unread total for the signed-in user', async () => {
    mocks.badgeQueryResult = { count: 3, error: null };
    const useAppBadge = await importHook();

    renderHook(() => useAppBadge());

    await waitFor(() => expect(setAppBadge).toHaveBeenCalledWith(3));
    expect(clearAppBadge).not.toHaveBeenCalled();
  });

  it('clears the app badge when the badge-countable unread total is zero', async () => {
    mocks.badgeQueryResult = { count: 0, error: null };
    const useAppBadge = await importHook();

    renderHook(() => useAppBadge());

    await waitFor(() => expect(clearAppBadge).toHaveBeenCalled());
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  it('clears the badge when there is no signed-in user (never queries)', async () => {
    mocks.user = null;
    const useAppBadge = await importHook();

    renderHook(() => useAppBadge());

    await waitFor(() => expect(clearAppBadge).toHaveBeenCalled());
    expect(setAppBadge).not.toHaveBeenCalled();
    expect(mocks.getNotificationPreferences).not.toHaveBeenCalled();
  });

  it('no-ops when the Badging API is unavailable', async () => {
    delete (navigator as unknown as { setAppBadge?: unknown }).setAppBadge;
    delete (navigator as unknown as { clearAppBadge?: unknown }).clearAppBadge;
    mocks.badgeQueryResult = { count: 5, error: null };
    const useAppBadge = await importHook();

    expect(() => renderHook(() => useAppBadge())).not.toThrow();
    expect(setAppBadge).not.toHaveBeenCalled();
    expect(clearAppBadge).not.toHaveBeenCalled();
  });
});
