import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * Minimal IndexedDB wrapper for Chravel offline resilience.
 *
 * Why a wrapper?
 * - Centralizes schema + migrations (avoids scattered openDB calls)
 * - Keeps offline stores consistent across web and PWA
 */

export type OfflineQueueStatus = 'pending' | 'syncing' | 'failed';

export interface OfflineQueuedOperation {
  id: string;
  entityType: string;
  operationType: string;
  tripId: string;
  entityId?: string;
  data: unknown;
  timestamp: number;
  retryCount: number;
  status: OfflineQueueStatus;
  version?: number;
}

export interface OfflineCachedEntity {
  id: string; // `${entityType}:${entityId}`
  tripId: string;
  entityType: string;
  data: unknown;
  cachedAt: number;
  version?: number;
}

export interface TripOverviewSnapshot {
  tripId: string;
  updatedAt: number;
  /**
   * Feature payloads are intentionally `unknown` here to keep this module
   * decoupled from higher-level domain types (and avoid circular deps).
   */
  basecamp?: unknown;
  itinerary?: unknown;
  pinnedPlaces?: unknown;
  tasks?: unknown;
  files?: unknown;
}

interface ChravelOfflineDB extends DBSchema {
  syncQueue: {
    key: string;
    value: OfflineQueuedOperation;
    indexes: {
      'by-status': OfflineQueueStatus;
      'by-timestamp': number;
      'by-trip': string;
      'by-entity-type': string;
    };
  };
  cache: {
    key: string;
    value: OfflineCachedEntity;
    indexes: {
      'by-trip': string;
      'by-entity-type': string;
      'by-cached-at': number;
    };
  };
  tripOverview: {
    key: string; // tripId
    value: TripOverviewSnapshot;
    indexes: {
      'by-updated-at': number;
    };
  };
}

const DB_NAME = 'chravel-offline-sync';
const DB_VERSION = 2;

/**
 * IndexedDB databases created by deleted legacy modules (services/chatStorage.ts,
 * services/offlineMessageQueue.ts). No code reads or writes them anymore — the
 * unified syncQueue/cache stores in this DB replaced them — but the orphaned
 * databases still occupy storage quota on devices that ran older builds.
 */
const LEGACY_DB_NAMES = ['chravel-chat-db', 'chravel-offline-queue'] as const;

let legacyCleanupStarted = false;

/**
 * Fire-and-forget deletion of orphaned legacy databases. Idempotent —
 * deleteDatabase on a nonexistent DB is a no-op. Safe to call on every boot;
 * only the first call per session does anything.
 */
export function deleteLegacyOfflineDatabases(): void {
  if (legacyCleanupStarted) return;
  legacyCleanupStarted = true;

  try {
    for (const name of LEGACY_DB_NAMES) {
      indexedDB.deleteDatabase(name);
    }
  } catch {
    // Restricted environment without IndexedDB — nothing to clean up.
  }
}

let dbInstance: IDBPDatabase<ChravelOfflineDB> | null = null;

export async function getOfflineDb(): Promise<IDBPDatabase<ChravelOfflineDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ChravelOfflineDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // v1 stores (kept compatible)
      if (!db.objectStoreNames.contains('syncQueue')) {
        const queueStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
        queueStore.createIndex('by-status', 'status');
        queueStore.createIndex('by-timestamp', 'timestamp');
        queueStore.createIndex('by-trip', 'tripId');
        queueStore.createIndex('by-entity-type', 'entityType');
      }

      if (!db.objectStoreNames.contains('cache')) {
        const cacheStore = db.createObjectStore('cache', { keyPath: 'id' });
        cacheStore.createIndex('by-trip', 'tripId');
        cacheStore.createIndex('by-entity-type', 'entityType');
        cacheStore.createIndex('by-cached-at', 'cachedAt');
      }

      // v2 store: per-trip snapshot for "trip overview" read-only offline
      if (!db.objectStoreNames.contains('tripOverview')) {
        const overviewStore = db.createObjectStore('tripOverview', { keyPath: 'tripId' });
        overviewStore.createIndex('by-updated-at', 'updatedAt');
      }
    },
  });

  return dbInstance;
}
