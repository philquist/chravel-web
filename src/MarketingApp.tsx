import { Suspense, useMemo, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { FullPageLanding } from '@/components/landing/FullPageLanding';
import { AuthProvider } from '@/hooks/useAuth';
import { AuthModal } from '@/components/AuthModal';

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
