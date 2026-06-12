/**
 * Storage access that never throws.
 *
 * Restricted environments (private-mode Safari, cookie-blocked Chrome,
 * sandboxed previews, some Capacitor WebViews) can throw on ANY storage touch —
 * including merely referencing `window.localStorage`. That's why these helpers
 * take a storage *kind* instead of a `Storage` object: passing `localStorage`
 * as an argument would evaluate the throwing getter at the call site, outside
 * any try/catch.
 */

export type StorageKind = 'local' | 'session';

/** Resolve a Storage instance, or null when the environment forbids access. */
export function getSafeStorage(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function safeGetItem(kind: StorageKind, key: string): string | null {
  try {
    return getSafeStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** @returns true when the write actually persisted. */
export function safeSetItem(kind: StorageKind, key: string, value: string): boolean {
  try {
    const storage = getSafeStorage(kind);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(kind: StorageKind, key: string): void {
  try {
    getSafeStorage(kind)?.removeItem(key);
  } catch {
    // best-effort
  }
}
