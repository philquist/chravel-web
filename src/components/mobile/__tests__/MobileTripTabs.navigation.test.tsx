import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

vi.mock('@/features/chat/components/TripChat', () => ({ TripChat: () => <div>Chat tab</div> }));
vi.mock('../MobileGroupCalendar', () => ({ MobileGroupCalendar: () => <div>Calendar tab</div> }));
vi.mock('../MobileTripTasks', () => ({ MobileTripTasks: () => <div>Tasks tab</div> }));
vi.mock('../../CommentsWall', () => ({ CommentsWall: () => <div>Polls tab</div> }));
vi.mock('../MobileUnifiedMediaHub', () => ({ MobileUnifiedMediaHub: () => <div>Media tab</div> }));
vi.mock('../../PlacesSection', () => ({ PlacesSection: () => <div>Places tab</div> }));
vi.mock('../../AIConciergeChat', () => ({ AIConciergeChat: () => <div>Concierge tab</div> }));
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

describe('MobileTripTabs tab navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('keeps chat tab panel scroll-contained so the composer stays pinned', async () => {
    render(
      <MobileTripTabs
        activeTab="chat"
        onTabChange={vi.fn()}
        tripId="trip-1"
        basecamp={{ name: 'Hotel', address: 'Tokyo' }}
      />,
    );

    expect(await screen.findByText('Chat tab')).toBeInTheDocument();

    const chatPanel = document.querySelector('[data-tab-panel="chat"]');
    expect(chatPanel).toBeTruthy();
    expect(chatPanel?.getAttribute('data-scroll-contained')).toBe('true');

    const style = (chatPanel as HTMLElement).style;
    expect(style.overflowY).toBe('hidden');
    expect(style.overscrollBehaviorY).toBe('none');
  });

  it('lets users leave Concierge for Payments without the content pane taking horizontal gestures', async () => {
    const onTabChange = vi.fn();

    const { container } = render(
      <MobileTripTabs
        activeTab="concierge"
        onTabChange={onTabChange}
        tripId="trip-1"
        basecamp={{ name: 'Hotel', address: 'Tokyo' }}
        variant="pro"
        tripData={{ enabled_features: ['chat', 'calendar', 'concierge', 'media', 'payments'] }}
      />,
    );

    expect(await screen.findByText('Concierge tab')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /payments/i }));

    await waitFor(() => expect(onTabChange).toHaveBeenCalledWith('payments'));

    const activePanel = container.querySelector('[style*="overflow-x: hidden"]');
    expect(activePanel).toBeTruthy();
  });
});
