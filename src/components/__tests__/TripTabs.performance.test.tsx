import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TripTabs } from '../TripTabs';

vi.mock('../../hooks/useSuperAdmin', () => ({
  useSuperAdmin: () => ({ isSuperAdmin: true }),
}));

vi.mock('../../hooks/useFeatureToggle', () => ({
  useFeatureToggle: () => ({
    showChat: true,
    showCalendar: true,
    showMedia: true,
    showPolls: true,
    showTasks: true,
  }),
}));

vi.mock('../../hooks/usePrefetchTrip', () => ({
  usePrefetchTrip: () => ({
    prefetchTab: vi.fn(),
    prefetchAdjacentTabs: vi.fn(),
    prefetchPriorityTabs: vi.fn(),
  }),
}));
const conciergeRenderSpy = vi.fn();

vi.mock('../AIConciergeChat', () => ({
  AIConciergeChat: () => {
    conciergeRenderSpy();
    return <div>concierge-panel</div>;
  },
}));

vi.mock('@/features/chat/components/TripChat', () => ({
  TripChat: () => <div>chat-panel</div>,
}));

vi.mock('../GroupCalendar', () => ({
  GroupCalendar: () => <div>calendar-panel</div>,
}));

vi.mock('../CommentsWall', () => ({
  CommentsWall: () => <div>polls-panel</div>,
}));

vi.mock('../todo/TripTasksTab', () => ({
  TripTasksTab: () => <div>tasks-panel</div>,
}));

vi.mock('../UnifiedMediaHub', () => ({
  UnifiedMediaHub: () => <div>media-panel</div>,
}));

vi.mock('../PlacesSection', () => ({
  PlacesSection: () => <div>places-panel</div>,
}));

vi.mock('../payments/PaymentsTab', () => ({
  PaymentsTab: () => <div>payments-panel</div>,
}));

describe('TripTabs concierge mounting and parent sync', () => {
  it('does not mount concierge until concierge tab is selected, and notifies parent on tab change', async () => {
    const onTabChange = vi.fn();
    render(<TripTabs activeTab="chat" onTabChange={onTabChange} showConcierge tripId="trip-1" />);

    expect(conciergeRenderSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /calendar/i }));
    expect(onTabChange).toHaveBeenCalledWith('calendar');
    expect(conciergeRenderSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /concierge/i }));
    expect(onTabChange).toHaveBeenCalledWith('concierge');
    expect(await screen.findByText('concierge-panel')).toBeInTheDocument();
    expect(conciergeRenderSpy).toHaveBeenCalled();
  });
});
