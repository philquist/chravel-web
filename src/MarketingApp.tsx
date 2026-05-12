import { Suspense, useMemo } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { FullPageLanding } from '@/components/landing/FullPageLanding';

export default function MarketingApp() {
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
      <Suspense fallback={fallback}>
        <FullPageLanding onSignUp={() => window.location.assign('/auth?mode=signup')} />
      </Suspense>
    </BrowserRouter>
  );
}
