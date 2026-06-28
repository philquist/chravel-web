import React, { useMemo, useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { TripCard } from '../TripCard';
import { EventCard } from '../EventCard';
import { MobileEventCard } from '../MobileEventCard';
import { RecommendationCard } from '../RecommendationCard';
import { LocationSearchBar } from './LocationSearchBar';
import { ArchivedTripCard } from './ArchivedTripCard';
import { SwipeableRowProvider } from '../../contexts/SwipeableRowContext';
import { SwipeableTripCardWrapper, SwipeableProTripCardWrapper } from './SwipeableTripCardWrapper';
import { useIsMobile } from '../../hooks/use-mobile';
import { ProTripData } from '../../types/pro';
import { EventData } from '../../types/events';
import { TripCardSkeleton } from '../ui/loading-skeleton';
import { EnhancedEmptyState } from '../ui/enhanced-empty-state';
import { getArchivedTrips, restoreTrip, unhideTrip } from '../../services/archiveService';
import { useDeleteTrip } from '../../hooks/useDeleteTrip';
import { useLocationFilteredRecommendations } from '../../hooks/useLocationFilteredRecommendations';
import { MapPin, Calendar, Briefcase, Compass, Info, Archive, Clock } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';
import { useSavedRecommendations } from '@/hooks/useSavedRecommendations';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '../ui/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useConsumerSubscription } from '@/hooks/useConsumerSubscription';
import { SortableTripGrid } from '../dashboard/SortableTripGrid';
import { Button } from '../ui/button';
import type { PendingRequestTripCard } from '@/hooks/usePendingRequestTripCards';
import type { TabId } from '@/components/native';
import { useLocation } from 'react-router-dom';

const UpgradeModal = lazy(() =>
  import('../UpgradeModal').then(module => ({ default: module.UpgradeModal })),
);

interface Trip {
  id: number | string;
  title: string;
  location: string;
  dateRange: string;
  participants: Array<{
    id: number | string;
    name: string;
    avatar: string;
  }>;
  placesCount?: number;
  created_by?: string;
  coverPhoto?: string;
  trip_type?: 'consumer' | 'pro' | 'event';
  peopleCount?: number;
}

type TripGridBaseProps = {
  viewMode: string;
  trips: Trip[];
  proTrips: Record<string, ProTripData>;
  events: Record<string, EventData>;
  loading?: boolean;
  onCreateTrip?: () => void;
  onCancelDashboardRequest?: (
    requestId: string,
  ) => Promise<{ success: boolean; message?: string }> | undefined;
  // Callback when a trip is archived/hidden/deleted (for demo mode refresh)
  onTripStateChange?: () => void;
};

type TripGridProps = TripGridBaseProps & {
  activeFilter?: string;
  pendingRequestCards?: PendingRequestTripCard[];
  /** Active mobile tab; switching tabs must exit reorder mode. */
  activeTab?: TabId;
  /** Free-text city/place query from the recs filter bar (travelRecs only). */
  recsSearchQuery?: string;
  /** Lets recs empty-states switch the active recs category (e.g. Saved → All). */
  onRecsFilterChange?: (filter: string) => void;
};

export const TripGrid = React.memo(
  ({
    viewMode,
    trips,
    proTrips,
    events,
    loading = false,
    onCreateTrip,
    activeFilter = 'all',
    pendingRequestCards,
    onCancelDashboardRequest,
    onTripStateChange,
    activeTab,
    recsSearchQuery = '',
    onRecsFilterChange,
  }: TripGridProps) => {
    const isMobile = useIsMobile();
    const [manualLocation, setManualLocation] = useState<string>('');
    const { toggleSave, isSaved: isRecSaved } = useSavedRecommendations();
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [cancelingRequestIds, setCancelingRequestIds] = useState<Set<string>>(new Set());
    const [archivedTrips, setArchivedTrips] = useState<
      Array<{
        id: string;
        name: string;
        destination?: string;
        start_date?: string;
        end_date?: string;
        trip_type: 'consumer' | 'pro' | 'event';
        is_hidden?: boolean;
        cover_image_url?: string;
      }>
    >([]);
    const { isDemoMode } = useDemoMode();
    const location = useLocation();
    const { tier: _tier } = useConsumerSubscription();
    const { deleteTrip } = useDeleteTrip();
    const [reorderMode, setReorderMode] = useState<'my_trips' | 'pro' | 'events' | null>(null);
    const enterReorderMode = useCallback(
      (mode: 'my_trips' | 'pro' | 'events') => {
        setReorderMode(mode);
        toast({
          title: 'Move mode',
          description: 'Drag trips to reorder. Tap a card to finish.',
        });
      },
      [toast],
    );
    const exitReorderMode = useCallback(() => {
      setReorderMode(null);
    }, []);
    const handleReorderSaveError = useCallback(() => {
      toast({
        title: 'Could not save trip order',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }, [toast]);
    const gridWrapperRef = useRef<HTMLDivElement | null>(null);

    // Never keep reorder mode active across navigation/tab/view context changes.
    // `activeTab` matters because mobile tabs are state-based modals — `location.pathname`
    // does not change when the user taps Alerts / Profile, so without it the reset
    // would never fire and reorder mode would stick across tab switches.
    useEffect(() => {
      exitReorderMode();
    }, [location.pathname, location.search, viewMode, activeFilter, activeTab, exitReorderMode]);

    // iOS/webview backgrounding can interrupt touch events. Force reset on visibility loss.
    useEffect(() => {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          exitReorderMode();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [exitReorderMode]);

    // Tap-outside and Escape exit reorder mode. dnd-kit owns pointer capture during a
    // drag, so the document-level listener only fires for taps the sensor didn't claim.
    useEffect(() => {
      if (!reorderMode) return;
      const handlePointerDown = (e: PointerEvent) => {
        const wrapper = gridWrapperRef.current;
        if (wrapper && !wrapper.contains(e.target as Node)) {
          exitReorderMode();
        }
      };
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          exitReorderMode();
        }
      };
      document.addEventListener('pointerdown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('pointerdown', handlePointerDown);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [reorderMode, exitReorderMode]);

    // Stable identity fns for dnd-kit — inline lambdas change every render and retrigger order sync.
    const getMyTripId = useCallback((trip: Trip) => trip.id.toString(), []);
    const getProTripId = useCallback((trip: ProTripData) => trip.id, []);
    const getEventId = useCallback((event: EventData) => event.id, []);

    // State for optimistically deleted trips (pending undo timeout)
    const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
    const pendingDeleteTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // Filter out archived trips and pending deletes
    const activeTrips = useMemo(
      () => trips.filter(trip => !pendingDeleteIds.has(trip.id.toString())),
      [trips, pendingDeleteIds],
    );
    const activeProTrips = useMemo(() => proTrips, [proTrips]);
    const activeEvents = useMemo(() => events, [events]);

    // Fetch archived trips when filter is 'archived'
    useEffect(() => {
      if (activeFilter === 'archived' && user?.id) {
        getArchivedTrips(user.id).then(data => {
          // Combine all archived trips based on viewMode
          let combined: typeof archivedTrips = [];
          if (viewMode === 'myTrips') {
            combined = data.consumer as typeof archivedTrips;
          } else if (viewMode === 'tripsPro') {
            combined = data.pro as typeof archivedTrips;
          } else if (viewMode === 'events') {
            combined = data.events as typeof archivedTrips;
          } else {
            combined = [...data.consumer, ...data.pro, ...data.events] as typeof archivedTrips;
          }
          setArchivedTrips(combined);
        });
      }
    }, [activeFilter, user?.id, viewMode]);

    const handleRestoreTrip = async (tripId: string) => {
      try {
        const tripType =
          viewMode === 'tripsPro' ? 'pro' : viewMode === 'events' ? 'event' : 'consumer';
        await restoreTrip(tripId, tripType, user?.id);

        // Invalidate trips query cache so main list updates immediately
        queryClient.invalidateQueries({ queryKey: ['trips'] });

        toast({
          title: 'Trip restored',
          description: 'Your trip has been moved back to active trips.',
        });
        // Refresh archived trips
        if (user?.id) {
          const data = await getArchivedTrips(user.id);
          let combined: typeof archivedTrips = [];
          if (viewMode === 'myTrips') combined = data.consumer as typeof archivedTrips;
          else if (viewMode === 'tripsPro') combined = data.pro as typeof archivedTrips;
          else if (viewMode === 'events') combined = data.events as typeof archivedTrips;
          setArchivedTrips(combined);
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'TRIP_LIMIT_REACHED') {
          setShowUpgradeModal(true);
        } else {
          toast({
            title: 'Failed to restore trip',
            description: 'There was an error restoring your trip. Please try again.',
            variant: 'destructive',
          });
        }
      }
    };

    const handleUnhideTrip = async (tripId: string) => {
      try {
        await unhideTrip(tripId);

        // Invalidate trips query cache so main list updates immediately
        queryClient.invalidateQueries({ queryKey: ['trips'] });

        toast({
          title: 'Trip unhidden',
          description: 'Your trip is now visible in the main list.',
        });
      } catch {
        toast({
          title: 'Failed to unhide trip',
          description: 'There was an error. Please try again.',
          variant: 'destructive',
        });
      }
    };

    // Clean up pending delete timeouts on unmount
    useEffect(() => {
      const timeouts = pendingDeleteTimeouts.current;
      return () => {
        timeouts.forEach(timeout => clearTimeout(timeout));
        timeouts.clear();
      };
    }, []);

    // Swipe-to-delete handler with undo functionality
    const handleSwipeDelete = useCallback(
      async (trip: Trip) => {
        const tripId = trip.id.toString();

        // Demo mode: block delete with toast
        if (isDemoMode) {
          toast({
            title: 'Demo trip',
            description: 'This is a demo trip and cannot be deleted.',
          });
          return;
        }

        if (!user?.id) {
          toast({
            title: 'Not logged in',
            description: 'You must be logged in to manage trips.',
            variant: 'destructive',
          });
          return;
        }

        // Optimistically hide the trip
        setPendingDeleteIds(prev => new Set(prev).add(tripId));

        // Create undo handler
        const undoDelete = () => {
          const timeout = pendingDeleteTimeouts.current.get(tripId);
          if (timeout) {
            clearTimeout(timeout);
            pendingDeleteTimeouts.current.delete(tripId);
          }
          setPendingDeleteIds(prev => {
            const next = new Set(prev);
            next.delete(tripId);
            return next;
          });
        };

        // Execute the actual delete after 5 seconds (undo window)
        const executeDelete = async () => {
          pendingDeleteTimeouts.current.delete(tripId);
          try {
            // Unified deletion: useDeleteTrip handles creator vs member logic
            const result = await deleteTrip(tripId, trip.created_by);
            if (import.meta.env.DEV) {
              console.log('[TripGrid] Delete result:', result);
            }
            onTripStateChange?.();
          } catch {
            // Revert on error
            setPendingDeleteIds(prev => {
              const next = new Set(prev);
              next.delete(tripId);
              return next;
            });
            toast({
              title: 'Failed to remove trip',
              description: 'There was an error. Please try again.',
              variant: 'destructive',
            });
          }
        };

        // Set up the delayed delete
        const timeout = setTimeout(executeDelete, 5000);
        pendingDeleteTimeouts.current.set(tripId, timeout);

        // Show toast with undo action
        const isCreator = user.id === trip.created_by;
        toast({
          title: 'Trip deleted',
          description: isCreator
            ? `"${trip.title}" will be archived.`
            : `"${trip.title}" will be removed from your account.`,
          duration: 5000,
          action: (
            <ToastAction altText="Undo" onClick={undoDelete}>
              Undo
            </ToastAction>
          ),
        });
      },
      [user?.id, isDemoMode, toast, onTripStateChange, deleteTrip],
    );

    // Handler for deleting pro trips (converts to Trip type for the generic handler)
    const handleProTripSwipeDelete = useCallback(
      async (trip: ProTripData) => {
        if (!user?.id || isDemoMode) return;
        // Preserve created_by so the deletion engine makes the right decision
        const fakeTrip = {
          id: trip.id,
          title: trip.title,
          created_by:
            (trip as ProTripData & { createdBy?: string; created_by?: string }).createdBy ||
            (trip as ProTripData & { created_by?: string }).created_by,
        } as Trip;
        await handleSwipeDelete(fakeTrip);
      },
      [user?.id, isDemoMode, handleSwipeDelete],
    );

    const handleCancelJoinRequest = useCallback(
      async (requestId: string) => {
        if (isDemoMode) {
          toast({
            title: 'Demo mode',
            description: 'Cancel request is disabled in demo mode.',
          });
          return;
        }

        if (!user?.id) {
          toast({
            title: 'Not logged in',
            description: 'You must be logged in to cancel a request.',
            variant: 'destructive',
          });
          return;
        }

        setCancelingRequestIds(prev => new Set(prev).add(requestId));

        try {
          if (!onCancelDashboardRequest) {
            throw new Error('Cancel request handler is unavailable');
          }

          const result = await onCancelDashboardRequest(requestId);
          if (!result?.success) {
            throw new Error(result?.message || 'Unable to cancel request');
          }

          toast({
            title: 'Request canceled',
            description: 'Your join request was canceled.',
          });
        } catch {
          toast({
            title: 'Unable to cancel request',
            description: 'Please try again in a moment.',
            variant: 'destructive',
          });
        } finally {
          setCancelingRequestIds(prev => {
            const next = new Set(prev);
            next.delete(requestId);
            return next;
          });
        }
      },
      [isDemoMode, onCancelDashboardRequest, toast, user?.id],
    );

    // Get location-filtered recommendations for travel recs view.
    // The "saved" pseudo-category isn't a real type — request all types, then
    // narrow to saved below.
    const isSavedView = viewMode === 'travelRecs' && activeFilter === 'saved';
    const {
      recommendations: locationFilteredRecommendations,
      activeLocation,
      isBasecampLocation,
    } = useLocationFilteredRecommendations(
      viewMode === 'travelRecs' ? (isSavedView ? 'all' : activeFilter) : 'all',
      // Only the explicit map-based location narrows the feed here. The free-text
      // query is applied below so it can match title/tags too — the location hook
      // matches city/location only and would otherwise drop name/tag searches.
      viewMode === 'travelRecs' ? manualLocation : undefined,
    );

    // Apply the saved filter + free-text query on top of the location-filtered feed.
    const filteredRecommendations = useMemo(() => {
      let list = locationFilteredRecommendations;
      if (isSavedView) {
        list = list.filter(rec => isRecSaved(rec.id));
      }
      const q = recsSearchQuery.trim().toLowerCase();
      if (q) {
        list = list.filter(
          rec =>
            rec.title.toLowerCase().includes(q) ||
            rec.city?.toLowerCase().includes(q) ||
            rec.location?.toLowerCase().includes(q) ||
            rec.tags?.some(tag => tag.toLowerCase().includes(q)),
        );
      }
      return list;
    }, [locationFilteredRecommendations, isSavedView, isRecSaved, recsSearchQuery]);

    // Show loading skeleton
    if (loading) {
      return (
        <div className="w-full max-w-[1440px] mx-auto rounded-2xl border border-border/40 bg-card/20 p-4 sm:p-5 lg:p-6 trips-mobile-scroll-safe">
          <div
            className={`trips-responsive-grid grid gap-4 sm:gap-5 xl:gap-6 ${isMobile ? 'grid-cols-1' : 'md:grid-cols-2 xl:grid-cols-3'}`}
          >
            <TripCardSkeleton count={isMobile ? 3 : 6} />
          </div>
        </div>
      );
    }

    const requestCards = activeFilter === 'requests' ? pendingRequestCards : undefined;

    const hasContent =
      activeFilter === 'requests'
        ? requestCards.length > 0
        : activeFilter === 'archived'
          ? archivedTrips.length > 0
          : viewMode === 'myTrips'
            ? activeTrips.length > 0
            : viewMode === 'tripsPro'
              ? Object.keys(activeProTrips).length > 0
              : viewMode === 'events'
                ? Object.keys(activeEvents).length > 0
                : viewMode === 'travelRecs'
                  ? filteredRecommendations.length > 0
                  : false;

    // Show enhanced empty state if no content
    if (!hasContent) {
      const getEmptyStateProps = () => {
        if (activeFilter === 'requests') {
          return {
            icon: Clock,
            title: 'No pending requests',
            description:
              "No outgoing requests right now. When you request to join a trip, it'll appear here while approval is pending.",
            actionLabel: undefined,
            onAction: undefined,
          };
        }
        if (activeFilter === 'archived') {
          return {
            icon: Archive,
            title: 'No archived trips',
            description:
              'Trips you archive will appear here. Archive trips to declutter your main view.',
            actionLabel: undefined,
            onAction: undefined,
          };
        }
        switch (viewMode) {
          case 'myTrips':
            return {
              icon: MapPin,
              title: 'No trips yet',
              description:
                'Start planning your next adventure! Create your first trip and invite friends to join.',
              actionLabel: 'Create Your First Trip',
              onAction: onCreateTrip,
            };
          case 'tripsPro':
            return {
              icon: Briefcase,
              title: 'No professional trips yet',
              description:
                'Manage professional trips, tours, and events with advanced collaboration tools.',
              actionLabel: 'Create Professional Trip',
              onAction: onCreateTrip,
            };
          case 'events':
            return {
              icon: Calendar,
              title: 'No events yet',
              description:
                'Organize conferences, meetings, and professional events with comprehensive management tools.',
              actionLabel: 'Create Event',
              onAction: onCreateTrip,
            };
          case 'travelRecs':
            if (isSavedView) {
              return {
                icon: Compass,
                title: 'No saved places yet',
                description:
                  'Tap the bookmark on a recommendation to save it. Your saved places will appear here.',
                actionLabel: onRecsFilterChange ? 'Browse recommendations' : undefined,
                onAction: onRecsFilterChange ? () => onRecsFilterChange('all') : undefined,
              };
            }
            return {
              icon: Compass,
              title: activeLocation
                ? `No recommendations found in ${activeLocation}`
                : 'No recommendations found',
              description: activeLocation
                ? 'Try searching for a different city or explore all recommendations.'
                : 'Try searching for a specific city to see local recommendations.',
              actionLabel: 'Clear Location Filter',
              onAction: () => setManualLocation(''),
            };
          default:
            return {
              icon: MapPin,
              title: 'No content available',
              description: 'Get started by creating your first item.',
              actionLabel: 'Get Started',
              onAction: onCreateTrip,
            };
        }
      };

      return (
        <div className="space-y-6">
          {/* Show location search for travel recs even when empty */}
          {viewMode === 'travelRecs' && (
            <div className="space-y-4">
              <LocationSearchBar
                onLocationSelect={setManualLocation}
                currentLocation={manualLocation}
                autoFromBasecamp={false}
              />
              {activeLocation && (
                <Alert className="border-info/50 bg-info/10">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    {isBasecampLocation
                      ? `Showing recommendations for ${activeLocation} (from your Basecamp)`
                      : `Showing recommendations for ${activeLocation} (manually selected)`}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
          <EnhancedEmptyState {...getEmptyStateProps()} />
        </div>
      );
    }

    // Render content grid (using filtered data)
    return (
      <SwipeableRowProvider>
        <div ref={gridWrapperRef} className="trips-mobile-scroll-safe space-y-6 w-full">
          {/* Location alert for travel recs */}
          {viewMode === 'travelRecs' && activeLocation && (
            <Alert className="border-info/50 bg-info/10 mb-6">
              <Info className="h-4 w-4" />
              <AlertDescription>
                {isBasecampLocation
                  ? `Showing recommendations for ${activeLocation} (from your Basecamp)`
                  : `Showing recommendations for ${activeLocation} (manually selected)`}
              </AlertDescription>
            </Alert>
          )}

          {/* Sticky reorder banner — single Done control, stays in view while the user
              drags / scrolls so they always have a way out. */}
          {reorderMode !== null && (
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border border-border/60 bg-card/95 px-4 py-2.5 backdrop-blur">
              <span className="text-sm font-medium text-muted-foreground">
                Move mode: drag trips to reorder. Tap a card to finish.
              </span>
              <Button size="sm" onClick={exitReorderMode}>
                Done
              </Button>
            </div>
          )}

          <div
            className={`trips-responsive-grid grid w-full max-w-[1440px] mx-auto gap-4 sm:gap-5 xl:gap-6 ${
              isMobile ? 'grid-cols-1' : 'md:grid-cols-2 xl:grid-cols-3'
            }`}
          >
            {activeFilter === 'requests' ? (
              requestCards.length > 0 ? (
                requestCards.map(card => (
                  <TripCard
                    key={`request-${card.requestId}`}
                    trip={{
                      id: card.tripId,
                      title: card.title,
                      location: card.destination ?? 'Destination TBD',
                      dateRange: card.dateLabel,
                      participants: [],
                      coverPhoto: card.coverImageUrl ?? undefined,
                      peopleCount: card.peopleCount,
                      placesCount: card.placesCount,
                    }}
                    pendingApproval
                    pendingBadgeLabel="Pending Approval"
                    pendingSecondaryActionLabel="Cancel request"
                    onPendingSecondaryAction={() => handleCancelJoinRequest(card.requestId)}
                    isPendingSecondaryActionLoading={cancelingRequestIds.has(card.requestId)}
                  />
                ))
              ) : (
                <div className="col-span-full rounded-xl border border-border/50 bg-card/30 p-6 text-center">
                  <p className="text-lg font-semibold">No outgoing requests</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Trip requests you send will appear here while awaiting approval.
                  </p>
                </div>
              )
            ) : activeFilter === 'archived' ? (
              archivedTrips.map(trip => (
                <ArchivedTripCard
                  key={trip.id}
                  trip={trip}
                  onRestore={handleRestoreTrip}
                  onUnhide={handleUnhideTrip}
                  onUpgrade={() => setShowUpgradeModal(true)}
                />
              ))
            ) : viewMode === 'myTrips' ? (
              <>
                {/* Sortable active trips */}
                <SortableTripGrid
                  items={activeTrips}
                  getId={getMyTripId}
                  renderCard={trip => (
                    <SwipeableTripCardWrapper
                      trip={trip}
                      isMobile={isMobile}
                      isDemoMode={isDemoMode}
                      onDelete={handleSwipeDelete}
                      onTripStateChange={onTripStateChange}
                      reorderMode={reorderMode === 'my_trips'}
                      priority={!isMobile}
                      onMoveTrip={() => enterReorderMode('my_trips')}
                      onExitMoveMode={exitReorderMode}
                    />
                  )}
                  dashboardType="my_trips"
                  userId={user?.id}
                  reorderMode={reorderMode === 'my_trips'}
                  isMobile={isMobile}
                  onSaveError={handleReorderSaveError}
                />
              </>
            ) : viewMode === 'tripsPro' ? (
              <>
                <SortableTripGrid
                  items={Object.values(activeProTrips)}
                  getId={getProTripId}
                  renderCard={trip => (
                    <SwipeableProTripCardWrapper
                      trip={trip}
                      isMobile={isMobile}
                      isDemoMode={isDemoMode}
                      onDelete={handleProTripSwipeDelete}
                      onTripStateChange={onTripStateChange}
                      reorderMode={reorderMode === 'pro'}
                      onMoveTrip={() => enterReorderMode('pro')}
                      onExitMoveMode={exitReorderMode}
                    />
                  )}
                  dashboardType="pro"
                  userId={user?.id}
                  reorderMode={reorderMode === 'pro'}
                  isMobile={isMobile}
                  onSaveError={handleReorderSaveError}
                />
              </>
            ) : viewMode === 'events' ? (
              <>
                <SortableTripGrid
                  items={Object.values(activeEvents)}
                  getId={getEventId}
                  renderCard={event =>
                    isMobile ? (
                      <MobileEventCard
                        event={event}
                        onArchiveSuccess={onTripStateChange}
                        onHideSuccess={onTripStateChange}
                        onDeleteSuccess={onTripStateChange}
                        reorderMode={reorderMode === 'events'}
                        onMoveTrip={() => enterReorderMode('events')}
                        onExitMoveMode={exitReorderMode}
                      />
                    ) : (
                      <EventCard
                        event={event}
                        onArchiveSuccess={onTripStateChange}
                        onHideSuccess={onTripStateChange}
                        onDeleteSuccess={onTripStateChange}
                        reorderMode={reorderMode === 'events'}
                        onMoveTrip={() => enterReorderMode('events')}
                        onExitMoveMode={exitReorderMode}
                      />
                    )
                  }
                  dashboardType="events"
                  userId={user?.id}
                  reorderMode={reorderMode === 'events'}
                  isMobile={isMobile}
                  onSaveError={handleReorderSaveError}
                />
              </>
            ) : viewMode === 'travelRecs' ? (
              filteredRecommendations.map(recommendation => (
                <RecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                  isSaved={isRecSaved(recommendation.id)}
                  onSaveToTrip={async id => {
                    const rec = filteredRecommendations.find(r => r.id === id);
                    if (rec) {
                      await toggleSave(rec);
                    }
                  }}
                />
              ))
            ) : null}
          </div>

          <Suspense fallback={null}>
            <UpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
          </Suspense>
        </div>
      </SwipeableRowProvider>
    );
  },
);
