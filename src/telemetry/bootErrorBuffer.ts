/**
 * Durable buffer for errors thrown before telemetry providers initialize.
 *
 * The boot-crash window: telemetry.init() is deferred to idle, and Sentry lives
 * inside the lazy App.tsx chunk — so errors thrown between entry eval and provider
 * init have nowhere to go. Worse, a stale-chunk failure triggers a one-shot hard
 * reload (chunkRecovery), wiping any in-memory queue with it.
 *
 * sessionStorage survives same-tab reloads, so errors buffered here during a
 * crashed boot are drained and reported on the next successful init. Falls back
 * to an in-memory ring when sessionStorage is unavailable (restricted WebViews),
 * which still covers the same-boot init-at-idle window.
 */

import { safeGetItem, safeSetItem, safeRemoveItem } from '@/utils/safeStorage';

export interface BufferedBootError {
  name: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  ts: number;
}

const STORAGE_KEY = 'chravel_boot_errors';
const MAX_ENTRIES = 10;

let memoryBuffer: BufferedBootError[] = [];

function readPersisted(): BufferedBootError[] {
  const raw = safeGetItem('session', STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BufferedBootError[]) : [];
  } catch {
    return [];
  }
}

/**
 * Buffer an error that occurred before telemetry init. Ring-buffered at
 * MAX_ENTRIES so a render loop can't grow storage unboundedly.
 */
export function bufferBootError(error: Error, context?: Record<string, unknown>): void {
  const entry: BufferedBootError = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    context,
    ts: Date.now(),
  };

  const entries = readPersisted();
  entries.push(entry);
  const persisted = safeSetItem(
    'session',
    STORAGE_KEY,
    JSON.stringify(entries.slice(-MAX_ENTRIES)),
  );

  if (!persisted) {
    memoryBuffer.push(entry);
    memoryBuffer = memoryBuffer.slice(-MAX_ENTRIES);
  }
}

/**
 * Drain all buffered boot errors (persisted from this or a prior crashed boot,
 * plus the in-memory fallback) and clear the buffers. Called once at init.
 */
export function drainBootErrors(): BufferedBootError[] {
  const persisted = readPersisted();
  safeRemoveItem('session', STORAGE_KEY);

  const drained = [...persisted, ...memoryBuffer];
  memoryBuffer = [];
  return drained;
}
