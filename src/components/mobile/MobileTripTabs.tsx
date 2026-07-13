import React, { useRef, useEffect, useState, useCallback, lazy, Suspense } from 'react';
import {
  MessageCircle,
  Calendar,
  ClipboardList,
  BarChart3,
  Camera,
  MapPin,
  Headset,
  CreditCard,
  Lock,
  Users,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { useFeatureToggle } from '../../hooks/useFeatureToggle';
import { hapticService } from '../../services/hapticService';
import { useTripVariant } from '../../contexts/TripVariantContext';
import { useDemoMode } from '../../hooks/useDemoMode';
import { usePrefetchTrip } from '../../hooks/usePrefetchTrip';
import { FeatureErrorBoundary } from '../FeatureErrorBoundary';
import { useEventPermissions } from '@/hooks/useEventPermissions';
import { useEventAgenda } from '@/hooks/useEventAgenda';
import { useEventLineup } from '@/hooks/useEventLineup';
import { CalendarSkeleton, PlacesSkeleton, ChatSkeleton } from '../loading';
import { LoadingSpinner } from '../LoadingSpinner';
import { useRoleAssignments } from '../../hooks/useRoleAssignments';
import { useTripRoles } from '../../hooks/useTripRoles';
import type { EventData } from '../../types/events';
import { DisabledTabDialog } from '../events/DisabledTabDialog';
import { EventTabKey, resolveEventTabsForRole } from '@/lib/eventTabs';
import { useEventTabSettings } from '@/hooks/useEventTabSettings';
import { retryImport } from '@/lib/retryImport';

/** Tabs that pin a bottom composer — parent panel must not scroll (only inner message list). */
const FIXED_BOTTOM_COMPOSER_TABS = new Set(['chat', 'concierge']);

// ⚡ PERFORMANCE: Lazy load all tab components for code splitting
// retryImport handles stale-chunk failures with exponential backoff
const TripChat = lazy(() =>
  retryImport(() =>
    import('@/features/chat/components/TripChat').then(m => ({ default: m.TripChat })),
  ),
);
const MobileGroupCalendar = lazy(() =>
  retryImport(() =>
    import('./MobileGroupCalendar').then(m => ({ default: m.MobileGroupCalendar })),
  ),
);
const MobileTripTasks = lazy(() =>
  retryImport(() => import('./MobileTripTasks').then(m => ({ default: m.MobileTripTasks }))),
);
const CommentsWall = lazy(() =>
  retryImport(() => import('../CommentsWall').then(m => ({ default: m.CommentsWall }))),
);
const MobileUnifiedMediaHub = lazy(() =>
  retryImport(() =>
    import('./MobileUnifiedMediaHub').then(m => ({ default: m.MobileUnifiedMediaHub })),
  ),
);
const PlacesSection = lazy(() =>
  retryImport(() => import('../PlacesSection').then(m => ({ default: m.PlacesSection }))),
);
const AIConciergeChat = lazy(() =>
  retryImport(() => import('../AIConciergeChat').then(m => ({ default: m.AIConciergeChat }))),
);
const MobileTripPayments = lazy(() =>
  retryImport(() => import('./MobileTripPayments').then(m => ({ default: m.MobileTripPayments }))),
);
const EnhancedAgendaTab = lazy(() =>
  retryImport(() =>
    import('../events/EnhancedAgendaTab').then(m => ({ default: m.EnhancedAgendaTab })),
  ),
);
const LineupTab = lazy(() =>
  retryImport(() => import('../events/LineupTab').then(m => ({ default: m.LineupTab }))),
);
const EventTasksTab = lazy(() =>
  retryImport(() => import('../events/EventTasksTab').then(m => ({ default: m.EventTasksTab }))),
);
const TeamTab = lazy(() =>
  retryImport(() => import('../pro/TeamTab').then(m => ({ default: m.TeamTab }))),
);
const EventAdminTab = lazy(() =>
  retryImport(() => import('../events/EventAdminTab').then(m => ({ default: m.EventAdminTab }))),
);

interface MobileTripTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tripId: string;
  basecamp: { name: string; address: string };
  variant?: 'consumer' | 'pro' | 'event';
  participants?: Array<{ id: string; name: string; role?: string }>;
  tripData?: {
    enabled_features?: string[];
    trip_type?: 'consumer' | 'pro' | 'event';
    proTripCategory?: string;
    createdBy?: string;
  };
  eventData?: EventData | null;
  category?: string;
  tripCreatorId?: string;
  isLoadingRoster?: boolean;
}

// Stable default identities. An inline `participants = []` default mints a NEW
// array on every render; it feeds the localParticipants sync effect (deps:
// [participants]) whose setState re-renders this component, which re-mints the
// default — a self-sustaining synchronous render loop that froze every tab
// switch on surfaces that omit the prop (consumer MobileTripDetail and
// MobileEventDetail). Mount survives only because the first effect run passes
// the same reference captured by useState (Object.is bail-out).
const NO_PARTICIPANTS: Array<{ id: string; name: string; role?: string }> = [];
const NO_TRIP_DATA = {};

export const MobileTripTabs = ({
  activeTab,
  onTabChange,
  tripId,
  basecamp,
  variant = 'consumer',
  participants = NO_PARTICIPANTS,
  tripData,
  eventData,
  category,
  tripCreatorId,
  isLoadingRoster = false,
}: MobileTripTabsProps) => {
  const { accentColors: _accentColors } = useTripVariant();
  const { isDemoMode } = useDemoMode();
  const { prefetchTab, prefetchAdjacentTabs, prefetchPriorityTabs } = usePrefetchTrip();
  const contentRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const features = useFeatureToggle(tripData || NO_TRIP_DATA);

  // Role assignment hooks for Pro trips Team tab
  const { assignRole } = useRoleAssignments({
    tripId,
    enabled: variant === 'pro' && !!tripId,
  });
  const { refetch: refetchRoles } = useTripRoles({
    tripId,
    enabled: variant === 'pro' && !!tripId,
  });

  // Track local roster state for optimistic updates
  const [localParticipants, setLocalParticipants] = useState(participants);

  // DB-backed lineup hook for auto-populating from agenda
  const { members: _lineupSpeakers, addMembersFromAgenda: addLineupFromAgenda } = useEventLineup({
    eventId: tripId,
    initialMembers: eventData?.speakers || [],
    enabled: variant === 'event',
  });
  const { sessions: agendaSessions } = useEventAgenda({
    eventId: tripId,
    initialSessions: eventData?.agenda || [],
    enabled: variant === 'event',
  });

  const handleLineupUpdate = useCallback(
    async (speakerNames: string[]) => {
      try {
        await addLineupFromAgenda(speakerNames);
      } catch {
        // Error handled by hook toast
      }
    },
    [addLineupFromAgenda],
  );

  // Sync local participants with prop changes
  React.useEffect(() => {
    setLocalParticipants(participants);
  }, [participants]);

  // ⚡ PERFORMANCE: Tiered tab pre-mounting (mirrors TripTabs).
  // Tier 1 mounts immediately so chat / calendar / concierge are always warm.
  // Tier 2 mounts after idle (~800ms) so tasks/polls/places/payments are
  // ready when the user reaches them — fixes the "click away and back" bug.
  // Tier 3 (media) stays lazy until visited.
  const TIER_1_TABS: readonly string[] = ['chat', 'calendar', 'concierge'];
  const TIER_2_TABS: readonly string[] = ['tasks', 'polls', 'places', 'payments'];

  // Tabs that own an internal scroll area + a pinned composer (message list scrolls
  // inside the tab; the composer is a fixed bottom sibling). These must NOT be wrapped
  // in a scroll container — on iOS WKWebView a momentum-scroll wrapper rubber-bands the
  // whole tab (composer included) before the input is even focused, and the page's
  // bg-black shows through underneath. Content tabs keep page scroll on the wrapper.
  const INTERNAL_SCROLL_TABS: readonly string[] = ['chat', 'concierge'];
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(
    () => new Set([activeTab, ...TIER_1_TABS]),
  );

  // Get event admin status for event variant
  const { isAdmin: isEventAdmin } = useEventPermissions(variant === 'event' ? tripId : '');
  const [showDisabledTabDialog, setShowDisabledTabDialog] = useState(false);
  const eventEnabledFeatures = (eventData as (EventData & { enabled_features?: string[] }) | null)
    ?.enabled_features;
  const { enabledTabs: eventEnabledTabs } = useEventTabSettings({
    eventId: tripId,
    initialEnabledFeatures: eventEnabledFeatures,
    enabled: variant === 'event',
  });

  // ⚡ MOBILE/PWA OPTIMIZATION: Prefetch priority tabs on mount
  // Since mobile users can't hover, we prefetch commonly used tabs immediately
  useEffect(() => {
    if (tripId) {
      prefetchPriorityTabs(tripId);
    }
  }, [tripId, prefetchPriorityTabs]);

  // ⚡ Pre-mount Tier 2 tabs after idle so secondary tabs are warm by the time
  // the user taps them. Skipped for event variant (different tab set).
  useEffect(() => {
    if (variant === 'event') return;
    let cancelled = false;
    const mountTier2 = () => {
      if (cancelled) return;
      setVisitedTabs(prev => {
        let changed = false;
        const next = new Set(prev);
        TIER_2_TABS.forEach(t => {
          if (!next.has(t)) {
            next.add(t);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    };
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof w.requestIdleCallback === 'function') {
      idleId = w.requestIdleCallback(mountTier2, { timeout: 1200 });
    } else {
      timeoutId = setTimeout(mountTier2, 800);
    }
    return () => {
      cancelled = true;
      if (idleId !== undefined && w.cancelIdleCallback) w.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [variant]);

  // Mark current tab as visited when it changes
  useEffect(() => {
    setVisitedTabs(prev => {
      if (prev.has(activeTab)) return prev;
      return new Set([...prev, activeTab]);
    });
  }, [activeTab]);

  // Tab configuration based on variant
  const getTabsForVariant = () => {
    // Event-specific tabs in canonical order
    if (variant === 'event') {
      const iconMap: Record<EventTabKey, React.ElementType> = {
        admin: Shield,
        agenda: Calendar,
        calendar: Calendar,
        chat: MessageCircle,
        lineup: Users,
        media: Camera,
        polls: BarChart3,
        tasks: ClipboardList,
      };

      return resolveEventTabsForRole(eventEnabledTabs, isEventAdmin).map(tab => ({
        id: tab.key,
        label: tab.label,
        icon: iconMap[tab.key],
        enabled: tab.isEnabled,
      }));
    }

    // Consumer/Pro tabs
    const baseTabs = [
      { id: 'chat', label: 'Chat', icon: MessageCircle, enabled: features.showChat },
      { id: 'calendar', label: 'Calendar', icon: Calendar, enabled: features.showCalendar },
      { id: 'concierge', label: 'Concierge', icon: Headset, enabled: features.showConcierge },
      { id: 'media', label: 'Media', icon: Camera, enabled: features.showMedia },
      { id: 'payments', label: 'Payments', icon: CreditCard, enabled: features.showPayments },
      { id: 'places', label: 'Places', icon: MapPin, enabled: features.showPlaces },
      { id: 'polls', label: 'Polls', icon: BarChart3, enabled: features.showPolls },
      { id: 'tasks', label: 'Tasks', icon: ClipboardList, enabled: features.showTasks },
    ];

    // Add Team tab only for Pro trips
    if (variant === 'pro') {
      baseTabs.push({ id: 'team', label: 'Team', icon: Users, enabled: features.showTeam ?? true });
    }

    return baseTabs;
  };

  const tabs = getTabsForVariant();

  // ⚡ MOBILE OPTIMIZATION: Prefetch adjacent tabs when user visits a tab
  const enabledTabIds = tabs.filter(t => t.enabled !== false).map(t => t.id);
  useEffect(() => {
    if (tripId) {
      prefetchAdjacentTabs(tripId, activeTab, enabledTabIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enabledTabIds is unstable array ref; prefetch is best-effort
  }, [activeTab, tripId, prefetchAdjacentTabs]);

  // Scroll active tab into view and set CSS var for tabs height
  useEffect(() => {
    if (tabsContainerRef.current) {
      const activeButton = tabsContainerRef.current.querySelector(`[data-tab="${activeTab}"]`);
      if (activeButton) {
        activeButton.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
      }
    }

    const setTabsHeightVar = () => {
      const el = tabsContainerRef.current;
      const barEl = el?.parentElement as HTMLElement | null;
      const h = (barEl?.offsetHeight ?? el?.offsetHeight) || 52;
      document.documentElement.style.setProperty('--mobile-tabs-h', `${h}px`);
    };

    // simple debounce
    let t: any;
    const handler = () => {
      clearTimeout(t);
      t = setTimeout(setTabsHeightVar, 100);
    };

    setTabsHeightVar();
    window.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handler);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handler);
    };
  }, [activeTab]);

  const handleTabPress = useCallback(
    async (tabId: string, enabled: boolean) => {
      if (!enabled) {
        if (variant === 'event') {
          setShowDisabledTabDialog(true);
          onTabChange(tabId);
          return;
        }

        toast.info('This feature is disabled for this trip', {
          description: 'Contact trip admin to enable this feature',
        });
        return;
      }
      void hapticService.light();
      onTabChange(tabId);
    },
    [onTabChange, variant],
  );

  // ⚡ PERFORMANCE: Prefetch tab data on hover/focus
  // ⚡ PERFORMANCE: Prefetch tab data on hover/focus
  const handleTabHover = useCallback(
    (tabId: string) => {
      prefetchTab(tripId, tabId);
    },
    [tripId, prefetchTab],
  );

  /**
   * Handle role assignment for a member in Pro trips.
   * This enables the "Assign Roles" button in the Team tab to work properly.
   */
  const handleUpdateMemberRole = useCallback(
    async (memberId: string, roleId: string, roleName: string) => {
      if (!tripId) {
        console.error('Cannot assign role: tripId is missing');
        throw new Error('Trip ID is required');
      }

      try {
        // Find the member from participants
        const member = localParticipants.find(m => m.id === memberId);
        if (!member) {
          console.error('Member not found in participants:', memberId);
          throw new Error('Member not found');
        }

        // Persist the role assignment to the database
        await assignRole(memberId, roleId);

        // Refetch roles to update member counts
        await refetchRoles();

        // Update local state optimistically for immediate UI feedback
        setLocalParticipants(prev =>
          prev.map(p => (p.id === memberId ? { ...p, role: roleName } : p)),
        );

        toast.success(`Role assigned successfully`);
      } catch (error) {
        console.error('Failed to update member role:', error);
        toast.error('Failed to assign role');
        throw error;
      }
    },
    [tripId, localParticipants, assignRole, refetchRoles],
  );

  // ⚡ PERFORMANCE: Content-aware skeletons for lazy-loaded tabs
  const DefaultTabSkeleton = () => (
    <div className="flex items-center justify-center h-full min-h-[300px]">
      <LoadingSpinner size="md" text="Loading..." />
    </div>
  );

  // ⚡ PERFORMANCE: Get content-aware skeleton for each tab type
  const getSkeletonForTab = useCallback((tabId: string) => {
    switch (tabId) {
      case 'calendar':
      case 'agenda':
        return <CalendarSkeleton />;
      case 'chat':
        return <ChatSkeleton />;
      case 'places':
        return <PlacesSkeleton />;
      default:
        return <DefaultTabSkeleton />;
    }
  }, []);

  const renderTabContent = useCallback(
    (tabId: string) => {
      switch (tabId) {
        // Event-specific tabs
        case 'admin':
          return <EventAdminTab eventId={tripId} />;
        case 'agenda':
          return (
            <EnhancedAgendaTab
              eventId={tripId}
              userRole={isEventAdmin ? 'organizer' : 'attendee'}
              initialSessions={eventData?.agenda}
              onLineupUpdate={handleLineupUpdate}
            />
          );
        case 'lineup':
          return (
            <LineupTab
              eventId={tripId}
              permissions={{
                canView: true,
                canCreate: isEventAdmin,
                canEdit: isEventAdmin,
                canDelete: isEventAdmin,
              }}
              agendaSessions={agendaSessions}
              initialSpeakers={eventData?.speakers || []}
            />
          );
        case 'tasks':
          // For events, use EventTasksTab; for other trips, use MobileTripTasks
          if (variant === 'event') {
            return (
              <EventTasksTab
                eventId={tripId}
                permissions={{
                  canView: true,
                  canCreate: isEventAdmin,
                  canEdit: isEventAdmin,
                  canDelete: isEventAdmin,
                }}
              />
            );
          }
          return <MobileTripTasks tripId={tripId} />;
        // Pro-specific tabs
        case 'team':
          return (
            <div className="px-4 py-4 pb-safe overflow-y-auto h-full">
              <TeamTab
                roster={localParticipants.map(p => ({
                  id: p.id,
                  name: p.name,
                  role: p.role || 'member',
                  email: '',
                  avatar: '',
                  credentialLevel: 'Guest' as const,
                  permissions: [],
                }))}
                userRole="admin"
                isReadOnly={false}
                category={
                  (category ||
                    tripData?.proTripCategory ||
                    'Sports – Pro, Collegiate, Youth') as any
                }
                tripId={tripId}
                tripCreatorId={tripCreatorId || tripData?.createdBy}
                onUpdateMemberRole={handleUpdateMemberRole}
                isLoadingRoster={isLoadingRoster}
              />
            </div>
          );
        // Common tabs
        case 'chat':
          return (
            <TripChat
              tripId={tripId}
              isPro={variant === 'pro'}
              isEvent={variant === 'event'}
              participants={participants}
            />
          );
        case 'calendar':
          return <MobileGroupCalendar tripId={tripId} />;
        case 'polls':
          return <CommentsWall tripId={tripId} />;
        case 'media':
          return <MobileUnifiedMediaHub tripId={tripId} />;
        case 'places':
          return <PlacesSection tripId={tripId} />;
        case 'payments':
          return <MobileTripPayments tripId={tripId} />;
        case 'concierge':
          return (
            <AIConciergeChat
              tripId={tripId}
              basecamp={basecamp}
              isDemoMode={isDemoMode}
              // Must recompute when activeTab changes — a stale false value makes
              // Concierge immediately close Search (and cancel conversation mode).
              isActive={activeTab === tabId}
              onTabChange={onTabChange}
            />
          );
        default:
          return (
            <TripChat
              tripId={tripId}
              isPro={variant === 'pro'}
              isEvent={variant === 'event'}
              participants={participants}
            />
          );
      }
    },
    [
      tripId,
      variant,
      isEventAdmin,
      eventData,
      basecamp,
      isDemoMode,
      participants,
      localParticipants,
      handleUpdateMemberRole,
      category,
      tripCreatorId,
      tripData,
      agendaSessions,
      handleLineupUpdate,
      isLoadingRoster,
      onTabChange,
      activeTab,
    ],
  );

  useEffect(() => {
    if (variant !== 'event') return;

    if (activeTab === 'admin' && !isEventAdmin) {
      onTabChange('agenda');
      return;
    }

    const active = tabs.find(tab => tab.id === activeTab);
    if (active && !active.enabled) {
      setShowDisabledTabDialog(true);
    }
  }, [activeTab, isEventAdmin, onTabChange, tabs, variant]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Horizontal Scrollable Tab Bar - Fixed flex item, always visible */}
      <div className="flex-shrink-0 z-40 bg-black/95 backdrop-blur-md border-b border-white/10">
        <div
          ref={tabsContainerRef}
          className="flex overflow-x-auto scrollbar-hide gap-2 px-4 py-2"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            // ⚠️ iOS tap-reliability — do NOT add `scrollSnapType: 'x mandatory'` or
            // `WebkitOverflowScrolling: 'touch'` here. This row lives inside the
            // position:fixed `.mobile-trip-shell`. On iOS WKWebView, a momentum-scroll
            // compositor layer (made worse by a mandatory snap with no real snap
            // targets — the buttons' old `scroll-snap-align-start` class doesn't exist)
            // leaves the hit-test rects of horizontally scrolled-in tabs stale, so
            // Media → Tasks silently stop responding to taps while Chat/Calendar/
            // Concierge (visible at rest) keep working. Plain overflow scrolling
            // hit-tests correctly; `touch-action: manipulation` drops the 300ms delay.
            touchAction: 'manipulation',
            overscrollBehaviorX: 'contain',
          }}
        >
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const enabled = tab.enabled;

            return (
              <button
                key={tab.id}
                data-tab={tab.id}
                data-active={isActive ? 'true' : 'false'}
                onClick={() => handleTabPress(tab.id, enabled)}
                onMouseEnter={() => enabled && handleTabHover(tab.id)}
                onFocus={() => enabled && handleTabHover(tab.id)}
                className={`
                  flex items-center justify-center gap-2 
                  px-4 py-2 min-w-max h-[44px]
                  rounded-lg font-medium text-sm
                  transition-all duration-200
                  flex-shrink-0
                  touch-manipulation
                  ${enabled ? 'active:scale-95' : variant === 'event' ? '' : 'cursor-not-allowed'}
                  ${
                    isActive && enabled
                      ? 'accent-ring-active bg-background text-foreground shadow-lg'
                      : enabled
                        ? 'accent-ring-idle text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                        : variant === 'event'
                          ? 'accent-ring-idle text-muted-foreground'
                          : 'bg-white/5 text-ink-3 opacity-40 grayscale cursor-not-allowed'
                  }
                `}
              >
                <Icon size={16} className="flex-shrink-0" />
                <span className="whitespace-nowrap text-sm">{tab.label}</span>
                {!enabled && <Lock size={12} className="ml-1 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content - bounded height ensures tab rail stays visible regardless of parent layout.
          Height tracks --visual-viewport-height (set by useKeyboardHandler) so when the iOS
          keyboard opens the content area shrinks to the visible viewport. This keeps the pinned
          composer (the bottom flex child of internal-scroll tabs) sitting directly above the
          keyboard and lets only the message list scroll — native iMessage/WhatsApp behavior —
          instead of WebKit scrolling the whole webview to reveal the focused input. Falls back to
          100dvh when no keyboard is open. */}
      <div
        ref={contentRef}
        className="bg-background flex flex-col min-h-0 flex-1 overflow-hidden"
        style={{
          height:
            'calc(var(--visual-viewport-height, 100dvh) - var(--mobile-header-h, 73px) - var(--mobile-tabs-h, 52px))',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {tabs
          .filter(t => variant === 'event' || t.enabled !== false)
          .map(tab => {
            const isActive = activeTab === tab.id;
            const hasBeenVisited = visitedTabs.has(tab.id);
            const showEventDisabledState =
              variant === 'event' && tab.id !== 'admin' && !tab.enabled;

            // ⚡ CRITICAL FIX: Always mount the active tab immediately, even on first visit
            // This prevents the "click away and back" race condition where useEffect
            // updates visitedTabs AFTER the first render, causing the tab to not mount
            if (!hasBeenVisited && !isActive) return null;

            const ownsInternalScroll = INTERNAL_SCROLL_TABS.includes(tab.id);
            const scrollContained = isActive && ownsInternalScroll;

            return (
              <div
                key={tab.id}
                data-tab-panel={tab.id}
                data-scroll-contained={scrollContained ? 'true' : 'false'}
                style={{
                  display: isActive ? 'flex' : 'none',
                  flexDirection: 'column',
                  minHeight: 0,
                  overflowY: scrollContained ? 'hidden' : isActive ? 'auto' : 'hidden',
                  overflowX: 'hidden',
                  overscrollBehaviorX: 'none',
                  overscrollBehaviorY: scrollContained ? 'none' : undefined,
                  WebkitOverflowScrolling: ownsInternalScroll
                    ? undefined
                    : isActive
                      ? 'touch'
                      : undefined,
                  // Pre-mounted inactive panes must never intercept hits while display:none
                  // is inconsistently applied in some WKWebView transforms.
                  pointerEvents: isActive ? 'auto' : 'none',
                }}
                className={isActive ? 'h-full flex-1 relative' : ''}
                aria-hidden={!isActive}
                data-testid={isActive ? `mobile-tab-pane-${tab.id}` : undefined}
              >
                {/* ⚡ Per-tab error boundary: errors stay on failing tab, no bounce-back */}
                <div
                  className={`flex-1 min-h-0 flex flex-col overflow-hidden${
                    showEventDisabledState ? ' opacity-50 pointer-events-none select-none' : ''
                  }`}
                >
                  <Suspense fallback={getSkeletonForTab(tab.id)}>
                    <FeatureErrorBoundary
                      featureName={tab.label}
                      fallback={tab.id === 'chat' ? <ChatSkeleton /> : undefined}
                    >
                      {renderTabContent(tab.id)}
                    </FeatureErrorBoundary>
                  </Suspense>
                </div>

                {showEventDisabledState && (
                  <div className="absolute inset-0 flex items-start justify-center p-4">
                    <div className="mt-3 rounded-xl border border-border bg-card/95 px-4 py-3 text-sm text-foreground shadow-lg">
                      This feature has been disabled by the event admin.
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      <DisabledTabDialog open={showDisabledTabDialog} onOpenChange={setShowDisabledTabDialog} />
    </div>
  );
};
