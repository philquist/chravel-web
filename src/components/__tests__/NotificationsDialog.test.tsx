import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationsDialog } from '../home/NotificationsDialog';
import { MemoryRouter } from 'react-router-dom';
import * as joinRequestMutations from '@/lib/joinRequestMutations';

const mockNavigate = vi.fn();
const mockMaybeSingle = vi.fn();
const mockLimit = vi.fn();
const mockOrder = vi.fn();
const mockEq = vi.fn();
const mockIlike = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock hooks
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isLoading: false }),
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}));

const mockMarkAsRead = vi.fn();
const mockMarkAllAsRead = vi.fn();
const mockClearAll = vi.fn();
const mockDeleteNotification = vi.fn();

let mockNotifications: unknown[] = [];
let mockUnreadCount = 0;

vi.mock('@/hooks/useNotificationRealtime', () => ({
  useNotificationRealtime: () => ({
    notifications: mockNotifications,
    unreadCount: mockUnreadCount,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    clearAll: mockClearAll,
    deleteNotification: mockDeleteNotification,
  }),
}));

vi.mock('@/lib/joinRequestMutations', () => ({
  approveJoinRequestById: vi.fn().mockResolvedValue(undefined),
  rejectJoinRequestById: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function renderDialog(open: boolean) {
  const onOpenChange = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotificationsDialog open={open} onOpenChange={onOpenChange} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, onOpenChange };
}

describe('NotificationsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.removeItem('chravel:joinRequestNotificationResolutions');
    mockNotifications = [];
    mockUnreadCount = 0;
    mockMaybeSingle.mockResolvedValue({ data: null });
    mockLimit.mockResolvedValue({ data: [] });
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockEq.mockReturnValue({ order: mockOrder, maybeSingle: mockMaybeSingle });
    mockIlike.mockReturnValue({ order: mockOrder });
    mockSelect.mockReturnValue({ eq: mockEq, ilike: mockIlike });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('renders empty state when open with no notifications', () => {
    renderDialog(true);
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
  });

  it('does not render content when closed', () => {
    renderDialog(false);
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  });

  it('renders notification items when present', () => {
    mockNotifications = [
      {
        id: 'n-1',
        type: 'join_request',
        title: 'Alice wants to join Trip',
        description: 'Tap to approve or reject',
        tripId: 'trip-1',
        tripName: 'Coachella',
        timestamp: '4 days ago',
        isRead: false,
        data: {
          trip_id: 'trip-1',
          request_id: 'req-1',
          trip_type: 'consumer',
        },
      },
    ];
    mockUnreadCount = 1;

    renderDialog(true);
    expect(screen.getByText('Alice wants to join Trip')).toBeInTheDocument();
    expect(screen.getByText('Coachella')).toBeInTheDocument();
    expect(screen.getByLabelText('Accept join request')).toBeInTheDocument();
    expect(screen.getByLabelText('Deny join request')).toBeInTheDocument();
  });

  it('does not show inline join actions when request_id metadata is missing', () => {
    mockNotifications = [
      {
        id: 'n-legacy',
        type: 'join_request',
        title: 'Legacy join notice',
        description: 'No request id',
        tripId: 'trip-1',
        tripName: 'Coachella',
        timestamp: '4 days ago',
        isRead: false,
        data: { trip_id: 'trip-1', trip_type: 'consumer' },
      },
    ];

    renderDialog(true);
    expect(screen.queryByLabelText('Accept join request')).not.toBeInTheDocument();
  });

  it('accepts join request from notification actions, marks read, and shows resolved labels', async () => {
    mockNotifications = [
      {
        id: 'n-1',
        type: 'join_request',
        title: 'Alice wants to join Trip',
        description: 'Tap to approve or reject',
        tripId: 'trip-1',
        tripName: 'Coachella',
        timestamp: '4 days ago',
        isRead: false,
        data: {
          trip_id: 'trip-1',
          request_id: 'req-uuid-1',
          trip_type: 'consumer',
        },
      },
    ];

    renderDialog(true);
    fireEvent.click(screen.getByLabelText('Accept join request'));

    await waitFor(() => {
      expect(joinRequestMutations.approveJoinRequestById).toHaveBeenCalledWith(expect.any(Object), {
        requestId: 'req-uuid-1',
        tripId: 'trip-1',
      });
      expect(mockMarkAsRead).toHaveBeenCalledWith('n-1');
      expect(screen.getByText('Accepted')).toBeInTheDocument();
      expect(screen.getByText('Deny')).toBeInTheDocument();
    });
    expect(mockDeleteNotification).not.toHaveBeenCalled();
  });

  it('rejects join request and shows Denied state without deleting the row', async () => {
    mockNotifications = [
      {
        id: 'n-reject',
        type: 'join_request',
        title: 'Bob wants to join Trip',
        description: 'Tap to approve or reject',
        tripId: 'trip-1',
        tripName: 'Coachella',
        timestamp: '4 days ago',
        isRead: false,
        data: {
          trip_id: 'trip-1',
          request_id: 'req-reject-1',
          trip_type: 'consumer',
        },
      },
    ];

    renderDialog(true);
    fireEvent.click(screen.getByLabelText('Deny join request'));

    await waitFor(() => {
      expect(joinRequestMutations.rejectJoinRequestById).toHaveBeenCalledWith(expect.any(Object), {
        requestId: 'req-reject-1',
        tripId: 'trip-1',
      });
      expect(mockMarkAsRead).toHaveBeenCalledWith('n-reject');
      expect(screen.getByText('Denied')).toBeInTheDocument();
      expect(screen.getByText('Accept')).toBeInTheDocument();
    });
    expect(mockDeleteNotification).not.toHaveBeenCalled();
  });

  it('clears a single notification from the dismiss control', async () => {
    mockNotifications = [
      {
        id: 'n-clear',
        type: 'calendar',
        title: 'Event reminder',
        description: 'Soon',
        tripId: 'trip-1',
        tripName: 'Coachella',
        timestamp: '1h ago',
        isRead: false,
        data: { trip_id: 'trip-1', trip_type: 'consumer' },
      },
    ];

    renderDialog(true);
    fireEvent.click(screen.getByLabelText('Clear notification'));

    await waitFor(() => {
      expect(mockDeleteNotification).toHaveBeenCalledWith('n-clear');
    });
  });

  it('navigates mention notification to consumer chat with metadata-first routing + handshake state', async () => {
    mockNotifications = [
      {
        id: 'n-consumer-mention',
        type: 'mention',
        title: 'You were mentioned',
        description: 'In consumer trip',
        tripId: 'trip-fallback',
        tripName: 'Consumer Trip',
        timestamp: 'now',
        isRead: false,
        data: {
          trip_id: 'trip-consumer',
          trip_type: 'consumer',
          channel_type: 'chat',
          message_id: 'msg-123',
        },
      },
    ];

    renderDialog(true);
    fireEvent.click(screen.getByText('You were mentioned'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/trip/trip-consumer?tab=chat', {
        state: {
          chatNavigationContext: {
            source: 'notification',
            notificationId: 'n-consumer-mention',
            messageId: 'msg-123',
            channelType: 'chat',
          },
        },
      });
    });
  });

  it('navigates mention notification to pro chat', async () => {
    mockNotifications = [
      {
        id: 'n-pro-mention',
        type: 'mention',
        title: 'You were mentioned in pro trip',
        description: 'Pro mention',
        tripId: 'trip-pro',
        tripName: 'Pro Trip',
        timestamp: 'now',
        isRead: false,
        data: {
          trip_id: 'trip-pro',
          trip_type: 'pro',
          channel_type: 'chat',
        },
      },
    ];

    renderDialog(true);
    fireEvent.click(screen.getByText('You were mentioned in pro trip'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/tour/pro/trip-pro?tab=chat', {
        state: {
          chatNavigationContext: {
            source: 'notification',
            notificationId: 'n-pro-mention',
            channelType: 'chat',
          },
        },
      });
    });
  });

  it('navigates mention notification to event chat', async () => {
    mockNotifications = [
      {
        id: 'n-event-mention',
        type: 'mention',
        title: 'You were mentioned in event',
        description: 'Event mention',
        tripId: 'trip-event',
        tripName: 'Event Trip',
        timestamp: 'now',
        isRead: false,
        data: {
          trip_id: 'trip-event',
          trip_type: 'event',
          channel_type: 'chat',
        },
      },
    ];

    renderDialog(true);
    fireEvent.click(screen.getByText('You were mentioned in event'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/event/trip-event?tab=chat', {
        state: {
          chatNavigationContext: {
            source: 'notification',
            notificationId: 'n-event-mention',
            channelType: 'chat',
          },
        },
      });
    });
  });

  it('falls back to notification tripId when metadata trip_id is missing', async () => {
    mockNotifications = [
      {
        id: 'n-fallback',
        type: 'calendar',
        title: 'Itinerary updated',
        description: 'No metadata trip id',
        tripId: 'trip-safe-fallback',
        tripName: 'Fallback Trip',
        timestamp: 'now',
        isRead: false,
        data: {
          trip_type: 'consumer',
        },
      },
    ];

    renderDialog(true);
    fireEvent.click(screen.getByText('Itinerary updated'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/trip/trip-safe-fallback?tab=calendar', undefined);
    });
  });

  it('hydrates trip type from trips table when approval notification lacks trip_type', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: 'trip-pro-approved', trip_type: 'pro' },
    });
    mockNotifications = [
      {
        id: 'n-approval-pro',
        type: 'system',
        title: 'Join Request Approved',
        description: 'Your request to join "Pro Tour" has been approved!',
        tripId: 'trip-pro-approved',
        tripName: 'Pro Tour',
        timestamp: 'now',
        isRead: false,
        data: {
          action: 'join_approved',
          trip_name: 'Pro Tour',
        },
      },
    ];

    renderDialog(true);
    fireEvent.click(screen.getByText('Join Request Approved'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/tour/pro/trip-pro-approved', undefined);
    });
  });
});
