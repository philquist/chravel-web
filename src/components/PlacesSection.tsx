import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from './mobile/PullToRefreshIndicator';
import { BasecampsPanel } from './places/BasecampsPanel';
import { LinksPanel } from './places/LinksPanel';
import { BasecampLocation } from '../types/basecamp';
import { useTripVariant } from '../contexts/TripVariantContext';
import { useAuth } from '@/hooks/useAuth';
import { getEffectiveUserId } from '@/utils/demoUser';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useTripBasecamp, tripBasecampKeys } from '@/hooks/useTripBasecamp';
import { personalBasecampKeys, usePersonalBasecamp } from '@/hooks/usePersonalBasecamp';
import { supabase } from '@/integrations/supabase/client';
import { basecampService } from '@/services/basecampService';
import { toast } from 'sonner';
import { tripKeys, QUERY_CACHE_CONFIG } from '@/lib/queryKeys';
import { fetchTripPlaces } from '@/services/tripPlacesService';

interface PlacesSectionProps {
  tripId?: string;
  tripName?: string;
}

type TabView = 'basecamps' | 'links';

export const PlacesSection = ({
  tripId = '1',
  tripName: _tripName = 'Your Trip',
}: PlacesSectionProps) => {
  // Reserved for context-aware title
  const { variant: _variant } = useTripVariant();
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const queryClient = useQueryClient();

  // Use TanStack Query for trip basecamp (canonical source of truth)
  const { data: tripBasecamp, isLoading: _isBasecampLoading } = useTripBasecamp(tripId);

  // ⚡ PERFORMANCE: Use TanStack Query for personal basecamp (loads in parallel with trip basecamp)
  const { data: personalBasecampData } = usePersonalBasecamp(tripId);

  // State (only the small UI bits — data state lives in TanStack Query)
  const [activeTab, setActiveTab] = useState<TabView>('basecamps');

  const effectiveUserId = getEffectiveUserId(user?.id);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: tripBasecampKeys.trip(tripId) });
    await queryClient.invalidateQueries({
      queryKey: personalBasecampKeys.tripUser(tripId, effectiveUserId),
    });
    await queryClient.invalidateQueries({ queryKey: ['tripBaseCamps', tripId] });
    await queryClient.invalidateQueries({ queryKey: ['personalBaseCamps', tripId] });
    await queryClient.invalidateQueries({ queryKey: tripKeys.places(tripId) });
  }, [queryClient, tripId, effectiveUserId]);

  const { isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
    maxPullDistance: 120,
  });

  // ⚡ PERFORMANCE: keepPreviousData surfaces the last-known places list
  // instantly while the background refetch runs — eliminates the empty
  // "Add a place" flash when re-entering the tab on stale cache.
  useQuery({
    queryKey: tripKeys.places(tripId, isDemoMode),
    queryFn: () => fetchTripPlaces(tripId, isDemoMode),
    staleTime: QUERY_CACHE_CONFIG.places.staleTime,
    gcTime: QUERY_CACHE_CONFIG.places.gcTime,
    refetchOnWindowFocus: QUERY_CACHE_CONFIG.places.refetchOnWindowFocus,
    enabled: !!tripId,
    placeholderData: keepPreviousData,
  });

  // Personal basecamp comes straight from TanStack Query — no local state mirror
  // (eliminates the duplicate useState + useEffect sync that re-rendered the
  // whole Places section every time the personal basecamp resolved).
  const personalBasecamp = personalBasecampData ?? null;
  const handlePersonalBasecampUpdate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: personalBasecampKeys.tripUser(tripId, effectiveUserId),
    });
  }, [queryClient, tripId, effectiveUserId]);

  // Track local updates to prevent toast spam
  const lastLocalUpdateRef = useRef<{ timestamp: number; address: string } | null>(null);
  const UPDATE_DEBOUNCE_MS = 2000;

  // Realtime sync for trip basecamp updates - invalidate TanStack Query cache.
  // tripId nullity is guarded above; closure captures the validated string.
  // RLS on trip_base_camps and trip_personal_base_camps already gates which
  // rows the channel can ever broadcast to this client (see
  // supabase/migrations/20260518120000_add_multi_base_camps.sql).
  useEffect(() => {
    if (isDemoMode || !tripId) return;

    const channel = supabase
      .channel(`trip_basecamp_${tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trips',
          filter: `id=eq.${tripId}`,
        },
        async _payload => {
          const now = Date.now();
          const isLocalUpdate =
            lastLocalUpdateRef.current &&
            now - lastLocalUpdateRef.current.timestamp < UPDATE_DEBOUNCE_MS;

          // Local updates within the debounce window skip the remote-change notification.
          if (!isLocalUpdate) {
            queryClient.invalidateQueries({ queryKey: tripBasecampKeys.trip(tripId) });

            const updatedBasecamp = await basecampService.getTripBasecamp(tripId);
            if (updatedBasecamp) {
              toast.success('Trip Base Camp updated by another member!', {
                description: updatedBasecamp.name || updatedBasecamp.address,
              });
            }
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trip_base_camps',
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tripBaseCamps', tripId] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trip_personal_base_camps',
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['personalBaseCamps', tripId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, isDemoMode, queryClient]);

  /**
   * Notification-only callback for trip basecamp set.
   * The actual save is now handled self-contained inside BasecampsPanel.
   * This callback is used to debounce realtime notifications so the user
   * doesn't see "updated by another member" toasts for their own saves.
   */
  const handleBasecampSetNotification = (newBasecamp: BasecampLocation) => {
    lastLocalUpdateRef.current = {
      timestamp: Date.now(),
      address: newBasecamp.address,
    };

    if (import.meta.env.DEV) {
      console.log('[PlacesSection] Trip basecamp set notification received:', newBasecamp.address);
    }
  };

  /**
   * Notification-only callback for trip basecamp clear.
   * The actual clear is now handled self-contained inside BasecampsPanel.
   */
  const handleBasecampClearNotification = () => {
    lastLocalUpdateRef.current = {
      timestamp: Date.now(),
      address: '',
    };
  };

  return (
    // Own the vertical scroll (like the Tasks/Polls tabs) so long content is reachable
    // inside MobileTripTabs' flex-column wrapper. flex-1/min-h-0 are inert on the
    // desktop block render paths, leaving a single outer scrollbar there.
    <div className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain mb-12 mobile-safe-scroll">
      {(isRefreshing || pullDistance > 0) && (
        <PullToRefreshIndicator
          isRefreshing={isRefreshing}
          pullDistance={pullDistance}
          threshold={80}
        />
      )}
      {/* Header: stack on narrow viewports so centered tabs never overlap the title (Android WebView). */}
      <div
        data-testid="places-section-header"
        className="mb-6 flex w-full flex-col items-stretch gap-3 px-0 md:relative md:flex-row md:items-center md:justify-between md:gap-0"
      >
        <h2 className="shrink-0 text-xl font-bold text-white sm:text-2xl md:text-3xl">Places</h2>

        {/* Tab navigation: full-width row on mobile; visually centered on md+ without absolute positioning */}
        <div className="flex w-full justify-center md:absolute md:left-1/2 md:w-auto md:-translate-x-1/2">
          <div className="bg-white/5 backdrop-blur-sm rounded-lg p-0.5 flex gap-0.5 sm:rounded-xl sm:p-1 sm:gap-1">
            {(['basecamps', 'links'] as TabView[]).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium capitalize transition-all sm:rounded-lg sm:px-3 sm:py-2 sm:text-xs md:px-4 md:text-sm ${
                  activeTab === tab
                    ? 'bg-white/10 text-white shadow-lg'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {tab === 'basecamps' ? 'Base Camps' : 'Explore'}
              </button>
            ))}
          </div>
        </div>

        {/* Spacer balances the title on md+ so the tab group stays visually centered */}
        <div className="hidden shrink-0 md:block md:w-[100px]" aria-hidden />
      </div>

      {/* Tab Content — ⚡ display:none keeps both sub-tabs mounted for instant switching */}
      <div className="w-full px-0 mb-2 md:mb-6">
        <div style={{ display: activeTab === 'basecamps' ? 'block' : 'none' }}>
          <BasecampsPanel
            tripId={tripId}
            tripBasecamp={tripBasecamp || null}
            onTripBasecampSet={handleBasecampSetNotification}
            onTripBasecampClear={handleBasecampClearNotification}
            personalBasecamp={personalBasecamp}
            onPersonalBasecampUpdate={handlePersonalBasecampUpdate}
          />
        </div>

        {/* Explore — display:none keeps mounted for instant tab switching (matches BasecampsPanel) */}
        <div style={{ display: activeTab === 'links' ? 'block' : 'none' }}>
          <LinksPanel tripId={tripId} />
        </div>
      </div>
    </div>
  );
};
