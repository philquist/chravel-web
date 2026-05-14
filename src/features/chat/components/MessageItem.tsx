import React, { memo, useCallback } from 'react';
import { ChatMessage } from '../hooks/useChatComposer';
import { ChatMessageWithGrounding } from '@/types/grounding';
import { MessageBubble } from './MessageBubble';
import { SystemMessageBubble } from './SystemMessageBubble';
import { useAuth } from '@/hooks/useAuth';
import { shouldShowSystemMessage, SystemMessageCategoryPrefs } from '@/utils/systemMessageCategory';
import { ReadStatus } from './ReadReceipts';
import { ModerationAction } from '@/services/moderationService';

interface MessageItemProps {
  message: ChatMessage & {
    status?: 'sending' | 'sent' | 'failed';
    replyCount?: number;
    threadPreviewSnippet?: string;
    hasUnreadThreadReplies?: boolean;
  };
  /** Inline nested replies (iMessage-style). Rendered indented under this message. */
  replies?: Array<MessageItemProps['message']>;
  /** Recursion depth — replies are flat (depth=1). Prevents infinite nesting. */
  depth?: number;
  reactions?: Record<string, { count: number; userReacted: boolean; users?: string[] }>;
  onReaction: (messageId: string, reactionType: string) => void;
  onReply?: (messageId: string) => void;
  onOpenThread?: (messageId: string) => void;
  showSenderInfo?: boolean;
  onRetry?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete?: (messageId: string) => void;
  transportMode?: 'legacy' | 'stream';
  // System message visibility preferences
  systemMessagePrefs?: {
    showSystemMessages: boolean;
    categories: SystemMessageCategoryPrefs;
  };
  tripMembers?: Array<{ id: string; name: string; avatar?: string }>;
  readStatuses?: ReadStatus[];
  reactionUserNamesById?: Record<string, string>;
  /** Pass-through for admin message deletion */
  isAdmin?: boolean;
  canDeleteOwnMessage?: boolean;
  canDeleteAnyMessage?: boolean;
  canUpdateOwnMessage?: boolean;
  canManagePins?: boolean;
  onTogglePin?: (messageId: string, shouldPin: boolean) => Promise<void> | void;
  onBlockUser?: (userId: string) => void;
  onReportContent?: (params: {
    reportedUserId: string;
    messageId: string;
    reason: any;
    details?: string;
  }) => void;
  isBlockingUser?: boolean;
  isReportingContent?: boolean;
  canModerate?: boolean;
  onModerationAction?: (params: {
    messageId: string;
    targetUserId: string;
    action: ModerationAction;
  }) => Promise<void> | void;
}

export const MessageItem = memo(
  ({
    message,
    replies,
    depth = 0,
    reactions,
    onReaction,
    onReply,
    onOpenThread,
    showSenderInfo,
    onRetry,
    onEdit,
    onDelete,
    transportMode = 'legacy',
    systemMessagePrefs,
    tripMembers,
    readStatuses,
    reactionUserNamesById,
    isAdmin = false,
    canDeleteOwnMessage = true,
    canDeleteAnyMessage = false,
    canUpdateOwnMessage = true,
    canManagePins = false,
    onTogglePin,
    onBlockUser,
    onReportContent,
    isBlockingUser = false,
    isReportingContent = false,
    canModerate = false,
    onModerationAction,
  }: MessageItemProps) => {
    const { user } = useAuth();
    const messageWithGrounding = message as unknown as ChatMessageWithGrounding;

    const handleEdit = useCallback(
      (messageId: string, newContent: string) => {
        onEdit?.(messageId, newContent);
      },
      [onEdit],
    );

    const handleDelete = useCallback(
      (messageId: string) => {
        onDelete?.(messageId);
      },
      [onDelete],
    );

    // Check for system messages
    const isSystemMessage =
      message.tags?.includes('system') === true || (message as any).message_type === 'system';

    // Filter system messages based on preferences
    if (isSystemMessage && systemMessagePrefs) {
      const eventType = (message as any).system_event_type;
      if (
        !shouldShowSystemMessage(
          systemMessagePrefs.showSystemMessages,
          systemMessagePrefs.categories,
          eventType,
        )
      ) {
        return null; // Hide this system message
      }
    }

    // Determine if message is from current user
    const senderUserId = (message.sender as any).userId || message.sender.id;
    const isOwnMessage = user?.id
      ? senderUserId === user.id ||
        message.sender.id === user.id ||
        message.sender.name === (user.displayName || user.email?.split('@')[0])
      : false;

    const messageWithMedia = message as any;

    if (isSystemMessage) {
      return <SystemMessageBubble body={message.text} timestamp={message.createdAt} />;
    }

    return (
      <div>
        <MessageBubble
          id={message.id}
          text={message.text}
          senderName={message.sender.name}
          senderAvatar={message.sender.avatar}
          timestamp={message.createdAt}
          isBroadcast={message.isBroadcast}
          isPayment={message.isPayment || message.tags?.includes('payment')}
          isOwnMessage={isOwnMessage}
          isEdited={(message as any).isEdited || false}
          reactions={reactions}
          onReaction={onReaction}
          replyCount={message.replyCount || 0}
          threadPreviewSnippet={message.threadPreviewSnippet}
          hasUnreadThreadReplies={message.hasUnreadThreadReplies}
          onReply={onReply}
          onOpenThread={onOpenThread}
          showSenderInfo={showSenderInfo}
          messageType="trip"
          transportMode={transportMode}
          onEdit={handleEdit}
          onDelete={handleDelete}
          grounding={
            messageWithGrounding.sources ||
            messageWithGrounding.googleMapsWidget ||
            messageWithGrounding.googleMapsWidgetContextToken
              ? {
                  sources: messageWithGrounding.sources,
                  googleMapsWidget: messageWithGrounding.googleMapsWidget,
                  googleMapsWidgetContextToken: messageWithGrounding.googleMapsWidgetContextToken,
                }
              : undefined
          }
          mediaType={messageWithMedia.mediaType}
          mediaUrl={messageWithMedia.mediaUrl}
          linkPreview={messageWithMedia.linkPreview}
          attachments={messageWithMedia.attachments}
          status={message.status}
          onRetry={onRetry}
          tripMembers={tripMembers}
          readStatuses={readStatuses}
          currentUserId={user?.id || ''}
          // Pass the resolved replyTo context if available
          replyTo={message.replyTo}
          reactionUserNamesById={reactionUserNamesById}
          isAdmin={isAdmin}
          canDeleteOwnMessage={canDeleteOwnMessage}
          canDeleteAnyMessage={canDeleteAnyMessage}
          canUpdateOwnMessage={canUpdateOwnMessage}
          canManagePins={canManagePins}
          isPinned={(message as { isPinned?: boolean }).isPinned ?? false}
          senderUserId={senderUserId}
          onBlockUser={onBlockUser}
          onTogglePin={onTogglePin}
          onReportContent={onReportContent}
          isBlockingUser={isBlockingUser}
          isReportingContent={isReportingContent}
          canModerate={canModerate}
          onModerationAction={onModerationAction}
        />
      </div>
    );
  },
);
