import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ChannelChatView } from '../ChannelChatView';

const toastMock = vi.fn();
let lastReactionsProp: Record<string, { userReacted?: boolean }> | undefined;

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', displayName: 'Tester' } }),
}));

vi.mock('@/hooks/useRolePermissions', () => ({
  useRolePermissions: () => ({ canPerformAction: () => true }),
}));

vi.mock('@/hooks/useRoleAssignments', () => ({
  useRoleAssignments: () => ({ leaveRole: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('@/features/chat/hooks/useLinkPreviews', () => ({
  useLinkPreviews: () => ({}),
}));

vi.mock('@/features/chat/hooks/useChatReadReceipts', () => ({
  useChatReadReceipts: vi.fn(),
}));

// Parametrizable Stream transport mock — tests mutate streamProChannelMock.
const streamProChannelMock: {
  messages: Array<Record<string, unknown>>;
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  activeChannel: Record<string, unknown> | null;
} = {
  messages: [],
  isLoading: false,
  hasMore: false,
  isLoadingMore: false,
  loadMore: vi.fn(),
  sendMessage: vi.fn(),
  activeChannel: null,
};

vi.mock('@/hooks/stream/useStreamProChannel', () => ({
  useStreamProChannel: () => streamProChannelMock,
}));

vi.mock('@/services/stream/streamClient', () => ({
  getStreamClient: () => ({ userID: 'u1' }),
}));

vi.mock('@/services/chatService', () => ({
  deleteChatMessage: vi.fn(),
  editChatMessage: vi.fn(),
  deleteChannelMessage: vi.fn(),
  editChannelMessage: vi.fn(),
}));

vi.mock('@/features/chat/components/VirtualizedMessageContainer', () => ({
  VirtualizedMessageContainer: ({ messages, renderMessage }: any) => (
    <div data-testid="virtualized">
      {messages.map((message: any) => (
        <React.Fragment key={message.id}>{renderMessage(message, 0, true)}</React.Fragment>
      ))}
    </div>
  ),
}));

vi.mock('@/features/chat/components/MessageItem', () => ({
  MessageItem: ({ message, onReaction, reactions }: any) => {
    lastReactionsProp = reactions;
    return (
      <>
        <div>{message.content ?? message.text}</div>
        <button
          data-testid={`react-${message.id}`}
          onClick={() => onReaction?.(message.id, 'like')}
        >
          react
        </button>
      </>
    );
  },
}));

vi.mock('@/features/chat/components/ChatInput', () => ({
  ChatInput: ({ onInputChange, onSendMessage }: any) => (
    <div>
      <button data-testid="type" onClick={() => onInputChange('hello world')}>
        type
      </button>
      <button data-testid="send" onClick={() => onSendMessage(false)}>
        send
      </button>
    </div>
  ),
}));

vi.mock('@/features/chat/components/InlineReplyComponent', () => ({
  InlineReplyComponent: () => null,
}));

const makeChannel = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    id: 'c1',
    tripId: 'real-trip-id',
    channelName: 'Coaches',
    channelSlug: 'coaches',
    requiredRoleId: 'role-1',
    requiredRoleName: 'Coaches',
    isPrivate: true,
    isArchived: false,
    createdBy: 'user-9',
    memberCount: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }) as any;

describe('ChannelChatView hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastReactionsProp = undefined;
    streamProChannelMock.messages = [
      {
        id: 'm1',
        text: 'hello',
        user: { id: 'u2', name: 'Alex' },
        created_at: new Date().toISOString(),
      },
    ];
    streamProChannelMock.isLoading = false;
    streamProChannelMock.sendMessage = vi.fn().mockResolvedValue(true);
    streamProChannelMock.activeChannel = null;
  });

  describe('leave-role menu (C7)', () => {
    // Radix DropdownMenu content doesn't open via fireEvent.click in jsdom;
    // the C7 behavior under test is the menu's PRESENCE gating on
    // requiredRoleId (multi-role channels previously failed at click time).
    it('offers the options menu for single-role channels', () => {
      render(<ChannelChatView channel={makeChannel()} />);
      expect(screen.getByLabelText('Channel options')).toBeInTheDocument();
    });

    it('hides the options menu entirely for multi-role channels (no requiredRoleId)', () => {
      render(<ChannelChatView channel={makeChannel({ requiredRoleId: null })} />);
      expect(screen.queryByLabelText('Channel options')).not.toBeInTheDocument();
    });
  });

  describe('reaction rollback (C6)', () => {
    it('rolls back the optimistic reaction and toasts when the Stream write fails', async () => {
      streamProChannelMock.activeChannel = {
        state: { messages: [{ id: 'm1', own_reactions: [] }] },
        sendReaction: vi.fn().mockRejectedValue(new Error('network')),
        deleteReaction: vi.fn(),
      };

      render(<ChannelChatView channel={makeChannel()} />);
      fireEvent.click(screen.getByTestId('react-m1'));

      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Reaction failed', variant: 'destructive' }),
        );
      });
      // Overlay reverted after the rollback re-render: no phantom
      // userReacted=true left behind
      await waitFor(() => {
        expect(lastReactionsProp?.like?.userReacted ?? false).toBe(false);
      });
    });
  });

  describe('inline send retry (U10)', () => {
    it('shows a retry banner on send failure and clears it after a successful retry', async () => {
      streamProChannelMock.sendMessage = vi.fn().mockResolvedValueOnce(false);

      render(<ChannelChatView channel={makeChannel()} />);
      fireEvent.click(screen.getByTestId('type'));
      fireEvent.click(screen.getByTestId('send'));

      await waitFor(() => {
        expect(screen.getByText(/Message failed to send/i)).toBeInTheDocument();
      });

      streamProChannelMock.sendMessage.mockResolvedValueOnce(true);
      fireEvent.click(screen.getByText('Retry'));

      await waitFor(() => {
        expect(screen.queryByText(/Message failed to send/i)).not.toBeInTheDocument();
      });
      expect(streamProChannelMock.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('dismiss hides the banner without resending', async () => {
      streamProChannelMock.sendMessage = vi.fn().mockResolvedValue(false);

      render(<ChannelChatView channel={makeChannel()} />);
      fireEvent.click(screen.getByTestId('type'));
      fireEvent.click(screen.getByTestId('send'));

      await waitFor(() => {
        expect(screen.getByText(/Message failed to send/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Dismiss send error'));
      expect(screen.queryByText(/Message failed to send/i)).not.toBeInTheDocument();
      expect(streamProChannelMock.sendMessage).toHaveBeenCalledTimes(1);
    });
  });
});
