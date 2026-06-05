/**
 * Shared chunk-load-failure detection + one-shot recovery.
 *
 * After a deploy, the hashed asset filenames change. A client holding a stale
 * `index.html` (or served one by a stale service worker / sticky WebView cache)
 * requests chunk filenames that no longer exist → the dynamic `import()` rejects
 * with a "failed to fetch dynamically imported module" error. With the lazy app
 * root unmounted, that presents as a blank/black screen.
 *
 * Recovery = clear caches + unregister service workers + hard reload (via
 * `safeReload(true)`), but guarded so it runs AT MOST ONCE per session. Without
 * that guard, a cache that refuses to clear (e.g. inside an iOS WKWebView) would
 * reload → fail → reload forever. After a successful boot, callers should call
 * `markAppBooted()` so a later, independent stale-chunk error can still recover.
 */

import { safeReload } from '@/utils/safeReload';

const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported',
  'error loading dynamically imported module',
  'Loading chunk',
  'ChunkLoadError',
  'Loading CSS chunk',
  'Importing a module script failed',
  'Failed to load module script',
] as const;

const RECOVERY_FLAG = 'chravel_chunk_recovery_attempted';

let recoveryInFlight = false;

/** True when the error looks like a post-deploy stale-chunk / module-load failure. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message =
    error instanceof Error
      ? error.message || String(error)
      : typeof error === 'string'
        ? error
        : String((error as { message?: unknown })?.message ?? error);
  return CHUNK_ERROR_PATTERNS.some(pattern => message.includes(pattern));
}

function recoveryAlreadyAttempted(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_FLAG) === '1';
  } catch {
    // No sessionStorage (restricted WebView) — assume not attempted so a genuine
    // first failure can still recover. The in-flight guard below prevents a tight loop.
    return false;
  }
}

function markRecoveryAttempted(): void {
  try {
    sessionStorage.setItem(RECOVERY_FLAG, '1');
  } catch {
    // ignore — restricted storage
  }
}

/**
 * Clear the one-shot guard once the app has booted successfully, so a later,
 * independent stale-chunk error (e.g. navigating to a lazy route after another
 * deploy mid-session) can recover too. Safe to call on every successful mount.
 */
export function markAppBooted(): void {
  recoveryInFlight = false;
  try {
    sessionStorage.removeItem(RECOVERY_FLAG);
  } catch {
    // ignore — restricted storage
  }
}

/**
 * Generic one-shot guard for self-initiated reloads (version/cache-bust reloads).
 * Returns `true` the FIRST time it's called with a given key this session, `false`
 * afterwards — so a reload that fails to fix the condition can't loop. Falls back to
 * allowing the reload when sessionStorage is unavailable (a needed reload beats a
 * blocked one; the in-flight guards on the callers prevent a tight loop).
 */
export function claimOneShotReload(key: string): boolean {
  try {
    if (sessionStorage.getItem(key) === '1') return false;
    sessionStorage.setItem(key, '1');
    return true;
  } catch {
    return true;
  }
}

/**
 * Recover from a stale-chunk failure exactly once per session.
 * @returns `true` if a recovery reload was triggered, `false` if recovery was
 *   already attempted this session (caller should show a fallback, not loop).
 */
export async function recoverFromChunkError(): Promise<boolean> {
  // Primary one-shot guard — the sessionStorage flag is set synchronously below and
  // survives the reload, so a still-failing reload comes back here and returns false
  // (caller shows a fallback instead of looping). Also dedupes concurrent calls.
  if (recoveryAlreadyAttempted()) return false;
  // Secondary guard for environments where sessionStorage is unavailable, so the
  // flag never persists: prevent two near-simultaneous calls from double-reloading.
  if (recoveryInFlight) return true;

  recoveryInFlight = true;
  markRecoveryAttempted();
  try {
    // Clears caches + unregisters service workers, then hard-reloads.
    await safeReload(true);
  } catch {
    recoveryInFlight = false;
  }
  return true;
}

/**
 * Register window-level listeners that auto-recover from chunk-load failures that
 * escape React's render path (e.g. a rejected dynamic import for the lazy app root
 * itself, before any error boundary mounts). Returns a cleanup function.
 */
export function installChunkErrorRecovery(): () => void {
  const onRejection = (event: PromiseRejectionEvent) => {
    if (isChunkLoadError(event.reason)) {
      void recoverFromChunkError();
    }
  };
  const onError = (event: ErrorEvent) => {
    if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
      void recoverFromChunkError();
    }
  };

  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('error', onError);
  return () => {
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('error', onError);
  };
}
