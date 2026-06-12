/**
 * Cold-start bootstrap: whether anonymous `/` should mount the lightweight
 * MarketingApp shell vs the full App router.
 *
 * Installed surfaces (PWA standalone, Capacitor, chravel-mobile WebView) must
 * never use the marketing split — they need Index's installed-app auth gate and
 * trip routes on first paint.
 */

export const AUTH_STORAGE_MARKERS = [
  'supabase.auth.token',
  'sb-',
  'chravel-auth',
  'firebase:authUser',
] as const;

export function storageContainsAuthMarker(storage: Storage): boolean {
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && AUTH_STORAGE_MARKERS.some(marker => key.includes(marker))) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

export function hasAuthStorageMarker(options: {
  localStorage: Storage | null;
  sessionStorage: Storage | null;
  cookieIncludes: (needle: string) => boolean;
}): boolean {
  const { localStorage, sessionStorage, cookieIncludes } = options;

  if (localStorage && storageContainsAuthMarker(localStorage)) return true;
  if (sessionStorage && storageContainsAuthMarker(sessionStorage)) return true;

  return AUTH_STORAGE_MARKERS.some(marker => cookieIncludes(marker));
}

/** True when an unauthenticated visitor lands on `/` with no persisted auth markers. */
export function isAnonymousRootRoute(pathname: string, hasAuthMarker: boolean): boolean {
  if (pathname !== '/') return false;
  return !hasAuthMarker;
}

export interface MarketingBootstrapInput {
  marketingSplitEnabled: boolean;
  pathname: string;
  hasAuthMarker: boolean;
  /** PWA standalone, Capacitor, or chravel-mobile native WebView */
  isInstalledApp: boolean;
  /** Escape hatch (e.g. `?marketing=1`) to force the marketing shell regardless of auth marker / path. */
  forceMarketing?: boolean;
}

/**
 * Anonymous browser visitors to `/` boot MarketingApp for faster first paint.
 * Native/TestFlight/PWA-installed shells always boot the full App.
 * `forceMarketing` overrides the auth-marker, installed-shell, and path checks so the
 * landing page can be previewed even when a stale Supabase session is cached.
 */
export function shouldUseMarketingBootstrap(input: MarketingBootstrapInput): boolean {
  if (!input.marketingSplitEnabled) return false;
  if (input.forceMarketing) return true;
  if (input.isInstalledApp) return false;
  return isAnonymousRootRoute(input.pathname, input.hasAuthMarker);
}
