/**
 * Unified Offline Sync Service
 *
 * Provides optimistic UI with sync queue for:
 * - Chat messages (High priority)
 * - Tasks (Medium priority)
 * - Calendar events (Medium priority)
 *
 * Features:
 * - Read caching (last 30 days)
 * - Write queue for offline operations
 * - Conflict resolution (last-write-wins with version field)
 * - Automatic sync when connection restored
 */

import { getOfflineDb } from '@/offline/db';
import { getStreamClient } from '@/services/stream/streamClient';
import { isStreamChatActive, isStreamConfigured } from '@/services/stream/streamTransportGuards';

// ============================================================================
// Types
// ============================================================================

export type SyncEntityType = 'chat_message' | 'task' | 'calendar_event' | 'poll_vote';

export type SyncOperationType = 'create' | 'update' | 'delete';

export interface QueuedSyncOperation {
  id: string; // Temporary ID for tracking
  entityType: SyncEntityType;
  operationType: SyncOperationType;
  tripId: string;
  entityId?: string; // For updates/deletes
  data: Record<string, unknown>; // Entity data
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed';
  version?: number; // For conflict resolution
}

export interface CachedEntity {
  id: string;
  tripId: string;
  entityType: SyncEntityType;
  data: Record<string, unknown>;
  cachedAt: number;
  version?: number;
}

export interface SyncHandlers {
  onChatMessageCreate?: (tripId: string, data: Record<string, unknown>) => Promise<unknown>;
  onChatMessageUpdate?: (entityId: string, data: Record<string, unknown>) => Promise<unknown>;
  onTaskCreate?: (tripId: string, data: Record<string, unknown>) => Promise<unknown>;
  onTaskUpdate?: (entityId: string, data: Record<string, unknown>) => Promise<unknown>;
  onTaskToggle?: (entityId: string, data: Record<string, unknown>) => Promise<unknown>;
  onPollVote?: (pollId: string, data: Record<string, unknown>) => Promise<unknown>;
  onCalendarEventCreate?: (tripId: string, data: Record<string, unknown>) => Promise<unknown>;
  onCalendarEventUpdate?: (entityId: string, data: Record<string, unknown>) => Promise<unknown>;
  onCalendarEventDelete?: (entityId: string) => Promise<unknown>;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds
const CACHE_EXPIRY_DAYS = 30;
const CACHE_EXPIRY_MS = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// ============================================================================
// Database Initialization
// ============================================================================

async function getDB() {
  // Single source of truth for offline DB schema/migrations.
  return await getOfflineDb();
}

// ============================================================================
// Sync Queue Operations
// ============================================================================

class OfflineSyncService {
  /**
   * Queue an operation for sync when connection is restored
   */
  async queueOperation(
    entityType: SyncEntityType,
    operationType: SyncOperationType,
    tripId: string,
    data: Record<string, unknown>,
    entityId?: string,
    version?: number,
  ): Promise<string> {
    // Guardrail: never allow basecamp writes via offline queue.
    if ((entityType as string) === 'basecamp') {
      throw new Error('Basecamp updates are not supported offline.');
    }

    // Stream handles its own queueing only when configured + enabled + connected.
    if (entityType === 'chat_message' && isStreamChatActive(getStreamClient()?.userID)) {
      if (import.meta.env.DEV) {
        console.log('[OfflineSync] Bypassing custom queue for chat message (Stream active)');
      }
      return `stream_handled_${Date.now()}`;
    }

    const db = await getDB();
    const queueId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const operation: QueuedSyncOperation = {
      id: queueId,
      entityType,
      operationType,
      tripId,
      entityId,
      data,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending',
      version,
    };

    await db.put('syncQueue', operation);
    return queueId;
  }

  /**
   * Get all queued operations
   */
  async getQueuedOperations(filters?: {
    status?: QueuedSyncOperation['status'];
    tripId?: string;
    entityType?: SyncEntityType;
  }): Promise<QueuedSyncOperation[]> {
    const db = await getDB();
    let operations: QueuedSyncOperation[];

    if (filters?.status) {
      operations = (await db.getAllFromIndex(
        'syncQueue',
        'by-status',
        filters.status,
      )) as QueuedSyncOperation[];
    } else {
      operations = (await db.getAll('syncQueue')) as QueuedSyncOperation[];
    }

    // Apply additional filters
    if (filters?.tripId) {
      operations = operations.filter(op => op.tripId === filters.tripId);
    }
    if (filters?.entityType) {
      operations = operations.filter(op => op.entityType === filters.entityType);
    }

    return operations.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Remove an operation from the queue
   */
  async removeOperation(operationId: string): Promise<boolean> {
    const db = await getDB();
    try {
      await db.delete('syncQueue', operationId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update operation status
   */
  async updateOperationStatus(
    operationId: string,
    status: QueuedSyncOperation['status'],
    incrementRetry = false,
  ): Promise<QueuedSyncOperation | null> {
    const db = await getDB();
    const operation = await db.get('syncQueue', operationId);

    if (!operation) return null;

    const updated = {
      ...operation,
      status,
      retryCount: incrementRetry ? operation.retryCount + 1 : operation.retryCount,
    } as QueuedSyncOperation;

    await db.put('syncQueue', updated);
    return updated;
  }

  /**
   * Atomically claim a pending operation for processing (compare-and-swap inside a
   * single IndexedDB readwrite transaction: only a row whose status is still 'pending'
   * transitions to 'syncing'). Returns the claimed operation, or null if it was already
   * claimed by a concurrent pass or removed.
   *
   * This is the real lock that `updateOperationStatus` was not: it had no precondition
   * on the current status, so two overlapping processSyncQueue() passes (e.g. a flaky
   * mobile network re-firing the `online` event mid-replay) both read the same 'pending'
   * op and both ran its handler — producing duplicate tasks/calendar events for the
   * create handlers. IndexedDB serializes readwrite transactions over the same store, so
   * exactly one caller wins the pending -> syncing transition.
   */
  async claimOperation(operationId: string): Promise<QueuedSyncOperation | null> {
    const db = await getDB();
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.store;
    const operation = await store.get(operationId);
    if (!operation || operation.status !== 'pending') {
      await tx.done;
      return null;
    }
    const claimed = { ...operation, status: 'syncing' } as QueuedSyncOperation;
    await store.put(claimed);
    await tx.done;
    return claimed;
  }

  /**
   * Get operations ready to retry
   */
  async getReadyOperations(): Promise<QueuedSyncOperation[]> {
    const pending = await this.getQueuedOperations({ status: 'pending' });
    const now = Date.now();

    return pending.filter(op => {
      const timeSinceQueued = now - op.timestamp;
      // Process new operations immediately; apply backoff only between retries.
      if (op.retryCount === 0) return true;
      const retryDelay = RETRY_DELAY * op.retryCount;
      return timeSinceQueued >= retryDelay && op.retryCount < MAX_RETRIES;
    });
  }

  /**
   * Get failed operations
   */
  async getFailedOperations(): Promise<QueuedSyncOperation[]> {
    return this.getQueuedOperations({ status: 'failed' });
  }

  // ============================================================================
  // Cache Operations
  // ============================================================================

  /**
   * Cache an entity for offline reading
   */
  async cacheEntity(
    entityType: SyncEntityType,
    entityId: string,
    tripId: string,
    data: Record<string, unknown>,
    version?: number,
  ): Promise<void> {
    const db = await getDB();
    const cacheKey = `${entityType}:${entityId}`;

    const cached: CachedEntity = {
      id: cacheKey,
      tripId,
      entityType,
      data,
      cachedAt: Date.now(),
      version,
    };

    await db.put('cache', cached);
  }

  /**
   * Get cached entities for a trip
   */
  async getCachedEntities(tripId: string, entityType?: SyncEntityType): Promise<CachedEntity[]> {
    const db = await getDB();
    let cached: CachedEntity[];

    if (entityType) {
      const allCached = await db.getAllFromIndex('cache', 'by-entity-type', entityType);
      cached = allCached.filter(c => c.tripId === tripId) as CachedEntity[];
    } else {
      const allCached = await db.getAllFromIndex('cache', 'by-trip', tripId);
      cached = allCached as CachedEntity[];
    }

    // Filter expired entries
    const now = Date.now();
    return cached.filter(c => now - c.cachedAt < CACHE_EXPIRY_MS);
  }

  /**
   * Get a specific cached entity
   */
  async getCachedEntity(
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<CachedEntity | null> {
    const db = await getDB();
    const cacheKey = `${entityType}:${entityId}`;
    const cached = await db.get('cache', cacheKey);

    if (!cached) return null;

    // Check expiry
    const now = Date.now();
    if (now - cached.cachedAt >= CACHE_EXPIRY_MS) {
      await db.delete('cache', cacheKey);
      return null;
    }

    return cached as CachedEntity;
  }

  /**
   * Remove cached entity
   */
  async removeCachedEntity(entityType: SyncEntityType, entityId: string): Promise<void> {
    const db = await getDB();
    const cacheKey = `${entityType}:${entityId}`;
    await db.delete('cache', cacheKey);
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache(): Promise<number> {
    const db = await getDB();
    const allCached = await db.getAll('cache');
    const now = Date.now();
    let cleared = 0;

    for (const cached of allCached) {
      if (now - cached.cachedAt >= CACHE_EXPIRY_MS) {
        await db.delete('cache', cached.id);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Clear all cache for a trip
   */
  async clearTripCache(tripId: string, entityType?: SyncEntityType): Promise<void> {
    const db = await getDB();
    const cached = await this.getCachedEntities(tripId, entityType);

    for (const c of cached) {
      await db.delete('cache', c.id);
    }
  }

  // ============================================================================
  // Sync Processing
  // ============================================================================

  /**
   * Process sync queue when connection is restored
   * Returns count of successful and failed operations
   */
  async processSyncQueue(handlers: SyncHandlers): Promise<{ processed: number; failed: number }> {
    if (!navigator.onLine) {
      return { processed: 0, failed: 0 };
    }

    const readyOps = await this.getReadyOperations();

    const results = await Promise.all(readyOps.map(op => this.syncOperation(op, handlers)));

    return {
      processed: results.filter(r => r === 'processed').length,
      failed: results.filter(r => r === 'failed').length,
    };
  }

  /**
   * Internal helper to sync a single operation
   */
  private async syncOperation(
    operation: QueuedSyncOperation,
    handlers: SyncHandlers,
  ): Promise<'processed' | 'failed' | 'retry' | 'skipped'> {
    const { id, entityType, operationType, tripId, entityId, data } = operation;

    try {
      // Atomically claim the op (pending -> syncing). Returns null if it was already
      // claimed by a concurrent pass or removed, so we never double-run a handler.
      const updated = await this.claimOperation(id);
      if (!updated) {
        return 'skipped';
      }

      let handlerRan = false;

      // Backward-compat cleanup: if legacy chat operations exist in IndexedDB from pre-Stream
      // sessions, drop them once Stream chat is active to avoid dual-write replay.
      if (entityType === 'chat_message' && isStreamChatActive(getStreamClient()?.userID)) {
        await this.removeOperation(id);
        return 'processed';
      }
      // Stream cutover safety: when Stream is configured (canonical transport) but not yet
      // connected, legacy chat handlers may be intentionally omitted by global sync.
      // Drop stale legacy chat queue entries to avoid permanent pending retries/noise.
      if (
        entityType === 'chat_message' &&
        isStreamConfigured() &&
        !handlers.onChatMessageCreate &&
        !handlers.onChatMessageUpdate
      ) {
        await this.removeOperation(id);
        return 'processed';
      }

      // Route to appropriate handler
      switch (entityType) {
        case 'chat_message':
          if (operationType === 'create' && handlers.onChatMessageCreate) {
            await handlers.onChatMessageCreate(tripId, data);
            handlerRan = true;
          } else if (operationType === 'update' && entityId && handlers.onChatMessageUpdate) {
            await handlers.onChatMessageUpdate(entityId, data);
            handlerRan = true;
          }
          break;

        case 'task': {
          if (operationType === 'create' && handlers.onTaskCreate) {
            await handlers.onTaskCreate(tripId, data);
            handlerRan = true;
            break;
          }

          if (operationType === 'update' && entityId) {
            // Task completion is stored via toggle_task_status RPC
            const isToggle = data && typeof data === 'object' && 'completed' in data;

            if (isToggle && handlers.onTaskToggle) {
              await handlers.onTaskToggle(entityId, data);
              handlerRan = true;
            } else if (handlers.onTaskUpdate) {
              await handlers.onTaskUpdate(entityId, data);
              handlerRan = true;
            }
          }
          break;
        }

        case 'poll_vote':
          if (operationType === 'create' && entityId && handlers.onPollVote) {
            await handlers.onPollVote(entityId, data);
            handlerRan = true;
          }
          break;

        case 'calendar_event':
          if (operationType === 'create' && handlers.onCalendarEventCreate) {
            await handlers.onCalendarEventCreate(tripId, data);
            handlerRan = true;
          } else if (operationType === 'update' && entityId && handlers.onCalendarEventUpdate) {
            await handlers.onCalendarEventUpdate(entityId, data);
            handlerRan = true;
          } else if (operationType === 'delete' && entityId && handlers.onCalendarEventDelete) {
            await handlers.onCalendarEventDelete(entityId);
            handlerRan = true;
          }
          break;
      }

      if (!handlerRan) {
        console.warn(
          `[OfflineSync] No handler provided for ${entityType}:${operationType} operation ${id}.`,
        );
        await this.updateOperationStatus(id, 'pending');
        return 'skipped';
      }

      await this.removeOperation(id);
      return 'processed';
    } catch (error) {
      console.error(`Failed to sync operation ${id}:`, error);
      const updatedRetry = await this.updateOperationStatus(id, 'pending', true);
      if (updatedRetry && updatedRetry.retryCount >= MAX_RETRIES) {
        await this.updateOperationStatus(id, 'failed');
        return 'failed';
      }
      return 'retry';
    }
  }

  /**
   * Check if online
   */
  isOnline(): boolean {
    return navigator.onLine !== false;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    total: number;
    pending: number;
    syncing: number;
    failed: number;
  }> {
    const all = await this.getQueuedOperations();
    return {
      total: all.length,
      pending: all.filter(op => op.status === 'pending').length,
      syncing: all.filter(op => op.status === 'syncing').length,
      failed: all.filter(op => op.status === 'failed').length,
    };
  }
}

// Export singleton instance
export const offlineSyncService = new OfflineSyncService();
