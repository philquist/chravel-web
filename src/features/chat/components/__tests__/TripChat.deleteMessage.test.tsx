import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TripChat } from '../TripChat';
import { toast } from 'sonner';
import { getStreamClient } from '@/services/stream/streamClient';
import { deleteChatMessage, editChatMessage } from '@/services/chatService';

const mockDeleteMessage = vi.fn();
const mockTogglePin = vi.fn();
const mockGetStreamClient = vi.mocked(getStreamClient);
const mockDeleteChatMessage = vi.mocked(deleteChatMessage);
const mockEditChatMessage = vi.mocked(editChatMessage);
let mockOwnCapabilities: string[] = ['delete-own-message', 'update-own-message'];
let mockChatModeUserRole: string = 'member';
let mockMessageAuthorId: string = 'user-1';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ tripId: 'trip-123' }),
  useLocation: () => ({ state: null }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock('@/services/stream/streamClient', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/stream/streamClient')>();
  return {
    ...actual,
    getStreamClient: vi.fn(),
    onStreamClientConnected: vi.fn(() => () => {}),
  };
});

vi.mock('@/services/chatService', () => ({
  deleteChatMessage: vi.fn(),
  editChatMessage: vi.fn(),
  deleteChannelMessage: vi.fn(),
  editChannelMessage: vi.fn(),
}));

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', displayName: 'User One', avatar: '' } }),
}));

vi.mock('@/hooks/useTripMembers', () => ({
  useTripMembers: () => ({ tripMembers: [{ id: 'user-1', name: 'User One', avatar: '' }] }),
}));

vi.mock('../../hooks/useTripChat', () => ({
  useTripChat: () => ({
    messages: [
      {
        id: 'msg-123',
        text: 'hello',
        user: { id: mockMessageAuthorId, name: 'User One' },
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    isLoading: false,
    sendMessageAsync: vi.fn(),
    isCreating: false,
    loadMore: vi.fn(),
    hasMore: false,
    isLoadingMore: false,
    toggleReaction: vi.fn(),
    togglePin: mockTogglePin,
    reload: vi.fn(),
    activeChannel: { state: { read: {}, own_capabilities: mockOwnCapabilities } },
  }),
}));

vi.mock('../../hooks/useChatComposer', () => ({
  useChatComposer: () => ({
    inputMessage: '',
    setInputMessage: vi.fn(),
    messageFilter: 'all',
    setMessageFilter: vi.fn(),
    replyingTo: null,
    setReply: vi.fn(),
    clearReply: vi.fn(),
    sendMessage: vi.fn(),
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
    userRole: mockChatModeUserRole,
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
vi.mock('../MessageTypeBar', () => ({ MessageTypeBar: () => null }));
vi.mock('../ChatSearchOverlay', () => ({ ChatSearchOverlay: () => null }));
vi.mock('../ThreadView', () => ({ ThreadView: () => null }));
vi.mock('@/components/mobile/PullToRefreshIndicator', () => ({
  PullToRefreshIndicator: () => null,
}));
vi.mock('@/components/mobile/SkeletonLoader', () => ({ MessageSkeleton: () => null }));
vi.mock('@/components/pro/channels/ChannelChatView', () => ({ ChannelChatView: () => null }));
vi.mock('@/components/ui/alert', () => ({
  Alert: ({ children }: any) => <div>{children}</div>,
  AlertDescription: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('@/services/demoModeService', () => ({ demoModeService: { getMessages: vi.fn() } }));
vi.mock('@/services/hapticService', () => ({ hapticService: { light: vi.fn() } }));
vi.mock('@/services/chatContentParser', () => ({ parseMessage: vi.fn() }));

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
  MessageItem: ({
    message,
    onDelete,
    onEdit,
    onTogglePin,
    canDeleteOwnMessage,
    canDeleteAnyMessage,
  }: any) => (
    <>
      {(canDeleteOwnMessage || canDeleteAnyMessage) && (
        <button onClick={() => onDelete?.(message.id)} data-testid={`delete-${message.id}`}>
          delete
        </button>
      )}
      <button onClick={() => onDelete?.(message.id)} data-testid={`force-delete-${message.id}`}>
        force-delete
      </button>
      <button onClick={() => onEdit?.(message.id, 'edited')} data-testid={`edit-${message.id}`}>
        edit
      </button>
      <button onClick={() => onTogglePin?.(message.id, true)} data-testid={`pin-${message.id}`}>
        pin
      </button>
    </>
  ),
}));

describe('TripChat delete message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTogglePin.mockResolvedValue(undefined);
    mockOwnCapabilities = ['delete-own-message', 'update-own-message'];
    mockChatModeUserRole = 'member';
    mockMessageAuthorId = 'user-1';
  });

  const renderSubject = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TripChat tripId="trip-123" />
      </QueryClientProvider>,
    );
  };

  it('calls Stream delete API once with message ID', async () => {
    mockGetStreamClient.mockReturnValue({ deleteMessage: mockDeleteMessage } as any);
    mockDeleteMessage.mockResolvedValue(undefined);

    renderSubject();
    fireEvent.click(screen.getByTestId('delete-msg-123'));

    expect(mockDeleteMessage).toHaveBeenCalledTimes(1);
    expect(mockDeleteMessage).toHaveBeenCalledWith('msg-123');
    expect(mockDeleteChatMessage).not.toHaveBeenCalled();
  });

  it('does not call Stream delete API and shows capability denial toast for owner without capability', async () => {
    mockOwnCapabilities = ['update-own-message'];
    mockGetStreamClient.mockReturnValue({
      deleteMessage: mockDeleteMessage,
      userID: 'user-1',
    } as any);

    renderSubject();

    expect(screen.queryByTestId('delete-msg-123')).not.toBeInTheDocument();

    // Defense-in-depth still blocks direct calls to onDelete when capability is denied.
    fireEvent.click(screen.getByTestId('force-delete-msg-123'));
    expect(mockDeleteMessage).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('You don’t have permission to delete this message');
  });

  it('hides Delete for admin role when Stream delete-any grant is missing', async () => {
    mockChatModeUserRole = 'admin';
    mockOwnCapabilities = ['update-own-message'];
    mockMessageAuthorId = 'user-2';
    mockGetStreamClient.mockReturnValue({
      deleteMessage: mockDeleteMessage,
      userID: 'user-1',
    } as any);

    renderSubject();

    expect(screen.queryByTestId('delete-msg-123')).not.toBeInTheDocument();
  });

  it('shows deterministic error toast when Stream client is unavailable', async () => {
    mockGetStreamClient.mockReturnValue(null);

    renderSubject();
    fireEvent.click(screen.getByTestId('delete-msg-123'));

    expect(mockDeleteMessage).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Chat connection unavailable. Please try again.');
    expect(mockDeleteChatMessage).not.toHaveBeenCalled();
  });

  it('calls Stream edit API and never falls back to chatService edit in stream mode', async () => {
    const mockUpdateMessage = vi.fn().mockResolvedValue(undefined);
    mockGetStreamClient.mockReturnValue({
      deleteMessage: mockDeleteMessage,
      updateMessage: mockUpdateMessage,
    } as any);

    renderSubject();
    fireEvent.click(screen.getByTestId('edit-msg-123'));

    expect(mockUpdateMessage).toHaveBeenCalledTimes(1);
    expect(mockUpdateMessage).toHaveBeenCalledWith({ id: 'msg-123', text: 'edited' });
    expect(mockEditChatMessage).not.toHaveBeenCalled();
  });

  it('routes pin toggle through hook helper and never calls Stream updateMessage directly', async () => {
    const mockUpdateMessage = vi.fn().mockResolvedValue(undefined);
    mockGetStreamClient.mockReturnValue({
      deleteMessage: mockDeleteMessage,
      updateMessage: mockUpdateMessage,
    } as any);

    renderSubject();
    fireEvent.click(screen.getByTestId('pin-msg-123'));

    expect(mockTogglePin).toHaveBeenCalledTimes(1);
    expect(mockTogglePin).toHaveBeenCalledWith('msg-123', true);
    expect(mockUpdateMessage).not.toHaveBeenCalled();
  });
});
