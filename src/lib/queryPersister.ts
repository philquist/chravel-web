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
 * - Demo firewall: any query key carrying a `true` demo-mode segment
 *   (e.g. ['tripTasks', id, isDemoMode]) is never persisted.
 * - Per-user scoping: the persisted payload is stamped with the auth user id
 *   read from Supabase's localStorage session; restore drops the cache when
 *   the stamp doesn't match the current device user (fail-closed: any doubt →
 *   no restore). Key-level scoping (['trips', userId, ...]) plus the existing
 *   `enabled` auth gates isolate the rest.
 * - Build buster: VITE_BUILD_ID invalidates the cache on every deploy.
 * - Both sign-out paths in useAuth.tsx call removePersistedQueryCache() so a
 *   crash inside the persister's throttle window can't leave stale data.
 */

import { openDB, type IDBPDatabase } from 'idb';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

const DB_NAME = 'chravel-query-cache';
const STORE_NAME = 'keyval';
const CACHE_KEY = 'tanstack-query';
const OWNER_KEY = 'owner-user-id';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

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

/**
 * Current auth user id from Supabase's persisted session (sb-*-auth-token).
 * Returns null when unauthenticated or the session shape is unreadable —
 * callers must treat null as "do not trust the persisted cache".
 */
const readAuthUserIdFromStorage = (): string | null => {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      const id = (parsed as { user?: { id?: unknown } } | null)?.user?.id;
      if (typeof id === 'string' && id.length > 0) return id;
    }
  } catch {
    // Unreadable session (restricted storage, base64 encoding, etc.) → fail closed
  }
  return null;
};

const idbStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const db = await getDb();

      // Owner check on every read: a cache stamped for another user (or for a
      // signed-out device) is dropped instead of restored.
      const owner = (await db.get(STORE_NAME, OWNER_KEY)) as string | undefined;
      const currentUser = readAuthUserIdFromStorage();
      if (!owner || !currentUser || owner !== currentUser) {
        await db.delete(STORE_NAME, key);
        await db.delete(STORE_NAME, OWNER_KEY);
        return null;
      }

      const value = (await db.get(STORE_NAME, key)) as string | undefined;
      return value ?? null;
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
      await db.put(STORE_NAME, currentUser, OWNER_KEY);
      await db.put(STORE_NAME, value, key);
    } catch {
      // Persistence is best-effort; the app works identically without it.
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      const db = await getDb();
      await db.delete(STORE_NAME, key);
      await db.delete(STORE_NAME, OWNER_KEY);
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
  const root = query.queryKey[0];
  if (typeof root !== 'string' || !PERSISTED_KEY_ROOTS.has(root)) return false;
  // Demo firewall: demo-mode variants carry a literal `true` segment.
  if (query.queryKey.includes(true)) return false;
  return true;
};

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: queryPersister,
  maxAge: MAX_AGE_MS,
  buster: (import.meta.env.VITE_BUILD_ID as string | undefined) ?? 'dev',
  dehydrateOptions: {
    shouldDehydrateQuery: shouldPersistQuery,
  },
};

/**
 * Hard-delete the persisted cache. Called from both sign-out paths in
 * useAuth.tsx in addition to queryClient.clear(), so a crash mid-throttle
 * can't leave the previous user's data on disk.
 */
export const removePersistedQueryCache = async (): Promise<void> => {
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, CACHE_KEY);
    await db.delete(STORE_NAME, OWNER_KEY);
  } catch {
    // ignore — worst case the owner check drops it on next read
  }
};
