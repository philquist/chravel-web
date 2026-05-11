import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TripChat } from '../TripChat';

const composerState = vi.hoisted(() => ({
  replyingTo: null as { id: string; text: string; senderName: string } | null,
  sendMessage: vi.fn(),
  setInputMessage: vi.fn(),
}));

const tripChatState = vi.hoisted(() => ({
  sendTripMessage: vi.fn(),
  messages: [
    {
      id: 'parent-1',
      text: 'Parent message',
      user: { id: 'user-2', name: 'Traveler Two', image: 'avatar.png' },
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ],
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ tripId: 'trip-123' }),
  useLocation: () => ({ state: null }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', displayName: 'User One', email: 'user1@test.com' } }),
}));

vi.mock('@/hooks/useTripMembers', () => ({
  useTripMembers: () => ({ tripMembers: [{ id: 'user-1', name: 'User One', avatar: '' }] }),
}));

vi.mock('../../hooks/useTripChat', () => ({
  useTripChat: () => ({
    messages: tripChatState.messages,
    isLoading: false,
    sendMessageAsync: tripChatState.sendTripMessage,
    isCreating: false,
    loadMore: vi.fn(),
    hasMore: false,
    isLoadingMore: false,
    toggleReaction: vi.fn(),
    reload: vi.fn(),
    activeChannel: { state: { read: {} } },
  }),
}));

vi.mock('../../hooks/useChatComposer', () => ({
  useChatComposer: () => ({
    inputMessage: 'message draft',
    setInputMessage: composerState.setInputMessage,
    messageFilter: 'all',
    setMessageFilter: vi.fn(),
    replyingTo: composerState.replyingTo,
    setReply: vi.fn(),
    clearReply: vi.fn(),
    sendMessage: composerState.sendMessage,
    filterMessages: (messages: unknown[]) => messages,
  }),
}));

vi.mock('@/hooks/useKeyboardHandler', () => ({
  useKeyboardHandler: () => ({ isKeyboardVisible: false }),
}));
vi.mock('@/hooks/useSwipeGesture', () => ({ useSwipeGesture: vi.fn() }));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => ({ isOffline: false }) }));
vi.mock('@/hooks/useRoleChannels', () => ({
  useRoleChannels: () => ({ availableChannels: [], setActiveChannel: vi.fn() }),
}));
vi.mock('@/hooks/usePullToRefresh', () => ({
  usePullToRefresh: () => ({ isRefreshing: false, pullDistance: 0 }),
}));
vi.mock('@/hooks/useUnreadCounts', () => ({
  useUnreadCounts: () => ({
    broadcastUnreadCount: 0,
    totalBroadcastCount: 0,
    messageUnreadCount: 0,
  }),
}));
vi.mock('../../hooks/useChatReadReceipts', () => ({
  useChatReadReceipts: () => ({ readStatusesByMessage: {} }),
}));
vi.mock('../../hooks/useChatTypingIndicators', () => ({
  useChatTypingIndicators: () => ({ typingUsers: [], handleTypingChange: vi.fn() }),
}));
vi.mock('../../hooks/useChatReactions', () => ({
  useChatReactions: () => ({ reactions: {}, handleReaction: vi.fn() }),
}));
vi.mock('@/hooks/useSystemMessagePreferences', () => ({
  useEffectiveSystemMessagePreferences: () => ({ data: null }),
}));
vi.mock('@/utils/tripTierDetector', () => ({ isConsumerTrip: () => true }));
vi.mock('@/hooks/useTripPrivacyConfig', () => ({
  useTripPrivacyConfig: () => ({ data: null }),
  getEffectivePrivacyMode: () => 'all',
}));
vi.mock('@/hooks/useTripChatMode', () => ({
  useTripChatMode: () => ({
    effectiveChatMode: 'all',
    canPost: true,
    canUploadMedia: true,
    isLoading: false,
    userRole: 'member',
  }),
}));
vi.mock('../../hooks/useLinkPreviews', () => ({ useLinkPreviews: () => ({}) }));
vi.mock('@/hooks/useUserSafety', () => ({
  useBlockedUsers: () => ({ blockedUserIds: [], blockUser: vi.fn(), isBlocking: false }),
  useReportContent: () => ({ reportContent: vi.fn(), isReporting: false }),
}));

vi.mock('../ChatInput', () => ({
  ChatInput: ({ onSendMessage }: { onSendMessage: () => void }) => (
    <button data-testid="send-message" onClick={() => onSendMessage()}>
      send
    </button>
  ),
}));
vi.mock('../InlineReplyComponent', () => ({ InlineReplyComponent: () => null }));
vi.mock('../TypingIndicator', () => ({ TypingIndicator: () => null }));
vi.mock('../MessageTypeBar', () => ({ MessageTypeBar: () => null }));
vi.mock('../ChatSearchOverlay', () => ({ ChatSearchOverlay: () => null }));
vi.mock('../ThreadView', () => ({
  ThreadView: ({ parentMessage }: { parentMessage: { id: string } }) => (
    <div data-testid="thread-view">{parentMessage.id}</div>
  ),
}));
vi.mock('@/components/mobile/PullToRefreshIndicator', () => ({
  PullToRefreshIndicator: () => null,
}));
vi.mock('@/components/mobile/SkeletonLoader', () => ({ MessageSkeleton: () => null }));
vi.mock('@/components/pro/channels/ChannelChatView', () => ({ ChannelChatView: () => null }));
vi.mock('@/components/ui/alert', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/services/demoModeService', () => ({ demoModeService: { getMessages: vi.fn() } }));
vi.mock('@/services/hapticService', () => ({ hapticService: { light: vi.fn() } }));
vi.mock('@/services/chatContentParser', () => ({ parseMessage: vi.fn() }));
vi.mock('@/services/stream/streamClient', () => ({ getStreamClient: vi.fn(() => null) }));

vi.mock('../VirtualizedMessageContainer', () => ({
  VirtualizedMessageContainer: ({ messages, renderMessage }: any) => (
    <div>
      {messages.map((m: any, i: number) => (
        <React.Fragment key={m.id}>{renderMessage(m, i, true)}</React.Fragment>
      ))}
    </div>
  ),
}));

vi.mock('../MessageItem', () => ({
  MessageItem: () => null,
}));

describe('TripChat thread reply affordance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    composerState.replyingTo = null;
    composerState.sendMessage.mockResolvedValue({ id: 'new-1', text: 'sent reply' });
    tripChatState.sendTripMessage.mockResolvedValue(undefined);
  });

  const renderSubject = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TripChat tripId="trip-123" />
      </QueryClientProvider>,
    );
  };

  it('opens thread context after a successful reply send', async () => {
    composerState.replyingTo = {
      id: 'parent-1',
      text: 'Parent message',
      senderName: 'Traveler Two',
    };

    renderSubject();
    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => {
      expect(tripChatState.sendTripMessage).toHaveBeenCalledWith(
        'sent reply',
        'User One',
        undefined,
        undefined,
        'user-1',
        'all',
        'text',
        'parent-1',
        {
          id: 'parent-1',
          text: 'Parent message',
          authorName: 'Traveler Two',
        },
        undefined,
      );
    });

    expect(screen.getByTestId('thread-view')).toHaveTextContent('parent-1');
  });

  it('keeps top-level sends unchanged (no thread drawer)', async () => {
    renderSubject();
    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => {
      expect(tripChatState.sendTripMessage).toHaveBeenCalledWith(
        'sent reply',
        'User One',
        undefined,
        undefined,
        'user-1',
        'all',
        'text',
        undefined,
        undefined,
        undefined,
      );
    });

    expect(screen.queryByTestId('thread-view')).not.toBeInTheDocument();
  });
});
