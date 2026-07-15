import React from 'react';
import { deviceLikelyAuthenticated } from '../../lib/bootAuthMarker';

export const BrandedBootScreen: React.FC = () => (
  <div
    className="min-h-screen min-h-mobile-screen bg-background flex items-center justify-center px-6"
    aria-busy="true"
    aria-label="Opening Chravel"
  >
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/25 bg-primary/10 shadow-[0_0_48px_rgba(212,175,55,0.18)]">
        <span className="text-4xl font-black tracking-tight text-primary" aria-hidden="true">
          C
        </span>
      </div>
      <div>
        <p className="text-xl font-bold text-foreground">Chravel</p>
        <p className="mt-1 text-sm text-muted-foreground">Group trips, together.</p>
      </div>
    </div>
  </div>
);

/**
 * Branded placeholder for the home dashboard while auth hydrates on cold start.
 * Purely visual — renders no user data, so it is safe to paint before auth
 * resolves. Whether to show it (vs a neutral spinner) is decided from the
 * local auth storage marker only; all data fetches stay gated on hydrated auth.
 */
export const DashboardSkeleton: React.FC = () => (
  <div
    className="min-h-screen min-h-mobile-screen bg-background flex flex-col animate-pulse"
    aria-busy="true"
    aria-label="Loading your trips"
  >
    {/* Header: greeting + avatar */}
    <div className="px-4 pt-6 pb-4 flex items-center justify-between">
      <div className="space-y-2">
        <div className="h-6 w-40 bg-white/10 rounded" />
        <div className="h-4 w-24 bg-white/10 rounded" />
      </div>
      <div className="w-10 h-10 rounded-full bg-white/10" />
    </div>

    {/* Filter / stats pills */}
    <div className="px-4 pb-4 flex gap-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-8 w-24 bg-white/10 rounded-full" />
      ))}
    </div>

    {/* Trip cards */}
    <div className="px-4 space-y-4 flex-1 overflow-hidden">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="h-32 bg-white/10 rounded-xl" />
          <div className="h-5 w-2/3 bg-white/15 rounded" />
          <div className="h-4 w-1/3 bg-white/10 rounded" />
        </div>
      ))}
    </div>

    {/* Bottom tab bar silhouette */}
    <div className="h-16 border-t border-white/10 flex items-center justify-around px-6">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="w-6 h-6 bg-white/10 rounded" />
      ))}
    </div>
  </div>
);

/**
 * Single home of the skeleton-vs-spinner policy for boot/route loading states:
 * devices that look authenticated (canonical Supabase session key present) get
 * the app skeleton; anonymous devices get a branded, non-spinning boot screen because they're
 * headed to the auth gate or marketing page where an app skeleton would be
 * wrong. Evaluated at render time so mid-session sign-in/sign-out flips it.
 */
export const BootHydrationFallback: React.FC<{ variant?: 'dashboard' | 'trip' }> = ({
  variant = 'dashboard',
}) => {
  if (!deviceLikelyAuthenticated()) {
    return <BrandedBootScreen />;
  }
  return variant === 'trip' ? <TripShellSkeleton /> : <DashboardSkeleton />;
};

/**
 * Trip-detail shell placeholder shown while the trip page chunk loads.
 * Same safety contract as DashboardSkeleton: no data, visuals only.
 */
export const TripShellSkeleton: React.FC = () => (
  <div
    className="min-h-screen min-h-mobile-screen bg-background flex flex-col animate-pulse"
    aria-busy="true"
    aria-label="Loading trip"
  >
    {/* Header: back affordance + trip title */}
    <div className="px-4 pt-6 pb-4 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-white/10" />
      <div className="space-y-2">
        <div className="h-5 w-48 bg-white/15 rounded" />
        <div className="h-3 w-28 bg-white/10 rounded" />
      </div>
    </div>

    {/* Tab strip */}
    <div className="px-4 pb-4 flex gap-2">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-8 w-20 bg-white/10 rounded-full" />
      ))}
    </div>

    {/* Content blocks */}
    <div className="px-4 space-y-3 flex-1 overflow-hidden">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
          <div className="h-4 w-3/4 bg-white/10 rounded" />
          <div className="h-4 w-1/2 bg-white/10 rounded" />
        </div>
      ))}
    </div>
  </div>
);
