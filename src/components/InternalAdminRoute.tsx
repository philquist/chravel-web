import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { useDemoMode } from '@/hooks/useDemoMode';
import { LoadingSpinner } from '@/components/LoadingSpinner';

interface InternalAdminRouteProps {
  children: React.ReactNode;
  /**
   * When true, allow access while the app is in app-preview demo mode. The investor
   * demo uses a mock user (not a real authenticated super admin), so the auth/role
   * gates are bypassed for that mode only. Mock-data surfaces only.
   */
  allowDemoPreview?: boolean;
}

/**
 * Route guard for internal admin surfaces.
 * Requires an authenticated super admin — or, when `allowDemoPreview` is set, the
 * app-preview investor demo. Holds a loading spinner until auth (and demo, when
 * relevant) state resolves so protected UI never flashes before a redirect.
 */
export function InternalAdminRoute({
  children,
  allowDemoPreview = false,
}: InternalAdminRouteProps) {
  const { user, isLoading } = useAuth();
  const { isSuperAdmin } = useSuperAdmin();
  const { demoView, isLoading: demoLoading } = useDemoMode();
  const location = useLocation();

  const isAppPreview = demoView === 'app-preview';

  // Wait for both auth and (when relevant) demo state before deciding — no flash,
  // no false redirect during hydration.
  if (isLoading || (allowDemoPreview && demoLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  // Investor app-preview demo gets in without a real authenticated super admin.
  if (allowDemoPreview && isAppPreview) {
    return <>{children}</>;
  }

  if (!user) {
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
