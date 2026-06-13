/**
 * TanStack Query cache persistence (IndexedDB).
 *
 * Lets a cold start render last-known dashboard/trip data instantly while
 * background refetches run, instead of refetching everything from Supabase.
 *
 * Safety model (do not weaken):
 * - Allowlist, not blocklist: only stable, non-sensitive trip domains persist.
 *   Chat (realtime/Stream-owned, PII-heavy), payments, media, notifications,
 *   and entitlements are deliberately excluded.
 * - Demo firewall, three layers: (1) nothing dehydrates while demo mode is
 *   active, (2) keys carrying a `true` demo-mode segment are rejected, and
 *   (3) the key's scope id (tripId/userId at index 1) must be a UUID — demo
 *   trips use mock ids, so demo entries lingering in cache after demo exit
 *   still can't persist (covers roots like trip-members/calendarEvents whose
 *   keys carry no demo flag).
 * - Per-user scoping: the persisted payload is stamped with the auth user id
 *   read from Supabase's session at SUPABASE_AUTH_STORAGE_KEY (the client's
 *   configured storageKey — never hardcode or scan for sb-* defaults);
 *   restore drops the cache when the stamp doesn't match the current device
 *   user (fail-closed: any doubt → no restore). Key-level scoping
 *   (['trips', userId, ...]) plus the existing `enabled` auth gates isolate
 *   the rest.
 * - Build buster: VITE_BUILD_ID invalidates the cache on every deploy.
 * - Both sign-out paths in useAuth.tsx call removePersistedQueryCache() so a
 *   crash inside the persister's throttle window can't leave stale data.
 */

import { openDB, type IDBPDatabase } from 'idb';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { SUPABASE_AUTH_STORAGE_KEY } from '@/integrations/supabase/config';
import { useDemoModeStore } from '@/store/demoModeStore';

const DB_NAME = 'chravel-query-cache';
const STORE_NAME = 'keyval';
const CACHE_KEY = 'tanstack-query';
const OWNER_KEY = 'owner-user-id';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
// iOS WebKit indexedDB.open() can hang indefinitely in degraded storage
// states; restore must settle so PersistQueryClientProvider can unpause
// queries. Timing out means "no restore", never "no boot".
const READ_TIMEOUT_MS = 3000;

/** Query key roots that are safe to persist (see safety model above). */
const PERSISTED_KEY_ROOTS = new Set([
  'trips', // dashboard list — ['trips', userId, isDemoMode]
  'trip', // trip detail — ['trip', tripId, userId]
  'trip-members',
  'calendarEvents',
  'tripTasks',
  'tripPolls',
  'tripLinks',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDb = (): Promise<IDBPDatabase> => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME);
      },
    });
  }
  return dbPromise;
};

const withTimeout = <T>(promise: Promise<T>, fallback: T): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), READ_TIMEOUT_MS)),
  ]);

// The auth user id is invariant for the lifetime of the page once signed in
// (sign-out clears the cache via removePersistedQueryCache below), so cache it
// after the first successful read instead of re-parsing the session JSON on
// every persist tick. A null result is NOT cached: a user signing in mid-
// session must start persisting without a reload.
let cachedAuthUserId: string | null = null;

const readAuthUserIdFromStorage = (): string | null => {
  if (cachedAuthUserId) return cachedAuthUserId;
  try {
    const raw = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const id = (parsed as { user?: { id?: unknown } } | null)?.user?.id;
    if (typeof id === 'string' && id.length > 0) {
      cachedAuthUserId = id;
      return id;
    }
  } catch {
    // Unreadable session (restricted storage, changed encoding) → fail closed
  }
  return null;
};

let lastWrittenOwner: string | null = null;

const clearStore = async (): Promise<void> => {
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await tx.store.delete(CACHE_KEY);
  await tx.store.delete(OWNER_KEY);
  await tx.done;
};

const idbStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await withTimeout(
        (async () => {
          const db = await getDb();

          // Single readonly transaction = consistent owner/value snapshot
          // (reading them separately can race a concurrent persist write).
          const tx = db.transaction(STORE_NAME);
          const [owner, value] = (await Promise.all([
            tx.store.get(OWNER_KEY),
            tx.store.get(key),
          ])) as [string | undefined, string | undefined];

          // Nothing stored → nothing to validate or drop.
          if (value === undefined) return null;

          // Owner check on every read: a cache stamped for another user (or
          // for a signed-out device) is dropped instead of restored.
          const currentUser = readAuthUserIdFromStorage();
          if (!owner || !currentUser || owner !== currentUser) {
            await clearStore();
            return null;
          }

          return value;
        })(),
        null,
      );
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      const currentUser = readAuthUserIdFromStorage();
      // Never persist for an unauthenticated/unidentifiable session.
      if (!currentUser) return;
      const db = await getDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      if (currentUser !== lastWrittenOwner) {
        await tx.store.put(currentUser, OWNER_KEY);
      }
      await tx.store.put(value, key);
      await tx.done;
      lastWrittenOwner = currentUser;
    } catch {
      // Persistence is best-effort; the app works identically without it.
    }
  },
  removeItem: async (_key: string): Promise<void> => {
    try {
      await clearStore();
      lastWrittenOwner = null;
    } catch {
      // ignore
    }
  },
};

export const queryPersister = createAsyncStoragePersister({
  storage: idbStorage,
  key: CACHE_KEY,
  throttleTime: 1000,
});

const shouldPersistQuery = (query: Query): boolean => {
  if (query.state.status !== 'success') return false;

  // Layer 1: never dehydrate anything while demo mode is active.
  const demoState = useDemoModeStore.getState();
  if (demoState.isDemoMode || demoState.demoView !== 'off') return false;

  const root = query.queryKey[0];
  if (typeof root !== 'string' || !PERSISTED_KEY_ROOTS.has(root)) return false;

  // Layer 2: demo-mode key variants carry a literal `true` segment.
  if (query.queryKey.includes(true)) return false;

  // Layer 3: the scope id (tripId, or userId for the 'trips' list) must be a
  // real UUID — demo/mock entities use non-UUID ids, so demo entries that
  // outlive demo mode in the cache still can't persist.
  const scopeId = query.queryKey[1];
  if (typeof scopeId !== 'string' || !UUID_RE.test(scopeId)) return false;

  return true;
};

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: queryPersister,
  maxAge: MAX_AGE_MS,
  buster: (import.meta.env.VITE_BUILD_ID as string | undefined) ?? 'dev',
  dehydrateOptions: {
    shouldDehydrateQuery: shouldPersistQuery as unknown as (query: unknown) => boolean,
  },
};

/**
 * Hard-delete the persisted cache. Called from both sign-out paths in
 * useAuth.tsx in addition to queryClient.clear(), so a crash inside the
 * persister's 1s throttle window can't leave the previous user's data on
 * disk. Also resets the cached owner id so the next sign-in re-reads it.
 */
export const removePersistedQueryCache = async (): Promise<void> => {
  cachedAuthUserId = null;
  lastWrittenOwner = null;
  try {
    await clearStore();
  } catch {
    // ignore — worst case the owner check drops it on next read
  }
};
