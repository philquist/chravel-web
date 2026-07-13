/**
 * MobileTripTabs render-stability regression tests.
 *
 * Guards against self-sustaining render loops on mount and — critically — on
 * REAL activeTab prop transitions. The `participants = []` inline default fed
 * the localParticipants sync effect and froze every tab switch on surfaces
 * that omit the prop (consumer + event detail pages); no prior test performed
 * an actual rerender with a changed activeTab, so it shipped unseen. These
 * tests count child renders across a settle window: a runaway loop starves
 * timers, so the settle itself doubles as a hang detector.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));
vi.mock('@/hooks/useEventPermissions', () => ({ useEventPermissions: () => ({ isAdmin: false }) }));
vi.mock('@/hooks/useEventAgenda', () => ({ useEventAgenda: () => ({ sessions: [] }) }));
vi.mock('@/hooks/useEventLineup', () => ({
  useEventLineup: () => ({ members: [], addLineupFromAgenda: vi.fn() }),
}));
vi.mock('@/hooks/useEventTabSettings', () => ({
  useEventTabSettings: () => ({ enabledTabs: [] }),
}));
vi.mock('@/lib/eventTabs', () => ({ resolveEventTabsForRole: () => [] }));
vi.mock('@/lib/retryImport', () => ({ retryImport: (loader: () => Promise<unknown>) => loader() }));
vi.mock('@/hooks/useFeatureToggle', () => ({
  useFeatureToggle: () => ({
    showChat: true,
    showCalendar: true,
    showConcierge: true,
    showMedia: true,
    showPayments: true,
    showPlaces: true,
    showPolls: true,
    showTasks: true,
    showTeam: true,
  }),
}));
vi.mock('@/contexts/TripVariantContext', () => ({ useTripVariant: () => ({ accentColors: {} }) }));
vi.mock('@/hooks/useDemoMode', () => ({ useDemoMode: () => ({ isDemoMode: false }) }));
vi.mock('@/hooks/usePrefetchTrip', () => ({
  usePrefetchTrip: () => ({
    prefetchTab: vi.fn(),
    prefetchAdjacentTabs: vi.fn(),
    prefetchPriorityTabs: vi.fn(),
  }),
}));
vi.mock('@/hooks/useRoleAssignments', () => ({
  useRoleAssignments: () => ({ assignRole: vi.fn() }),
}));
vi.mock('@/hooks/useTripRoles', () => ({ useTripRoles: () => ({ refetch: vi.fn() }) }));
vi.mock('@/services/hapticService', () => ({
  hapticService: { light: vi.fn().mockResolvedValue(undefined) },
}));

const renderCounts = vi.hoisted(() => ({ concierge: 0, chat: 0 }));

vi.mock('@/features/chat/components/TripChat', () => ({
  TripChat: () => {
    renderCounts.chat += 1;
    return <div>Chat tab</div>;
  },
}));
vi.mock('../MobileGroupCalendar', () => ({ MobileGroupCalendar: () => <div>Calendar tab</div> }));
vi.mock('../MobileTripTasks', () => ({ MobileTripTasks: () => <div>Tasks tab</div> }));
vi.mock('../../CommentsWall', () => ({ CommentsWall: () => <div>Polls tab</div> }));
vi.mock('../MobileUnifiedMediaHub', () => ({ MobileUnifiedMediaHub: () => <div>Media tab</div> }));
vi.mock('../../PlacesSection', () => ({ PlacesSection: () => <div>Places tab</div> }));
vi.mock('../../AIConciergeChat', () => ({
  AIConciergeChat: () => {
    renderCounts.concierge += 1;
    return <div>Concierge tab</div>;
  },
}));
vi.mock('../MobileTripPayments', () => ({ MobileTripPayments: () => <div>Payments tab</div> }));
vi.mock('../../events/EnhancedAgendaTab', () => ({
  EnhancedAgendaTab: () => <div>Agenda tab</div>,
}));
vi.mock('../../events/LineupTab', () => ({ LineupTab: () => <div>Lineup tab</div> }));
vi.mock('../../events/EventTasksTab', () => ({ EventTasksTab: () => <div>Event tasks tab</div> }));
vi.mock('../../pro/TeamTab', () => ({ TeamTab: () => <div>Team tab</div> }));
vi.mock('../../events/EventAdminTab', () => ({ EventAdminTab: () => <div>Admin tab</div> }));
vi.mock('../../events/DisabledTabDialog', () => ({ DisabledTabDialog: () => null }));
vi.mock('../../loading', () => ({
  CalendarSkeleton: () => <div>Calendar loading</div>,
  PlacesSkeleton: () => <div>Places loading</div>,
  ChatSkeleton: () => <div>Chat loading</div>,
}));
vi.mock('../../LoadingSpinner', () => ({ LoadingSpinner: () => <div>Loading</div> }));
vi.mock('../../FeatureErrorBoundary', () => ({
  FeatureErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { MobileTripTabs } from '../MobileTripTabs';

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 250));

describe('MobileTripTabs render stability', () => {
  beforeEach(() => {
    renderCounts.concierge = 0;
    renderCounts.chat = 0;
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('consumer + chat mount is quiet', async () => {
    render(
      <MobileTripTabs
        activeTab="chat"
        onTabChange={vi.fn()}
        tripId="trip-1"
        basecamp={{ name: 'Hotel', address: 'Tokyo' }}
      />,
    );
    await settle();
    expect(renderCounts.concierge).toBeLessThan(30);
  });

  it('pro + chat + tripData mount is quiet', async () => {
    render(
      <MobileTripTabs
        activeTab="chat"
        onTabChange={vi.fn()}
        tripId="trip-1"
        basecamp={{ name: 'Hotel', address: 'Tokyo' }}
        variant="pro"
        tripData={{ enabled_features: ['chat', 'calendar', 'concierge', 'media', 'payments'] }}
      />,
    );
    await settle();
    expect(renderCounts.concierge).toBeLessThan(30);
  });

  it('pro + chat WITHOUT tripData mount is quiet', async () => {
    render(
      <MobileTripTabs
        activeTab="chat"
        onTabChange={vi.fn()}
        tripId="trip-1"
        basecamp={{ name: 'Hotel', address: 'Tokyo' }}
        variant="pro"
      />,
    );
    await settle();
    expect(renderCounts.concierge).toBeLessThan(30);
  });

  it('consumer chat->calendar TRANSITION is quiet (no participants prop — the frozen surface)', async () => {
    const { rerender } = render(
      <MobileTripTabs
        activeTab="chat"
        onTabChange={vi.fn()}
        tripId="trip-1"
        basecamp={{ name: 'Hotel', address: 'Tokyo' }}
      />,
    );
    await settle();

    rerender(
      <MobileTripTabs
        activeTab="calendar"
        onTabChange={vi.fn()}
        tripId="trip-1"
        basecamp={{ name: 'Hotel', address: 'Tokyo' }}
      />,
    );
    await settle();
    expect(renderCounts.chat).toBeLessThan(60);
  });

  it('pro chat->concierge TRANSITION is quiet', async () => {
    const { rerender } = render(
      <MobileTripTabs
        activeTab="chat"
        onTabChange={vi.fn()}
        tripId="trip-1"
        basecamp={{ name: 'Hotel', address: 'Tokyo' }}
        variant="pro"
        tripData={{ enabled_features: ['chat', 'calendar', 'concierge', 'media', 'payments'] }}
      />,
    );
    await settle();
    renderCounts.concierge = 0;

    rerender(
      <MobileTripTabs
        activeTab="concierge"
        onTabChange={vi.fn()}
        tripId="trip-1"
        basecamp={{ name: 'Hotel', address: 'Tokyo' }}
        variant="pro"
        tripData={{ enabled_features: ['chat', 'calendar', 'concierge', 'media', 'payments'] }}
      />,
    );
    await settle();
    expect(renderCounts.concierge).toBeLessThan(30);
  });

  it('pro chat->calendar TRANSITION is quiet', async () => {
    const { rerender } = render(
      <MobileTripTabs
        activeTab="chat"
        onTabChange={vi.fn()}
        tripId="trip-1"
        basecamp={{ name: 'Hotel', address: 'Tokyo' }}
        variant="pro"
        tripData={{ enabled_features: ['chat', 'calendar', 'concierge', 'media', 'payments'] }}
      />,
    );
    await settle();

    rerender(
      <MobileTripTabs
        activeTab="calendar"
        onTabChange={vi.fn()}
        tripId="trip-1"
        basecamp={{ name: 'Hotel', address: 'Tokyo' }}
        variant="pro"
        tripData={{ enabled_features: ['chat', 'calendar', 'concierge', 'media', 'payments'] }}
      />,
    );
    await settle();
    expect(renderCounts.chat).toBeLessThan(60);
  });

  it('pro + concierge + tripData mount is quiet', async () => {
    render(
      <MobileTripTabs
        activeTab="concierge"
        onTabChange={vi.fn()}
        tripId="trip-1"
        basecamp={{ name: 'Hotel', address: 'Tokyo' }}
        variant="pro"
        tripData={{ enabled_features: ['chat', 'calendar', 'concierge', 'media', 'payments'] }}
      />,
    );
    await settle();
    expect(renderCounts.concierge).toBeLessThan(30);
  });
});
