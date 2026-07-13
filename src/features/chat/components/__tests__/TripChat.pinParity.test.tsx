import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TripChat } from '../TripChat';

type StreamLikeMessage = {
  id: string;
  text: string;
  user: { id: string; name: string };
  created_at: string;
  pinned?: boolean;
  pinned_at?: string | null;
};

const mockTogglePin = vi.fn();
const mockSetMessageFilter = vi.fn();
let mockParams: { tripId?: string; proTripId?: string; eventId?: string } = { tripId: 'trip-123' };
let mockMessages: StreamLikeMessage[] = [];
let mockMessageFilter: 'all' | 'broadcasts' | 'pinned' | 'channels' = 'all';

vi.mock('react-router-dom', () => ({
  useParams: () => mockParams,
  useLocation: () => ({ state: null }),
}));

vi.mock('@/hooks/useDemoMode', () => ({ useDemoMode: () => ({ isDemoMode: false }) }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', displayName: 'User One', avatar: '' } }),
}));
vi.mock('@/hooks/useTripMembers', () => ({
  useTripMembers: () => ({
    tripMembers: [
      { id: 'user-1', name: 'User One', avatar: '' },
      { id: 'user-2', name: 'User Two', avatar: '' },
    ],
  }),
}));

vi.mock('../../hooks/useTripChat', () => ({
  useTripChat: () => ({
    messages: mockMessages,
    isLoading: false,
    error: null,
    sendMessageAsync: vi.fn(),
    isCreating: false,
    loadMore: vi.fn(),
    hasMore: false,
    isLoadingMore: false,
    toggleReaction: vi.fn(),
    togglePin: mockTogglePin,
    reload: vi.fn(),
    activeChannel: { state: { read: {} } },
  }),
}));

vi.mock('../../hooks/useChatComposer', () => ({
  useChatComposer: () => ({
    inputMessage: '',
    setInputMessage: vi.fn(),
    messageFilter: mockMessageFilter,
    setMessageFilter: mockSetMessageFilter,
    replyingTo: null,
    setReply: vi.fn(),
    clearReply: vi.fn(),
    sendMessage: vi.fn(),
    filterMessages: (messages: unknown[]) => messages,
  }),
}));

vi.mock('../../adapters/streamMessageViewModel', async importOriginal => {
  const actual = await importOriginal<typeof import('../../adapters/streamMessageViewModel')>();
  return {
    ...actual,
    buildStreamMessageViewModels: ({ messages }: { messages: StreamLikeMessage[] }) =>
      messages.map(message => ({
        id: message.id,
        text: message.text,
        sender: { id: message.user.id, name: message.user.name },
        createdAt: message.created_at,
        isPinned: Boolean(message.pinned),
        pinnedAt: message.pinned_at ?? undefined,
        reactions: {},
      })),
  };
});

vi.mock('@/hooks/useKeyboardHandler', () => ({
  useKeyboardHandler: () => ({ isKeyboardVisible: false }),
}));
vi.mock('@/hooks/useSwipeGesture', () => ({ useSwipeGesture: vi.fn() }));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => ({ isOffline: false }) }));
vi.mock('@/hooks/useRoleChannels', () => ({
  useRoleChannels: () => ({
    availableChannels: [{ id: 'ch-1', channelName: 'Ops', memberCount: 2 }],
    activeChannel: null,
    setActiveChannel: vi.fn(),
  }),
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
vi.mock('../../hooks/useChatReadReceipts', () => ({ useChatReadReceipts: () => ({}) }));
vi.mock('../../hooks/useChatTypingIndicators', () => ({
  useChatTypingIndicators: () => ({ typingUsers: [], handleTypingChange: vi.fn() }),
}));
vi.mock('../../hooks/useChatReactions', () => ({
  useChatReactions: () => ({ reactions: {}, handleReaction: vi.fn() }),
}));
vi.mock('@/hooks/useSystemMessagePreferences', () => ({
  useEffectiveSystemMessagePreferences: () => ({ data: null }),
}));
vi.mock('@/hooks/useTripType', () => ({ useTripType: () => ({ isConsumer: true }) }));
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
    userRole: 'admin',
  }),
}));
vi.mock('../../hooks/useLinkPreviews', () => ({ useLinkPreviews: () => ({}) }));
vi.mock('@/hooks/useUserSafety', () => ({
  useBlockedUsers: () => ({ blockedUserIds: [], blockUser: vi.fn(), isBlocking: false }),
  useReportContent: () => ({ reportContent: vi.fn(), isReporting: false }),
}));

vi.mock('../ChatInput', () => ({ ChatInput: () => <div data-testid="chat-input" /> }));
vi.mock('../InlineReplyComponent', () => ({ InlineReplyComponent: () => null }));
vi.mock('../TypingIndicator', () => ({ TypingIndicator: () => null }));
vi.mock('../ChatSearchOverlay', () => ({ ChatSearchOverlay: () => null }));
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
vi.mock('@/services/stream/streamClient', () => ({
  getStreamClient: () => ({ userID: 'user-1' }),
  onStreamClientConnected: vi.fn(() => () => {}),
  onStreamClientConnectionStatusChange: vi.fn(() => () => {}),
}));

vi.mock('../VirtualizedMessageContainer', () => ({
  VirtualizedMessageContainer: ({
    messages,
    renderMessage,
  }: {
    messages: unknown[];
    renderMessage: (...args: unknown[]) => React.ReactNode;
  }) => (
    <div data-testid="virtualized-message-container">
      {messages.map((message, index) => (
        <React.Fragment key={(message as { id: string }).id}>
          {renderMessage(message, index, true)}
        </React.Fragment>
      ))}
    </div>
  ),
}));

vi.mock('../MessageItem', () => ({
  MessageItem: ({
    message,
    onTogglePin,
  }: {
    message: { id: string; text: string; isPinned?: boolean };
    onTogglePin?: (id: string, shouldPin: boolean) => void;
  }) => (
    <div>
      <p>{message.text}</p>
      <button
        data-testid={`toggle-pin-${message.id}`}
        onClick={() => onTogglePin?.(message.id, !message.isPinned)}
      >
        {message.isPinned ? 'unpin' : 'pin'}
      </button>
    </div>
  ),
}));

describe('TripChat pin parity across trip/pro/event contexts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Pinned summary banner only renders when the pinned filter is active (matches TripChat).
    mockMessageFilter = 'pinned';
    mockMessages = [
      {
        id: 'msg-1',
        text: 'Preserve this text',
        user: { id: 'user-1', name: 'User One' },
        created_at: '2026-04-27T00:00:00.000Z',
        pinned: true,
        pinned_at: '2026-04-27T00:01:00.000Z',
      },
    ];
  });

  const renderSubject = (props?: React.ComponentProps<typeof TripChat>) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TripChat tripId="trip-123" {...props} />
      </QueryClientProvider>,
    );
  };

  it.each([
    { label: 'trip', params: { tripId: 'trip-123' }, props: {} },
    { label: 'pro', params: { proTripId: 'pro-123' }, props: { isPro: true } },
    { label: 'event', params: { eventId: 'event-123' }, props: { isEvent: true } },
  ])(
    'keeps pin/unpin parity for $label chats and keeps search/channels UX available',
    ({ params, props }) => {
      mockParams = params;
      renderSubject(props);

      expect(screen.getByText('Preserve this text')).toBeInTheDocument();
      expect(screen.getByText('Pinned Messages')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('toggle-pin-msg-1'));
      expect(mockTogglePin).toHaveBeenCalledWith('msg-1', false);

      expect(screen.getByText('Preserve this text')).toBeInTheDocument();

      if ('isPro' in props) {
        // Desktop pro renders the persistent channel rail: channels stay
        // reachable as always-visible rows (plus rail-level search).
        expect(screen.getByRole('navigation', { name: 'Chat sections' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /ops/i })).toBeInTheDocument();
        expect(screen.getByLabelText('Search messages')).toBeInTheDocument();
      }
    },
  );
});
