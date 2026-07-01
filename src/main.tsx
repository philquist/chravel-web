import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { TripVariantProvider } from '@/contexts/TripVariantContext';
import { BasecampProvider } from '@/contexts/BasecampContext';
import { RuntimeConfigError } from '@/components/RuntimeConfigError';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { registerServiceWorker } from './utils/serviceWorkerRegistration';
import { setupGlobalPurchaseListener } from '@/integrations/revenuecat/revenuecatClient';
import { getMissingSupabaseEnvVars } from '@/integrations/supabase/config';
import { telemetry } from '@/telemetry/service';
import { isLovablePreview } from './utils/env';
import { hasAuthStorageMarker, shouldUseMarketingBootstrap } from './lib/bootstrapShell';
import { isChravelNativeShell, isInstalledApp } from './utils/platformDetection';
import { installChunkErrorRecovery, claimOneShotReload } from '@/utils/chunkRecovery';
import { warmRouteChunksForPath } from './lib/routeChunks';
import { getSafeStorage, safeGetItem, safeSetItem } from '@/utils/safeStorage';
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/400-italic.css';
import './index.css';

// Boot-timeline anchor: raw mark (not performanceService) so the entry chunk
// stays lean. performanceService reads it back when reporting `boot_timeline`.
try {
  performance.mark('chravel-boot:entry');
} catch {
  // ignore — older embedded WebViews without performance.mark
}

// ── Startup env validation ──────────────────────────────────────────────────
// Supabase config is required at runtime. Accept either the modern
// publishable key or legacy anon key.
const missingEnvVars = getMissingSupabaseEnvVars(import.meta.env);
if (missingEnvVars.length > 0) {
  console.warn(`[Chravel] Missing env vars: ${missingEnvVars.join(', ')}.`);
}
const hasRequiredSupabaseEnv = missingEnvVars.length === 0;
const App = hasRequiredSupabaseEnv ? lazy(() => import('./App.tsx')) : null;
const MarketingApp = hasRequiredSupabaseEnv ? lazy(() => import('./MarketingApp.tsx')) : null;

// Kick off route-critical chunks in parallel with App.tsx. The manifest in
// routeChunks.ts shares its import() loaders with App.tsx's lazy() routes, so
// the warmed chunk can never drift from the chunk the router actually renders.
if (hasRequiredSupabaseEnv && typeof window !== 'undefined') {
  warmRouteChunksForPath(window.location.pathname);
}

// ── Imperative init (runs after all imports are resolved) ──────────────────

const safeCookieIncludes = (needle: string): boolean => {
  try {
    return document.cookie.includes(needle);
  } catch {
    return false;
  }
};

// getSafeStorage: merely referencing `localStorage` throws in cookie-blocked
// browsers — at module scope that would black-screen the app before boot.
const hasAuthMarkerOnBoot =
  typeof window !== 'undefined' &&
  hasAuthStorageMarker({
    localStorage: getSafeStorage('local'),
    sessionStorage: getSafeStorage('session'),
    cookieIncludes: safeCookieIncludes,
  });

// Anonymous browser visitors to `/` boot MarketingApp for faster first paint.
// Installed shells (PWA, Capacitor, chravel-mobile TestFlight) always boot App
// so Index can show the in-app auth gate instead of the marketing landing.
// Set VITE_MARKETING_SPLIT=0 to force legacy bootstrap if ever needed.
const shouldUseMarketingSplit =
  typeof window !== 'undefined' &&
  shouldUseMarketingBootstrap({
    marketingSplitEnabled: import.meta.env.VITE_MARKETING_SPLIT !== '0',
    pathname: window.location.pathname,
    hasAuthMarker: hasAuthMarkerOnBoot,
    isInstalledApp: isInstalledApp(),
    forceMarketing:
      window.location.search.includes('marketing=1') ||
      window.location.pathname === '/home' ||
      window.location.pathname === '/index',
  });

// Warm the cold-start route's page chunk in parallel with the App.tsx chunk —
// same trick as the /auth warm-up above. Without this the page chunk is a
// serial network hop AFTER App.tsx parses (index.html → entry → App → page),
// which is the dominant cold-start cost in the native shell where no service
// worker caches chunks. Vite dedupes the import promise, so the lazy() route
// in App.tsx resolves instantly from the in-flight request.
if (hasRequiredSupabaseEnv && typeof window !== 'undefined') {
  const bootPath = window.location.pathname;
  if (bootPath === '/' && !shouldUseMarketingSplit) {
    void import('./pages/Index');
  } else if (bootPath.startsWith('/trip/')) {
    void import('./pages/TripDetail');
  }
}
const safeLocalStorageSet = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures in restricted environments (e.g. sandboxed previews)
  }
};

const clearAllCaches = (): void => {
  if ('caches' in window) {
    caches
      .keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .catch(() => {});
  }
};

const scheduleWhenIdle = (task: () => void): void => {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => task());
    return;
  }

  setTimeout(task, 0);
};

const isPublicAnonymousBootstrapRoute = (): boolean => {
  const path = window.location.pathname;
  const isPublicRoute =
    path === '/' ||
    path.startsWith('/auth') ||
    path.startsWith('/reset-password') ||
    path.startsWith('/join') ||
    path.startsWith('/j/') ||
    path.startsWith('/accept-invite') ||
    path.startsWith('/teams') ||
    path.startsWith('/recs') ||
    path.startsWith('/advertiser') ||
    path.startsWith('/privacy') ||
    path.startsWith('/support') ||
    path.startsWith('/terms') ||
    path.startsWith('/delete-account') ||
    path.startsWith('/demo') ||
    path.startsWith('/healthz');

  // Same boot-time heuristic as the marketing split: a persisted auth *marker*
  // (bootstrapShell.AUTH_STORAGE_MARKERS) means "likely authenticated" — it is
  // NOT a verified session, just enough signal to decide whether a version-bust
  // reload is worth paying a second cold load. Canonical session checks live in
  // useAuth, after hydration.
  return isPublicRoute && !hasAuthMarkerOnBoot;
};

// Native shell handles its own caching and lifecycle — service workers add startup
// cost (registration, activation) without benefit inside the WebView.
const inNativeShell = isChravelNativeShell();

if ('serviceWorker' in navigator) {
  if (inNativeShell) {
    // The native shell must NEVER have a service worker. A SW registered by an
    // earlier build persists inside the WKWebView and keeps serving a stale
    // index.html + old chunk hashes; after a deploy churns those hashes, every
    // dynamic import() 404s → blank screen that survives app updates. Tear down
    // any legacy SW and its caches on every cold start (we never re-register one
    // below in the native shell).
    navigator.serviceWorker
      .getRegistrations()
      .then(registrations => {
        if (registrations.length === 0) return;
        return Promise.all(registrations.map(reg => reg.unregister())).then(() => {
          if ('caches' in window) {
            return caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
          }
        });
      })
      .catch(() => {});
  } else if (navigator.serviceWorker.controller !== null) {
    // Web/PWA: unregister stale service workers from old hosts on first load.
    navigator.serviceWorker
      .getRegistrations()
      .then(registrations => {
        registrations.forEach(reg => reg.unregister());
      })
      .catch(() => {});
  }
}

// Recover from post-deploy stale-chunk failures even if the lazy app-root chunk
// itself fails to load (before any React error boundary can mount). One-shot
// guarded inside the util so an un-clearable cache can't reload-loop.
installChunkErrorRecovery();

// Startup breadcrumb — with no device logs available from the native shell, this
// makes the cold-start environment visible in any attached console.
try {
  console.info(
    '[startup] nativeShell=%s swController=%s ua=%s',
    inNativeShell,
    'serviceWorker' in navigator ? navigator.serviceWorker.controller !== null : 'n/a',
    typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a',
  );
} catch {
  // ignore
}

// Initialize theme
const theme = safeGetItem('local', 'theme');
if (theme === 'light') {
  document.documentElement.classList.add('light');
}

// Preview hardening: always clear stale caches (prevents sticky blank preview states)
if (isLovablePreview()) {
  clearAllCaches();
} else {
  // Version-based cache busting: clear caches when app version changes
  const STORED_VERSION_KEY = 'chravel_host_version';
  const currentVersion = (import.meta.env.VITE_APP_VERSION as string) || '0';
  const storedVersion = safeGetItem('local', STORED_VERSION_KEY);

  if (storedVersion !== null && storedVersion !== currentVersion) {
    clearAllCaches();
    safeSetItem('local', STORED_VERSION_KEY, currentVersion);

    // One-shot guard: if storage can't persist the new version (restricted WebView),
    // storedVersion stays stale and this would reload-loop into a blank screen.
    if (!isPublicAnonymousBootstrapRoute() && claimOneShotReload('host_version_reload')) {
      window.location.reload();
    }
    // Tradeoff: on public anonymous routes we accept a potentially stale auth session snapshot
    // to avoid paying a second cold load on landing after cache/version invalidation.
  } else {
    safeSetItem('local', STORED_VERSION_KEY, currentVersion);
  }
}

// Register service worker for offline support (web/PWA only — native shell has its own).
if (import.meta.env.PROD && !inNativeShell) {
  registerServiceWorker();
}

// Initialize PostHog analytics — defer in the native shell so it never competes
// with the auth route's first paint.
const initTelemetry = () =>
  telemetry.init().catch(err => console.warn('[Telemetry] Init failed:', err));
scheduleWhenIdle(initTelemetry);

// Global error listeners — catch unhandled errors outside React boundaries
window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  const error = e.reason instanceof Error ? e.reason : new Error(String(e.reason));

  if (document.readyState === 'complete') {
    telemetry.captureError(error, { context: 'unhandledrejection' });
    return;
  }

  scheduleWhenIdle(() => telemetry.captureError(error, { context: 'unhandledrejection' }));
});

window.addEventListener('error', (e: ErrorEvent) => {
  const error = e.error ?? new Error(e.message);

  if (document.readyState === 'complete') {
    telemetry.captureError(error, { context: 'window.onerror' });
    return;
  }

  scheduleWhenIdle(() => telemetry.captureError(error, { context: 'window.onerror' }));
});

// Initialize global listener for purchases only after non-marketing app shell paths.
const isMarketingShellPath =
  window.location.pathname === '/' || window.location.pathname.startsWith('/marketing');
if (!isMarketingShellPath) {
  scheduleWhenIdle(() => setupGlobalPurchaseListener());
}

// Release guard: set VITE_MARKETING_SPLIT=0 to force legacy App bootstrap.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Root error boundary: the App/MarketingApp shells are lazy, so a failed chunk
        import (e.g. a stale-cache 404 inside the native WebView) throws here during
        render with no boundary below it — producing a black screen. This catches it,
        auto-recovers from chunk errors, logs the real error via telemetry, and shows
        a branded fallback instead of a blank root. */}
    <ErrorBoundary>
      {hasRequiredSupabaseEnv && App ? (
        shouldUseMarketingSplit && MarketingApp ? (
          <MarketingApp />
        ) : (
          <TripVariantProvider variant="consumer">
            <BasecampProvider>
              <Suspense fallback={<div className="app-suspense-fallback" />}>
                <App />
              </Suspense>
            </BasecampProvider>
          </TripVariantProvider>
        )
      ) : (
        <RuntimeConfigError vars={missingEnvVars} />
      )}
    </ErrorBoundary>
  </StrictMode>,
);
