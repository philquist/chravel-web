import { Suspense, useEffect, useMemo, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { FullPageLanding } from '@/components/landing/FullPageLanding';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { AuthModal } from '@/components/AuthModal';

/**
 * After a successful sign-in inside the lightweight marketing shell, force a
 * full page navigation so `main.tsx` re-runs `isAnonymousRootRoute()`, detects
 * the new Supabase auth marker in localStorage, and mounts the full <App />
 * shell with the dashboard router. Without this the user stays stuck on the
 * marketing landing because MarketingApp has no route for the dashboard.
 */
function PostAuthBoot() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      window.location.assign('/');
    }
  }, [user, isLoading]);

  return null;
}

export default function MarketingApp() {
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | null>(null);

  const fallback = useMemo(
    () => (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 animate-spin gold-gradient-spinner" />
      </div>
    ),
    [],
  );

  return (
    <BrowserRouter>
      <AuthProvider>
        <PostAuthBoot />
        <Suspense fallback={fallback}>
          <FullPageLanding onSignUp={() => setAuthMode('signup')} />
          {authMode && (
            <AuthModal isOpen initialMode={authMode} onClose={() => setAuthMode(null)} />
          )}
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
