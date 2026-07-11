import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TripChat } from '../TripChat';

const mockSetReply = vi.fn();
const mockVirtualizedMessageContainer = vi.fn();
const mockMessageItem = vi.fn();
const mockMessageTypeBar = vi.fn();
const mockTripTypeState = { isConsumer: true, isPro: false, isEvent: false };
let mockMessageFilter: 'all' | 'broadcasts' | 'pinned' | 'channels' = 'all';
const mockTripChatModeState = {
  effectiveChatMode: 'all',
  canPost: true,
  canUploadMedia: true,
  isLoading: false,
  userRole: 'moderator',
};

vi.mock('react-router-dom', () => ({
  useParams: () => ({ tripId: 'trip-123' }),
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

let mockTripChatError: Error | null = null;
const defaultMockMessages = [
  {
    id: 'msg-1',
    text: 'hello',
    user: { id: 'user-1', name: 'User One' },
    created_at: '2026-01-01T00:00:00.000Z',
    reactions: { fromMessage: { count: 1, userReacted: true, users: ['user-1'] } },
    readStatuses: [{ user_id: 'user-2', read_at: '2026-01-01T00:01:00.000Z' }],
    pinned: true,
    pinned_at: '2026-01-01T00:02:00.000Z',
    messageType: 'broadcast',
  },
];
let mockMessages: typeof defaultMockMessages = defaultMockMessages;

vi.mock('../../hooks/useTripChat', () => ({
  useTripChat: () => ({
    messages: mockMessages,
    isLoading: false,
    error: mockTripChatError,
    sendMessageAsync: vi.fn(),
    isCreating: false,
    loadMore: vi.fn(),
    hasMore: false,
    isLoadingMore: false,
    toggleReaction: vi.fn(),
    reload: vi.fn(),
    activeChannel: { state: { read: {} } },
  }),
}));
vi.mock('../../hooks/usePayments', () => ({
  usePayments: () => ({
    paymentMethods: [],
    settlementSuggestions: 'bad-shape',
  }),
}));

vi.mock('../../hooks/useChatComposer', () => ({
  useChatComposer: () => ({
    inputMessage: '',
    setInputMessage: vi.fn(),
    messageFilter: mockMessageFilter,
    setMessageFilter: vi.fn(),
    replyingTo: null,
    setReply: mockSetReply,
    clearReply: vi.fn(),
    sendMessage: vi.fn(),
    filterMessages: (messages: unknown[]) => messages,
  }),
}));

vi.mock('../../adapters/streamMessageViewModel', async importOriginal => {
  const actual = await importOriginal<typeof import('../../adapters/streamMessageViewModel')>();
  return {
    ...actual,
    buildStreamMessageViewModels: ({ messages }: { messages: any[] }) =>
      messages.map(message => ({
        id: message.id,
        text: message.text,
        sender: { id: message.user.id, name: message.user.name },
        createdAt: message.created_at,
        isPinned: message.pinned,
        pinnedAt: message.pinned_at,
        isBroadcast: message.messageType === 'broadcast',
        reactions: message.reactions,
        readStatuses: message.readStatuses,
      })),
  };
});

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
vi.mock('../../hooks/useChatReadReceipts', () => ({ useChatReadReceipts: () => ({}) }));
vi.mock('../../hooks/useChatTypingIndicators', () => ({
  useChatTypingIndicators: () => ({ typingUsers: [], handleTypingChange: vi.fn() }),
}));
vi.mock('../../hooks/useChatReactions', () => ({
  useChatReactions: () => ({
    reactions: { 'msg-1': { fromHook: { count: 7, userReacted: false, users: [] } } },
    handleReaction: vi.fn(),
  }),
}));
vi.mock('@/hooks/useSystemMessagePreferences', () => ({
  useEffectiveSystemMessagePreferences: () => ({ data: null }),
}));
vi.mock('@/hooks/useTripType', () => ({ useTripType: () => mockTripTypeState }));
vi.mock('@/hooks/useTripPrivacyConfig', () => ({
  useTripPrivacyConfig: () => ({ data: null }),
  getEffectivePrivacyMode: () => 'all',
}));
vi.mock('@/hooks/useTripChatMode', () => ({
  useTripChatMode: () => mockTripChatModeState,
}));
vi.mock('../../hooks/useLinkPreviews', () => ({ useLinkPreviews: () => ({}) }));
vi.mock('@/hooks/useUserSafety', () => ({
  useBlockedUsers: () => ({ blockedUserIds: [], blockUser: vi.fn(), isBlocking: false }),
  useReportContent: () => ({ reportContent: vi.fn(), isReporting: false }),
}));

vi.mock('../ChatInput', () => ({ ChatInput: () => <div data-testid="chat-input" /> }));
vi.mock('../InlineReplyComponent', () => ({ InlineReplyComponent: () => null }));
vi.mock('../TypingIndicator', () => ({ TypingIndicator: () => null }));
vi.mock('../MessageTypeBar', () => ({
  MessageTypeBar: (props: any) => {
    mockMessageTypeBar(props);
    return null;
  },
}));
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
  getStreamClient: () => null,
  getStreamApiKey: () => 'test-stream-api-key',
  onStreamClientConnected: vi.fn(() => () => {}),
}));

vi.mock('../VirtualizedMessageContainer', () => ({
  VirtualizedMessageContainer: (props: any) => {
    mockVirtualizedMessageContainer(props);
    return (
      <div data-testid="virtualized-message-container">
        {props.messages.map((m: any, i: number) => (
          <React.Fragment key={m.id}>{props.renderMessage(m, i, true)}</React.Fragment>
        ))}
      </div>
    );
  },
}));

vi.mock('../MessageItem', () => ({
  MessageItem: (props: any) => {
    mockMessageItem(props);
    return <div data-testid={`message-item-${props.message.id}`} />;
  },
}));

describe('TripChat render path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTripChatError = null;
    mockMessageFilter = 'all';
    mockMessages = defaultMockMessages;
  });

  const renderSubject = (props?: React.ComponentProps<typeof TripChat>) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TripChat tripId="trip-123" {...props} />
      </QueryClientProvider>,
    );
  };

  it('renders one virtualized list and one canonical message callback path', async () => {
    renderSubject();

    expect(screen.getByTestId('virtualized-message-container')).toBeInTheDocument();
    expect(screen.getAllByTestId('virtualized-message-container')).toHaveLength(1);
    expect(
      mockVirtualizedMessageContainer.mock.calls.every(
        call => typeof call[0].renderMessage === 'function',
      ),
    ).toBe(true);

    const messageItemProps = mockMessageItem.mock.calls[0][0];
    expect(typeof messageItemProps.onReply).toBe('function');
    expect(typeof messageItemProps.onOpenThread).toBe('function');
    expect(messageItemProps.reactions).toEqual({
      fromMessage: { count: 1, userReacted: true, users: ['user-1'] },
    });
    expect(messageItemProps.readStatuses).toEqual([
      { user_id: 'user-2', read_at: '2026-01-01T00:01:00.000Z' },
    ]);

    act(() => {
      messageItemProps.onReply('msg-1');
    });
    expect(mockSetReply).toHaveBeenCalledWith('msg-1', 'hello', 'User One');

    act(() => {
      messageItemProps.onOpenThread('msg-1');
    });
    // ThreadView removed; onOpenThread now scrolls inline — just assert no crash.
    await waitFor(() => {
      expect(screen.getByTestId('virtualized-message-container')).toBeInTheDocument();
    });
  });

  it.each([
    {
      surface: 'trip',
      tripType: { isConsumer: true, isPro: false, isEvent: false },
      props: {},
    },
    {
      surface: 'pro',
      tripType: { isConsumer: false, isPro: true, isEvent: false },
      props: { isPro: true },
    },
    {
      surface: 'event',
      tripType: { isConsumer: false, isPro: false, isEvent: true },
      props: { isEvent: true },
    },
  ])(
    'keeps pin capability + pinned hydration parity for $surface without changing broadcast defaults',
    ({ tripType, props }) => {
      Object.assign(mockTripTypeState, tripType);
      renderSubject(props);

      const messageItemProps = mockMessageItem.mock.calls[0][0];
      expect(messageItemProps.canManagePins).toBe(true);
      expect(messageItemProps.message.isPinned).toBe(true);
      expect(messageItemProps.message.pinnedAt).toBe('2026-01-01T00:02:00.000Z');
      expect(messageItemProps.message.isBroadcast).toBe(true);
      const messageTypeBarProps = mockMessageTypeBar.mock.calls[0][0];
      expect(messageTypeBarProps.activeFilter).toBe('all');
      expect(messageTypeBarProps.broadcastBadgeCount).toBe(0);
    },
  );

  it.each(['all', 'broadcasts'] as const)('does not render pinned banner in %s view', filter => {
    mockMessageFilter = filter;
    renderSubject();

    expect(screen.queryByText('Pinned Messages')).not.toBeInTheDocument();
  });

  it('keeps rendering messages when settlement-like secondary data is non-array', () => {
    renderSubject();

    expect(screen.getByTestId('message-item-msg-1')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong in Chat')).not.toBeInTheDocument();
  });

  it('keeps chat mounted across provider re-render with cached messages', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <TripChat tripId="trip-123" />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('message-item-msg-1')).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={queryClient}>
        <TripChat tripId="trip-123" isPro={false} />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('message-item-msg-1')).toBeInTheDocument();
  });

  it('logs technical chat error details but only renders a generic user-facing message when no history is loaded', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockTripChatError = new Error('upstream stacktrace details');
    mockMessages = [];

    renderSubject();

    expect(screen.getByText('Something went wrong in Chat')).toBeInTheDocument();
    expect(screen.queryByText('upstream stacktrace details')).not.toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalledWith('[TripChat] Chat load failure', {
      tripId: 'trip-123',
      message: 'upstream stacktrace details',
    });

    mockTripChatError = null;
    consoleErrorSpy.mockRestore();
  });

  it('keeps loaded history visible behind a retry banner instead of blanking it on error', () => {
    // Regression: a transient chat error used to replace the ENTIRE timeline with a
    // full-screen "Something went wrong" card, hiding already-loaded messages/broadcasts
    // that were fine. History must stay visible; only a slim retry banner appears.
    mockTripChatError = new Error('reconnect blip');

    renderSubject();

    expect(screen.getByTestId('message-item-msg-1')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong in Chat')).not.toBeInTheDocument();
    expect(
      screen.getByText('Reconnecting to chat — showing your recent messages.'),
    ).toBeInTheDocument();

    mockTripChatError = null;
  });
});
