import React, { lazy, useEffect } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { persistOptions } from '@/lib/queryPersister';
import { queryClient } from '@/lib/queryClient';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { pageView } from '@/telemetry/events';
import { ConsumerSubscriptionProvider } from './hooks/useConsumerSubscription';
import { MobileAppLayout } from './components/mobile/MobileAppLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LazyRoute } from './components/LazyRoute';
import { BootHydrationFallback } from './components/home/DashboardSkeleton';
import { ProtectedRoute } from './components/ProtectedRoute';
import { InternalAdminRoute } from './components/InternalAdminRoute';
import { performanceService } from './services/performanceService';
import { useDemoModeStore } from './store/demoModeStore';
import { errorTracking } from './services/errorTracking';
import { supabase } from './integrations/supabase/client';
import { AppInitializer } from './components/app/AppInitializer';
import { OfflineIndicator } from './components/OfflineIndicator';

import { ExitDemoButton } from './components/demo';

import { setupGlobalSyncProcessor } from './services/globalSyncProcessor';
import { useSwUpdate } from '@/hooks/useSwUpdate';
import {
  installChunkErrorRecovery,
  markAppBooted,
  claimOneShotReload,
} from '@/utils/chunkRecovery';
import { safeReload } from '@/utils/safeReload';
import { retryImport } from '@/lib/retryImport';
import { importAuthPage } from '@/lib/routeChunks';
import { getPublicSeoRoute, SEO_LANDING_CONTENT } from '@/lib/seo';
import { syncRobotsAndCanonical } from '@/components/seo/SeoHead';
import { NativePushRouter } from '@/components/notifications/NativePushRouter';

// Lazy load pages for better performance
const Index = lazy(() => retryImport(() => import('./pages/Index')));
const TripDetail = lazy(() => retryImport(() => import('./pages/TripDetail')));
const DemoTripGate = lazy(() => retryImport(() => import('./pages/DemoTripGate')));

const ProTripDetail = lazy(() => retryImport(() => import('./pages/ProTripDetail')));
const EventDetail = lazy(() => retryImport(() => import('./pages/EventDetail')));
const NotFound = lazy(() => retryImport(() => import('./pages/NotFound')));
const JoinTrip = lazy(() => retryImport(() => import('./pages/JoinTrip')));
const InviteSlugRedirect = lazy(() => retryImport(() => import('./pages/InviteSlugRedirect')));
const ProfilePage = lazy(() => retryImport(() => import('./pages/ProfilePage')));
const SettingsPage = lazy(() => retryImport(() => import('./pages/SettingsPage')));
const ArchivePage = lazy(() => retryImport(() => import('./pages/ArchivePage')));
const DevBillingPreview = lazy(() => retryImport(() => import('./pages/DevBillingPreview')));
const SubscriptionStatus = lazy(() => retryImport(() => import('./pages/SubscriptionStatus')));
const AdminDashboard = lazy(() =>
  retryImport(() =>
    import('./pages/AdminDashboard').then(module => ({ default: module.AdminDashboard })),
  ),
);
const SeoDashboard = lazy(() => retryImport(() => import('./pages/admin/SeoDashboard')));
const OrganizationDashboard = lazy(() =>
  retryImport(() =>
    import('./pages/OrganizationDashboard').then(module => ({
      default: module.OrganizationDashboard,
    })),
  ),
);
const OrganizationsHub = lazy(() =>
  retryImport(() =>
    import('./pages/OrganizationsHub').then(module => ({ default: module.OrganizationsHub })),
  ),
);
const AcceptOrganizationInvite = lazy(() =>
  retryImport(() =>
    import('./pages/AcceptOrganizationInvite').then(module => ({
      default: module.AcceptOrganizationInvite,
    })),
  ),
);
const ChravelRecsPage = lazy(() =>
  retryImport(() =>
    import('./pages/ChravelRecsPage').then(module => ({ default: module.ChravelRecsPage })),
  ),
);
const ForTeams = lazy(() =>
  retryImport(() => import('./pages/ForTeams').then(module => ({ default: module.ForTeams }))),
);
const AdvertiserDashboard = lazy(() => retryImport(() => import('./pages/AdvertiserDashboard')));
const Healthz = lazy(() => retryImport(() => import('./pages/Healthz')));
const PrivacyPolicy = lazy(() => retryImport(() => import('./pages/PrivacyPolicy')));
const SupportPage = lazy(() => retryImport(() => import('./pages/SupportPage')));
const TermsOfService = lazy(() => retryImport(() => import('./pages/TermsOfService')));
const OAuthConsent = lazy(() => retryImport(() => import('./pages/OAuthConsent')));
const DeleteAccountPage = lazy(() => retryImport(() => import('./pages/DeleteAccountPage')));
const GmailCallbackPage = lazy(() =>
  retryImport(() =>
    import('./pages/GmailCallbackPage').then(module => ({ default: module.GmailCallbackPage })),
  ),
);
const DemoEntry = lazy(() => retryImport(() => import('./pages/DemoEntry')));
const TripPreview = lazy(() => retryImport(() => import('./pages/TripPreview')));
// Shares its import() loader with main.tsx's boot warm-up via routeChunks.ts.
const AuthPage = lazy(() => retryImport(importAuthPage));
const AuthCallbackPage = lazy(() => retryImport(() => import('./pages/AuthCallbackPage')));
const ResetPasswordPage = lazy(() => retryImport(() => import('./pages/ResetPasswordPage')));
const SeoLandingPage = lazy(() => retryImport(() => import('./pages/SeoLandingPage')));
const UseCasesHub = lazy(() => retryImport(() => import('./pages/UseCasesHub')));
const UseCasePage = lazy(() => retryImport(() => import('./pages/UseCasePage')));
const BlogIndex = lazy(() => retryImport(() => import('./pages/BlogIndex')));
const BlogPost = lazy(() => retryImport(() => import('./pages/BlogPost')));
const DeviceTestMatrix = lazy(() => retryImport(() => import('./pages/DeviceTestMatrix')));
// AdminMigrateDemoImages removed - migration complete, images now in Supabase Storage

// Note: Large components are already optimized with code splitting

// Legacy redirect for old pro trip URLs using hyphen format
const LegacyProTripRedirect = () => {
  const { proTripId } = useParams();
  return <Navigate to={`/tour/pro/${proTripId}`} replace />;
};

// Always use BrowserRouter - Lovable preview now supports SPA routing
const Router = BrowserRouter;

// Adapter component: renders the global floating ExitDemoButton inside Router context.
// On trip/event detail routes the exit affordance lives in the in-layout <DemoTripBar />
// (above the menu pills) instead, so the floating button is suppressed there to avoid
// overlapping the header back button and the pills row. The single-segment patterns below
// only match the detail routes themselves — /trip/:id/preview has an extra segment and so
// still gets the floating button.
const ExitDemoButtonWithNav = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isTripDetailRoute =
    /^\/trip\/[^/]+\/?$/.test(pathname) || /^\/event\/[^/]+\/?$/.test(pathname);
  if (isTripDetailRoute) return null;
  return <ExitDemoButton onNavigate={() => navigate('/')} />;
};

/** Tracks page views on route changes via the telemetry service. */
const PageViewTracker = () => {
  const { pathname } = useLocation();
  const prevPathRef = React.useRef(pathname);

  useEffect(() => {
    if (pathname !== prevPathRef.current) {
      prevPathRef.current = pathname;
      pageView(pathname);
    }
  }, [pathname]);

  // Also fire on initial mount
  useEffect(() => {
    pageView(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

const OfflineIndicatorGate = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const isPublicRoute =
    pathname === '/' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/join') ||
    pathname.startsWith('/j/') ||
    pathname.startsWith('/accept-invite') ||
    pathname.startsWith('/teams') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/support') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/delete-account') ||
    pathname.startsWith('/demo') ||
    pathname.startsWith('/healthz');

  if (!user || isPublicRoute) return null;
  return <OfflineIndicator />;
};

const RouteHeadPolicySync = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    syncRobotsAndCanonical(pathname);
  }, [pathname]);

  return null;
};

// Per-route error isolation. Keyed by pathname so a render error in one of the ~25 lazy
// routes shows the boundary fallback for THAT route only — the app shell/nav (rendered by
// MobileAppLayout, outside this boundary) stays interactive — and navigating to another
// route remounts the boundary and clears the error. Without the key, the top-level
// ErrorBoundary keeps the whole app blanked until a full reload.
const RouteErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
};

const App = () => {
  // ⚡ PERFORMANCE: Initialize demo mode synchronously on first render (not at module load)
  // Moving this inside the component prevents "dispatcher.useState" errors on some platforms
  React.useMemo(() => {
    useDemoModeStore.getState().init();
  }, []);

  // The full app shell mounted — its chunks loaded successfully. Clear the one-shot
  // chunk-recovery guard so a later, independent stale-chunk error can recover too.
  // (The app-icon badge is reconciled in AppInitializer via useAppBadge, not here.)
  useEffect(() => {
    markAppBooted();
    performanceService.markBootPhase('app_mounted');
  }, []);

  // Track app initialization performance
  const stopTiming = performanceService.startTiming('App Initialization');

  React.useEffect(() => {
    stopTiming();
  }, [stopTiming]);

  // Initialize error tracking with user context
  useEffect(() => {
    errorTracking.init({ environment: import.meta.env.MODE });

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        errorTracking.setUser(data.user.id);
      }
    });
  }, []);

  // Show toast when a new service worker is installed and waiting to activate
  useSwUpdate();

  // Setup global offline sync processor
  useEffect(() => {
    return setupGlobalSyncProcessor();
  }, []);

  // Breaking-only version check - only triggers for true breaking changes (manually incremented)
  useEffect(() => {
    try {
      const BREAKING_VERSION_KEY = 'chravel_breaking_version';
      const CURRENT_BREAKING_VERSION = '1'; // Only increment for true breaking changes (auth, API, schema)

      const storedBreaking = localStorage.getItem(BREAKING_VERSION_KEY);

      // First visit - store and continue
      if (!storedBreaking) {
        localStorage.setItem(BREAKING_VERSION_KEY, CURRENT_BREAKING_VERSION);
        return;
      }

      // Breaking change detected - force reload silently. Guarded so it reloads at
      // most once per session: if localStorage can't persist the new version (e.g.
      // restricted WebView storage), this would otherwise reload-loop into a blank.
      if (
        storedBreaking !== CURRENT_BREAKING_VERSION &&
        claimOneShotReload('breaking_version_reload')
      ) {
        if ('caches' in window) {
          caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))));
        }
        localStorage.setItem(BREAKING_VERSION_KEY, CURRENT_BREAKING_VERSION);
        safeReload(true);
      }
    } catch {
      // Ignore in restricted environments (sandboxed previews)
    }
  }, []);

  // Silent update check on visibility change (native app-style updates)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && 'serviceWorker' in navigator) {
        // Silently check for SW updates when app becomes visible
        navigator.serviceWorker.ready.then(registration => {
          registration.update().catch(() => {
            // Silently ignore update check failures
          });
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Auto-recover from post-deploy stale-chunk failures (shared, one-shot guarded).
  // Also installed at module scope in main.tsx so a failed app-root chunk import is
  // caught even before this component mounts.
  useEffect(() => installChunkErrorRecovery(), []);

  return (
    <ErrorBoundary>
      {/* Global SVG gradient definition for metallic gold icons */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id="gold-metallic-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#533517" />
            <stop offset="40%" stopColor="#c49746" />
            <stop offset="70%" stopColor="#feeaa5" />
            <stop offset="100%" stopColor="#c49746" />
          </linearGradient>
        </defs>
      </svg>
      {/* PersistQueryClientProvider restores the allowlisted IDB cache before
          queries run (warm starts paint last-known data instantly), then acts
          as a normal QueryClientProvider. Safety model in queryPersister.ts. */}
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <AuthProvider>
          <ConsumerSubscriptionProvider>
            <AppInitializer>
              <TooltipProvider>
                <Toaster />
                <Sonner />

                {/* All components using react-router hooks must render inside <Router> */}
                <Router>
                  <PageViewTracker />
                  <RouteHeadPolicySync />
                  <NativePushRouter />
                  <ExitDemoButtonWithNav />
                  <OfflineIndicatorGate />
                  <MobileAppLayout>
                    <RouteErrorBoundary>
                      <Routes>
                        <Route
                          path="/"
                          element={
                            <LazyRoute fallback={<BootHydrationFallback />}>
                              <Index />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/api/gmail/oauth/callback"
                          element={
                            <LazyRoute>
                              <GmailCallbackPage />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/.lovable/oauth/consent"
                          element={
                            <LazyRoute>
                              <OAuthConsent />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/trip/:tripId"
                          element={
                            <LazyRoute fallback={<BootHydrationFallback variant="trip" />}>
                              <TripDetail />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/trip/:tripId/preview"
                          element={
                            <LazyRoute>
                              <TripPreview />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/t/:tripId"
                          element={
                            <LazyRoute>
                              <TripPreview />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/demo/trip/:demoTripId"
                          element={
                            <LazyRoute>
                              <DemoTripGate />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/demo"
                          element={
                            <LazyRoute>
                              <DemoEntry />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/auth"
                          element={
                            <LazyRoute>
                              <AuthPage />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/auth-callback"
                          element={
                            <LazyRoute>
                              <AuthCallbackPage />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/reset-password"
                          element={
                            <LazyRoute>
                              <ResetPasswordPage />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/join/:token"
                          element={
                            <LazyRoute>
                              <JoinTrip />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/j/:token"
                          element={
                            <LazyRoute>
                              <InviteSlugRedirect />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/tour/pro/:proTripId"
                          element={
                            <LazyRoute>
                              <ProTripDetail />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/tour/pro-:proTripId"
                          element={
                            <LazyRoute>
                              <LegacyProTripRedirect />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/event/:eventId"
                          element={
                            <LazyRoute>
                              <EventDetail />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/trip-planner"
                          element={
                            <LazyRoute>
                              {(() => {
                                const config = getPublicSeoRoute('/trip-planner');
                                if (!config) return null;
                                return (
                                  <SeoLandingPage
                                    config={config}
                                    h1={SEO_LANDING_CONTENT['/trip-planner'].h1}
                                    intro={SEO_LANDING_CONTENT['/trip-planner'].intro}
                                    faq={[
                                      {
                                        q: 'Can ChravelApp replace multiple planning tools?',
                                        a: 'ChravelApp centralizes communication, itinerary, tasks, and group coordination so teams rely less on disconnected apps.',
                                      },
                                      {
                                        q: 'Is ChravelApp only for leisure travel?',
                                        a: 'No. ChravelApp supports friend trips, events, and pro travel workflows where logistics and visibility matter.',
                                      },
                                    ]}
                                  />
                                );
                              })()}
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/group-trip-planner"
                          element={
                            <LazyRoute>
                              {(() => {
                                const config = getPublicSeoRoute('/group-trip-planner');
                                if (!config) return null;
                                return (
                                  <SeoLandingPage
                                    config={config}
                                    h1={SEO_LANDING_CONTENT['/group-trip-planner'].h1}
                                    intro={SEO_LANDING_CONTENT['/group-trip-planner'].intro}
                                    faq={[
                                      {
                                        q: 'Can ChravelApp replace multiple planning tools?',
                                        a: 'ChravelApp centralizes communication, itinerary, tasks, and group coordination so teams rely less on disconnected apps.',
                                      },
                                      {
                                        q: 'Is ChravelApp only for leisure travel?',
                                        a: 'No. ChravelApp supports friend trips, events, and pro travel workflows where logistics and visibility matter.',
                                      },
                                    ]}
                                  />
                                );
                              })()}
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/group-travel"
                          element={
                            <LazyRoute>
                              {(() => {
                                const config = getPublicSeoRoute('/group-travel');
                                if (!config) return null;
                                return (
                                  <SeoLandingPage
                                    config={config}
                                    h1={SEO_LANDING_CONTENT['/group-travel'].h1}
                                    intro={SEO_LANDING_CONTENT['/group-travel'].intro}
                                    faq={[
                                      {
                                        q: 'Can ChravelApp replace multiple planning tools?',
                                        a: 'ChravelApp centralizes communication, itinerary, tasks, and group coordination so teams rely less on disconnected apps.',
                                      },
                                      {
                                        q: 'Is ChravelApp only for leisure travel?',
                                        a: 'No. ChravelApp supports friend trips, events, and pro travel workflows where logistics and visibility matter.',
                                      },
                                    ]}
                                  />
                                );
                              })()}
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/how-to-plan-a-trip-with-friends"
                          element={
                            <LazyRoute>
                              {(() => {
                                const config = getPublicSeoRoute(
                                  '/how-to-plan-a-trip-with-friends',
                                );
                                if (!config) return null;
                                return (
                                  <SeoLandingPage
                                    config={config}
                                    h1={SEO_LANDING_CONTENT['/how-to-plan-a-trip-with-friends'].h1}
                                    intro={
                                      SEO_LANDING_CONTENT['/how-to-plan-a-trip-with-friends'].intro
                                    }
                                    faq={[
                                      {
                                        q: 'Can ChravelApp replace multiple planning tools?',
                                        a: 'ChravelApp centralizes communication, itinerary, tasks, and group coordination so teams rely less on disconnected apps.',
                                      },
                                      {
                                        q: 'Is ChravelApp only for leisure travel?',
                                        a: 'No. ChravelApp supports friend trips, events, and pro travel workflows where logistics and visibility matter.',
                                      },
                                    ]}
                                  />
                                );
                              })()}
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/group-travel-planning-app"
                          element={
                            <LazyRoute>
                              {(() => {
                                const config = getPublicSeoRoute('/group-travel-planning-app');
                                if (!config) return null;
                                return (
                                  <SeoLandingPage
                                    config={config}
                                    h1={SEO_LANDING_CONTENT['/group-travel-planning-app'].h1}
                                    intro={SEO_LANDING_CONTENT['/group-travel-planning-app'].intro}
                                    faq={[
                                      {
                                        q: 'How is ChravelApp different from Wanderlog or TripIt?',
                                        a: 'Wanderlog and TripIt focus on itinerary storage. ChravelApp adds a real group chat, polls, tasks, shared places, and split payments — so coordination and conversation live in the same place.',
                                      },
                                      {
                                        q: 'Is there a free plan for group travel planning?',
                                        a: 'Yes. ChravelApp is free for small groups, with paid tiers for larger trips, pro touring teams, and events.',
                                      },
                                      {
                                        q: 'Does it work on iPhone, Android, and web?',
                                        a: 'Yes — ChravelApp runs as a web app and an installable PWA on iOS and Android, with full feature parity for group trip planning.',
                                      },
                                    ]}
                                  />
                                );
                              })()}
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/use-cases"
                          element={
                            <LazyRoute>
                              <UseCasesHub />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/use-cases/:slug"
                          element={
                            <LazyRoute>
                              <UseCasePage />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/blog"
                          element={
                            <LazyRoute>
                              <BlogIndex />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/blog/:slug"
                          element={
                            <LazyRoute>
                              <BlogPost />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/teams"
                          element={
                            <LazyRoute>
                              <ForTeams />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/recs"
                          element={
                            <LazyRoute>
                              <InternalAdminRoute allowDemoPreview>
                                <ChravelRecsPage />
                              </InternalAdminRoute>
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/advertiser"
                          element={
                            <LazyRoute>
                              <InternalAdminRoute allowDemoPreview>
                                <AdvertiserDashboard />
                              </InternalAdminRoute>
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/healthz"
                          element={
                            <LazyRoute>
                              <Healthz />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/privacy"
                          element={
                            <LazyRoute>
                              <PrivacyPolicy />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/support"
                          element={
                            <LazyRoute>
                              <SupportPage />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/terms"
                          element={
                            <LazyRoute>
                              <TermsOfService />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/delete-account"
                          element={
                            <LazyRoute>
                              <DeleteAccountPage />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/profile"
                          element={
                            <LazyRoute>
                              <ProtectedRoute>
                                <ProfilePage />
                              </ProtectedRoute>
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/settings"
                          element={
                            <LazyRoute>
                              <ProtectedRoute>
                                <SettingsPage />
                              </ProtectedRoute>
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/archive"
                          element={
                            <LazyRoute>
                              <ProtectedRoute>
                                <ArchivePage />
                              </ProtectedRoute>
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/dev/billing-preview"
                          element={
                            <LazyRoute>
                              <DevBillingPreview />
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/settings/subscription"
                          element={
                            <ProtectedRoute>
                              <LazyRoute>
                                <SubscriptionStatus />
                              </LazyRoute>
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/admin/scheduled-messages"
                          element={
                            <LazyRoute>
                              <InternalAdminRoute>
                                <AdminDashboard />
                              </InternalAdminRoute>
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/admin/seo"
                          element={
                            <LazyRoute>
                              <InternalAdminRoute>
                                <SeoDashboard />
                              </InternalAdminRoute>
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/organizations"
                          element={
                            <LazyRoute>
                              <ProtectedRoute>
                                <OrganizationsHub />
                              </ProtectedRoute>
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/organization/:orgId"
                          element={
                            <LazyRoute>
                              <ProtectedRoute>
                                <OrganizationDashboard />
                              </ProtectedRoute>
                            </LazyRoute>
                          }
                        />
                        <Route
                          path="/accept-invite/:token"
                          element={
                            <LazyRoute>
                              <AcceptOrganizationInvite />
                            </LazyRoute>
                          }
                        />
                        {import.meta.env.DEV && (
                          <Route
                            path="/dev/device-matrix"
                            element={
                              <LazyRoute>
                                <DeviceTestMatrix />
                              </LazyRoute>
                            }
                          />
                        )}
                        <Route
                          path="*"
                          element={
                            <LazyRoute>
                              <NotFound />
                            </LazyRoute>
                          }
                        />
                      </Routes>
                    </RouteErrorBoundary>
                  </MobileAppLayout>
                </Router>
              </TooltipProvider>
            </AppInitializer>
          </ConsumerSubscriptionProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
