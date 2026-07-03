import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import '@/styles/marketingFonts';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FullPageLanding } from '@/components/landing/FullPageLanding';
import { AuthProvider, useOptionalAuth } from '@/hooks/useAuth';
import { AuthModal } from '@/components/AuthModal';
import { isInstalledApp } from '@/utils/platformDetection';
import { markAppBooted } from '@/utils/chunkRecovery';

const BlogIndex = lazy(() => import('@/pages/BlogIndex'));
const BlogPost = lazy(() => import('@/pages/BlogPost'));
const UseCasesHub = lazy(() => import('@/pages/UseCasesHub'));
const UseCasePage = lazy(() => import('@/pages/UseCasePage'));

/**
 * After a successful sign-in inside the lightweight marketing shell, force a
 * full page navigation so `main.tsx` re-runs bootstrap auth detection, detects
 * the new Supabase auth marker in localStorage, and mounts the full <App />
 * shell with the dashboard router. Without this the user stays stuck on the
 * marketing landing because MarketingApp has no route for the dashboard.
 */
function PostAuthBoot() {
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const isLoading = auth?.isLoading ?? true;

  useEffect(() => {
    if (isLoading || !user) return;
    // Respect the `?marketing=1` / `/home` preview override — don't bounce a logged-in
    // viewer out of the marketing landing when they're explicitly previewing it.
    const forcedMarketing =
      window.location.search.includes('marketing=1') || window.location.pathname === '/home';
    if (forcedMarketing) return;
    window.location.assign('/');
  }, [user, isLoading]);

  return null;
}

/**
 * Safety net: if an installed/native shell ever mounts MarketingApp (stale SW,
 * deep link race), jump to /auth so main.tsx boots the full App router.
 * Respects the `?marketing=1` / `/home` / `/index` preview override.
 */
function InstalledShellEscape() {
  useEffect(() => {
    const forcedMarketing =
      window.location.search.includes('marketing=1') ||
      window.location.pathname === '/home' ||
      window.location.pathname === '/index';
    if (forcedMarketing) return;
    if (isInstalledApp()) {
      window.location.replace('/auth');
    }
  }, []);
  return null;
}

export default function MarketingApp() {
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | null>(null);
  const forcedMarketing =
    typeof window !== 'undefined' &&
    (window.location.search.includes('marketing=1') ||
      window.location.pathname === '/home' ||
      window.location.pathname === '/index');
  const installed = !forcedMarketing && isInstalledApp();

  // The marketing shell mounted — its chunk loaded successfully. Clear the one-shot
  // chunk-recovery guard so a later, independent stale-chunk error can recover too.
  useEffect(() => {
    markAppBooted();
  }, []);

  const fallback = useMemo(
    () => (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 animate-spin gold-gradient-spinner" />
      </div>
    ),
    [],
  );

  if (installed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        {fallback}
        <InstalledShellEscape />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <PostAuthBoot />
        <Suspense fallback={fallback}>
          <main data-marketing="true">
            <Routes>
              <Route
                path="/"
                element={
                  <FullPageLanding
                    onSignUp={() => setAuthMode('signup')}
                    onAuthRequired={() => setAuthMode('signin')}
                  />
                }
              />
              <Route
                path="/home"
                element={
                  <FullPageLanding
                    onSignUp={() => setAuthMode('signup')}
                    onAuthRequired={() => setAuthMode('signin')}
                  />
                }
              />
              <Route
                path="/index"
                element={
                  <FullPageLanding
                    onSignUp={() => setAuthMode('signup')}
                    onAuthRequired={() => setAuthMode('signin')}
                  />
                }
              />
              <Route path="/blog" element={<BlogIndex />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              <Route path="/use-cases" element={<UseCasesHub />} />
              <Route path="/use-cases/:slug" element={<UseCasePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          {authMode && (
            <AuthModal isOpen initialMode={authMode} onClose={() => setAuthMode(null)} />
          )}
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
