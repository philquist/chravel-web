/**
 * Regression coverage for the query-persistence safety model:
 * - The owner stamp must be read from the app's ACTUAL Supabase storage key
 *   ('chravel-auth-session' via SUPABASE_AUTH_STORAGE_KEY) — the original
 *   implementation scanned for default `sb-*-auth-token` keys, which this app
 *   never writes, leaving the whole feature silently inert.
 * - The demo firewall must hold for allowlisted roots whose keys carry no
 *   demo boolean (trip-members, calendarEvents): non-UUID scope ids (demo
 *   mock ids) and active demo mode are both rejected.
 * - Cross-user/sign-out isolation: a cache stamped for another user (or a
 *   signed-out device) is dropped, never restored.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Query } from '@tanstack/react-query';
import { SUPABASE_AUTH_STORAGE_KEY } from '@/integrations/supabase/config';

const USER_A = '11111111-2222-4333-8444-555555555555';
const USER_B = '99999999-8888-4777-8666-555555555555';
const TRIP_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

type PersisterModule = typeof import('@/lib/queryPersister');

/**
 * Fresh module instance = fresh module-level caches (cached owner id), which
 * simulates a new app launch while fake-indexeddb keeps the on-disk state.
 */
const loadPersister = async (): Promise<PersisterModule> => {
  vi.resetModules();
  return import('@/lib/queryPersister');
};

const signInAs = (userId: string): void => {
  localStorage.setItem(SUPABASE_AUTH_STORAGE_KEY, JSON.stringify({ user: { id: userId } }));
};

const makePersistedClient = (tag: string) => ({
  timestamp: Date.now(),
  buster: tag,
  clientState: { mutations: [], queries: [] },
});

/** Poll restoreClient until it settles to a value or the timeout elapses. */
const restoreWithRetry = async (
  mod: PersisterModule,
  timeoutMs = 2500,
): Promise<unknown | undefined> => {
  const deadline = Date.now() + timeoutMs;
  // persistClient is throttled fire-and-forget; poll for the async write.
  for (;;) {
    const restored = await mod.queryPersister.restoreClient();
    if (restored !== undefined || Date.now() > deadline) return restored;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
};

const fakeQuery = (queryKey: unknown[], status: 'success' | 'error' = 'success'): Query =>
  ({ queryKey, state: { status } }) as unknown as Query;

describe('queryPersister', () => {
  beforeEach(async () => {
    localStorage.clear();
    // Clear on-disk state through the module's own path — deleteDatabase
    // blocks forever on connections held by previous module instances.
    const mod = await loadPersister();
    await mod.removePersistedQueryCache();
    const { useDemoModeStore } = await import('@/store/demoModeStore');
    useDemoModeStore.setState({ isDemoMode: false, demoView: 'off' });
  });

  describe('shouldDehydrateQuery allowlist + demo firewall', () => {
    it('persists successful allowlisted UUID-scoped queries only', async () => {
      const { persistOptions } = await loadPersister();
      const should = persistOptions.dehydrateOptions!.shouldDehydrateQuery! as unknown as (
        q: unknown,
      ) => boolean;

      expect(should(fakeQuery(['trips', USER_A, false]))).toBe(true);
      expect(should(fakeQuery(['trip', TRIP_UUID, USER_A]))).toBe(true);
      expect(should(fakeQuery(['calendarEvents', TRIP_UUID]))).toBe(true);

      // Non-allowlisted roots (chat, payments) never persist
      expect(should(fakeQuery(['tripChat', TRIP_UUID]))).toBe(false);
      expect(should(fakeQuery(['tripPayments', TRIP_UUID]))).toBe(false);

      // Failed queries never persist
      expect(should(fakeQuery(['trips', USER_A, false], 'error'))).toBe(false);
    });

    it('rejects demo-flagged keys and non-UUID (mock/demo) scope ids', async () => {
      const { persistOptions } = await loadPersister();
      const should = persistOptions.dehydrateOptions!.shouldDehydrateQuery! as unknown as (
        q: unknown,
      ) => boolean;

      // Layer 2: explicit demo boolean segment
      expect(should(fakeQuery(['tripTasks', TRIP_UUID, true]))).toBe(false);

      // Layer 3: roots WITHOUT a demo segment must still reject demo mock ids
      expect(should(fakeQuery(['trip-members', 'demo-trip-1']))).toBe(false);
      expect(should(fakeQuery(['calendarEvents', '1']))).toBe(false);
    });

    it('persists nothing while demo mode is active', async () => {
      const { persistOptions } = await loadPersister();
      const { useDemoModeStore } = await import('@/store/demoModeStore');
      const should = persistOptions.dehydrateOptions!.shouldDehydrateQuery! as unknown as (
        q: unknown,
      ) => boolean;

      useDemoModeStore.setState({ isDemoMode: true, demoView: 'app-preview' });
      expect(should(fakeQuery(['trips', USER_A, false]))).toBe(false);
    });
  });

  describe('owner-scoped persist/restore', () => {
    it('round-trips for the signed-in user via the real auth storage key', async () => {
      signInAs(USER_A);
      const mod = await loadPersister();

      mod.queryPersister.persistClient(makePersistedClient('round-trip'));
      const restored = (await restoreWithRetry(mod)) as { buster?: string } | undefined;

      expect(restored).toBeDefined();
      expect(restored?.buster).toBe('round-trip');
    });

    it('drops the cache when a different user is signed in on the device', async () => {
      signInAs(USER_A);
      const sessionA = await loadPersister();
      sessionA.queryPersister.persistClient(makePersistedClient('user-a-data'));
      await restoreWithRetry(sessionA); // ensure the write landed

      // New app launch, different user
      signInAs(USER_B);
      const sessionB = await loadPersister();
      expect(await sessionB.queryPersister.restoreClient()).toBeUndefined();
    });

    it('drops the cache when the device is signed out', async () => {
      signInAs(USER_A);
      const sessionA = await loadPersister();
      sessionA.queryPersister.persistClient(makePersistedClient('user-a-data'));
      await restoreWithRetry(sessionA);

      localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
      const sessionNext = await loadPersister();
      expect(await sessionNext.queryPersister.restoreClient()).toBeUndefined();
    });

    it('never writes for an unauthenticated session', async () => {
      const mod = await loadPersister();
      mod.queryPersister.persistClient(makePersistedClient('anon'));
      // Give the throttled write a chance to (incorrectly) land
      await new Promise(resolve => setTimeout(resolve, 200));

      signInAs(USER_A);
      const next = await loadPersister();
      expect(await next.queryPersister.restoreClient()).toBeUndefined();
    });

    it('removePersistedQueryCache hard-deletes the stored cache', async () => {
      signInAs(USER_A);
      const mod = await loadPersister();
      mod.queryPersister.persistClient(makePersistedClient('to-delete'));
      await restoreWithRetry(mod);

      await mod.removePersistedQueryCache();
      expect(await mod.queryPersister.restoreClient()).toBeUndefined();
    });
  });
});
