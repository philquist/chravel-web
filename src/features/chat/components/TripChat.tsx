/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { toast } from 'sonner';
import { useParams, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Channel } from 'stream-chat';
import { demoModeService } from '@/services/demoModeService';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useChatComposer } from '../hooks/useChatComposer';
import { useBroadcastHistory, usePinnedHistory } from '../hooks/useBroadcastHistory';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { ChatInput } from './ChatInput';
import { InlineReplyComponent } from './InlineReplyComponent';
import { VirtualizedMessageContainer } from './VirtualizedMessageContainer';
import { MessageItem } from './MessageItem';
import { MessageSkeleton } from '@/components/mobile/SkeletonLoader';
import { getMockAvatar } from '@/utils/mockAvatars';
import { useTripMembers } from '@/hooks/useTripMembers';
import { useTripChat } from '../hooks/useTripChat';
import { useAuth } from '@/hooks/useAuth';
import { hapticService } from '@/services/hapticService';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WifiOff, Pin } from 'lucide-react';
import { useRoleChannels } from '@/hooks/useRoleChannels';
import { ChannelChatView } from '@/components/pro/channels/ChannelChatView';
import { TypingIndicator } from './TypingIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '@/components/mobile/PullToRefreshIndicator';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { parseMessage } from '@/services/chatContentParser';
import { useChatReadReceipts } from '../hooks/useChatReadReceipts';
import { selectReadStatusesByMessage } from '../selectors/readStateSelectors';
import { useChatTypingIndicators } from '../hooks/useChatTypingIndicators';
import { useChatReactions } from '../hooks/useChatReactions';
import { MessageTypeBar } from './MessageTypeBar';
import { ChatSearchOverlay } from './ChatSearchOverlay';
import { useEffectiveSystemMessagePreferences } from '@/hooks/useSystemMessagePreferences';
import { FeatureErrorBoundary } from '@/components/FeatureErrorBoundary';
import { useTripPrivacyConfig, getEffectivePrivacyMode } from '@/hooks/useTripPrivacyConfig';
import { useTripChatMode } from '@/hooks/useTripChatMode';
import { useLinkPreviews } from '../hooks/useLinkPreviews';
import { useLinkPreviewActivation } from '../hooks/useLinkPreviewActivation';
import { useBlockedUsers, useReportContent } from '@/hooks/useUserSafety';
import { getStreamApiKey, getStreamClient } from '@/services/stream/streamClient';
import { derivePinnedMessages } from '../utils/pinnedMessages';
import { extractQuotedReferenceFromStreamMessage } from '@/services/stream/streamMessagePayload';
import { messageEvents } from '@/telemetry/events';
import { shouldUseLegacyChatSync } from '@/services/stream/streamTransportGuards';
import { tripKeys } from '@/lib/queryKeys';
import { buildStreamMessageViewModels } from '../adapters/streamMessageViewModel';
import { executeModerationAction, ModerationAction } from '@/services/moderationService';
import {
  createThreadReplySuccessState,
  ThreadReplySuccessState,
} from '../utils/threadReplySuccess';

interface TripChatProps {
  enableGroupChat?: boolean;
  showBroadcasts?: boolean;
  isEvent?: boolean;
  tripId?: string;
  isPro?: boolean; // 🆕 Flag to enable role channels for enterprise trips
  userRole?: string; // 🆕 User's role for channel access
  participants?: Array<{ id: string; name: string; role?: string }>; // 🆕 Participants with roles for channel generation
}

interface MockMessage {
  id: string;
  text: string;
  sender: { id: string; name: string; avatar?: string };
  createdAt: string;
  isAiMessage?: boolean;
  isBroadcast?: boolean;

  reactions?: { [key: string]: string[] };
  replyTo?: { id: string; text: string; sender: string };
  trip_type?: string;
  sender_name?: string;
  message_content?: string;
  delay_seconds?: number;
  timestamp_offset_days?: number;
  tags?: string[];
}

type StreamCapabilityName = 'delete-own-message' | 'delete-any-message' | 'update-own-message';

const normalizeCapabilityName = (capability: string): string =>
  capability.toLowerCase().replace(/[^a-z0-9]/g, '');

const STREAM_CAPABILITY_ALIASES: Record<StreamCapabilityName, string[]> = {
  'delete-own-message': ['delete-own-message', 'DeleteOwnMessage'],
  'delete-any-message': ['delete-any-message', 'DeleteAnyMessage'],
  'update-own-message': ['update-own-message', 'UpdateOwnMessage'],
};

const NON_CRITICAL_CHAT_NOTE = 'Some chat enhancements are temporarily unavailable.';

const logNonCriticalChatError = (context: string, error: unknown) => {
  if (import.meta.env.DEV) {
    console.warn(`[TripChat] Non-critical ${context} failed`, error);
  }
};

const hasStreamCapability = (
  ownCapabilities: string[],
  capability: StreamCapabilityName,
): boolean => {
  const normalizedCapabilities = new Set(ownCapabilities.map(normalizeCapabilityName));
  return STREAM_CAPABILITY_ALIASES[capability].some(alias =>
    normalizedCapabilities.has(normalizeCapabilityName(alias)),
  );
};

export const TripChat = React.memo(
  ({
    enableGroupChat: _enableGroupChat = true,
    showBroadcasts: _showBroadcasts = true,
    isEvent = false,
    tripId: tripIdProp,
    isPro = false,
    userRole = 'member',
    participants = [],
  }: TripChatProps) => {
    const [demoMessages, setDemoMessages] = useState<MockMessage[]>([]);

    const [_activeChannelId, _setActiveChannelId] = useState<string | null>(null);

    const [showSearchOverlay, setShowSearchOverlay] = useState(false);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messageScrollRef = useRef<HTMLDivElement>(null);
    const [failedMessages, setFailedMessages] = useState<
      Array<{
        id: string;
        text: string;
        authorName: string;
        messageType?: 'text' | 'broadcast' | 'payment' | 'system';
        createdAtMs: number;
      }>
    >([]);
    const [threadReplySuccess, setThreadReplySuccess] = useState<ThreadReplySuccessState | null>(
      null,
    );

    const { isOffline } = useOfflineStatus();
    const params = useParams<{ tripId?: string; proTripId?: string; eventId?: string }>();
    const location = useLocation();
    const resolvedTripId = useMemo(() => {
      return tripIdProp || params.tripId || params.proTripId || params.eventId || '';
    }, [tripIdProp, params.tripId, params.proTripId, params.eventId]);

    // Extract navigation context from notification click (if present)
    const chatNavigationContext = (
      location.state as {
        chatNavigationContext?: {
          source?: string;
          notificationId?: string;
          messageId?: string;
          channelId?: string;
          channelType?: string;
          openThreadId?: string;
        };
      } | null
    )?.chatNavigationContext;
    const targetMessageId = chatNavigationContext?.openThreadId || chatNavigationContext?.messageId;

    const demoMode = useDemoMode();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { blockedUserIds, blockUser: blockUserAction, isBlocking } = useBlockedUsers();
    const { reportContent: reportContentAction, isReporting } = useReportContent();

    // ⚡ PERFORMANCE: Skip expensive hooks in demo mode for numeric trip IDs
    const shouldSkipLiveChat = demoMode.isDemoMode && /^\d+$/.test(resolvedTripId);

    // Fetch privacy config for the trip
    const { data: privacyConfig } = useTripPrivacyConfig(
      shouldSkipLiveChat ? undefined : resolvedTripId,
    );

    // Live chat hooks - only initialize for authenticated trips
    const { tripMembers } = useTripMembers(shouldSkipLiveChat ? undefined : resolvedTripId);
    const {
      messages: liveMessages,
      isLoading: liveLoading,
      error: chatError,
      sendMessageAsync: sendTripMessage,
      isCreating: isSendingMessage,
      loadMore: loadMoreMessages,
      hasMore,
      isLoadingMore,
      toggleReaction,
      togglePin,
      reload,
      activeChannel: streamActiveChannel,
    } = useTripChat(shouldSkipLiveChat ? undefined : resolvedTripId);

    useEffect(() => {
      if (!chatError) return;
      console.error('[TripChat] Chat load failure', {
        tripId: resolvedTripId,
        message: chatError.message,
      });
    }, [chatError, resolvedTripId]);

    const { isRefreshing, pullDistance } = usePullToRefresh({
      scrollContainerRef: messageScrollRef,
      onRefresh: async () => {
        if (resolvedTripId) {
          if (reload) {
            await reload();
          }
          // Invalidate chat query cache to force fresh fetch
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: tripKeys.chat(resolvedTripId) }),
            queryClient.invalidateQueries({ queryKey: tripKeys.chatMessages(resolvedTripId) }),
            queryClient.invalidateQueries({ queryKey: tripKeys.chatThreads(resolvedTripId) }),
            ...(user?.id
              ? [
                  queryClient.invalidateQueries({
                    queryKey: tripKeys.chatUnreadCount(resolvedTripId, user.id),
                  }),
                ]
              : []),
          ]);
        }
      },
    });

    // Chat mode enforcement — UI layer (server-side RLS is authoritative)
    const {
      effectiveChatMode,
      canPost: canPostToChat,
      canUploadMedia,
      isLoading: chatModeLoading,
      userRole: chatModeUserRole,
    } = useTripChatMode(demoMode.isDemoMode ? undefined : resolvedTripId, user?.id, isEvent);

    const isUserAdmin =
      chatModeUserRole === 'admin' ||
      chatModeUserRole === 'organizer' ||
      chatModeUserRole === 'owner';
    const canManagePins =
      isUserAdmin || chatModeUserRole === 'moderator' || chatModeUserRole === 'mod';
    // Broadcast composing follows the trip-type permission model: consumer trips
    // are open to all members; pro/event trips gate announcements to
    // admins/organizers/owners. UI-layer gate — ChatInput hides the toggle and
    // strips the flag at send time.
    const canSendBroadcast = (!isPro && !isEvent) || isUserAdmin;

    // Role channels for pro trips
    const {
      availableChannels,
      activeChannel: roleActiveChannel,
      setActiveChannel: setRoleActiveChannel,
    } = useRoleChannels(isPro ? resolvedTripId : undefined, user?.id || '');

    // Typing indicators + read receipts — must be after all deps are declared
    const { typingUsers, handleTypingChange } = useChatTypingIndicators(
      demoMode.isDemoMode,
      resolvedTripId,
      user,
      effectiveChatMode,
      tripMembers.length,
      streamActiveChannel,
      shouldUseLegacyChatSync() ? 'legacy' : 'stream',
    );

    useChatReadReceipts(
      demoMode.isDemoMode,
      user?.id,
      resolvedTripId,
      liveMessages,
      streamActiveChannel,
    );

    const streamClient = getStreamClient();
    const streamOwnCapabilities = useMemo(() => {
      const channel = streamActiveChannel as
        | {
            data?: { own_capabilities?: string[] };
            state?: { own_capabilities?: string[]; ownCapabilities?: string[] };
          }
        | undefined;
      const resolvedCapabilities =
        channel?.data?.own_capabilities ??
        channel?.state?.own_capabilities ??
        channel?.state?.ownCapabilities ??
        [];
      return Array.isArray(resolvedCapabilities) ? resolvedCapabilities : [];
    }, [streamActiveChannel]);

    const canDeleteOwnMessage = useMemo(
      () => hasStreamCapability(streamOwnCapabilities, 'delete-own-message'),
      [streamOwnCapabilities],
    );
    const canDeleteAnyMessage = useMemo(
      () => hasStreamCapability(streamOwnCapabilities, 'delete-any-message'),
      [streamOwnCapabilities],
    );
    const canUpdateOwnMessage = useMemo(
      () => hasStreamCapability(streamOwnCapabilities, 'update-own-message'),
      [streamOwnCapabilities],
    );

    // Extract Stream-canonical error fields for triage (always logged, even in prod).
    const extractStreamError = (
      error: unknown,
    ): { code?: number | string; status?: number; message: string; data?: unknown } => {
      const err = error as {
        code?: number | string;
        StatusCode?: number;
        status?: number;
        message?: string;
        response?: { data?: { code?: number | string; message?: string } };
      };
      return {
        code: err?.code ?? err?.response?.data?.code,
        status: err?.StatusCode ?? err?.status,
        message: err?.message ?? err?.response?.data?.message ?? 'Unknown Stream error',
        data: err?.response?.data,
      };
    };

    // Find the message-author id so we can pre-check ownership before calling Stream.
    const findMessageAuthorId = useCallback(
      (messageId: string): string | undefined => {
        const msg = liveMessages.find(m => String(m.id) === String(messageId));
        if (!msg) return undefined;
        const candidate = msg as unknown as {
          user?: { id?: string };
          user_id?: string;
          userId?: string;
          sender?: { id?: string };
          author_id?: string;
        };
        return (
          candidate.user?.id ??
          candidate.user_id ??
          candidate.userId ??
          candidate.sender?.id ??
          candidate.author_id
        );
      },
      [liveMessages],
    );

    const handleMessageEdit = useCallback(
      async (messageId: string, newContent: string) => {
        if (demoMode.isDemoMode) return;

        if (!streamClient) {
          throw new Error('Chat connection unavailable. Please try again.');
        }

        // Defensive owner check — Stream rejects owner-scoped ops as 403 if mismatch.
        const authorId = findMessageAuthorId(messageId);
        if (authorId && streamClient.userID && authorId !== streamClient.userID) {
          throw new Error('You can only edit your own messages');
        }

        try {
          await streamClient.updateMessage({
            id: messageId,
            text: newContent,
          });
        } catch (error) {
          const details = extractStreamError(error);
          console.error('[TripChat] Stream updateMessage failed:', {
            code: details.code,
            status: details.status,
            message: details.message,
            data: details.data,
            messageId,
          });
          const codeSuffix = details.code !== undefined ? ` (code ${details.code})` : '';
          throw new Error(`Failed to edit message${codeSuffix}`);
        }
      },
      [demoMode.isDemoMode, streamClient, findMessageAuthorId],
    );

    const handleMessageDelete = useCallback(
      async (messageId: string) => {
        if (demoMode.isDemoMode) return;

        if (!streamClient) {
          throw new Error('Chat connection unavailable. Please try again.');
        }

        const authorId = findMessageAuthorId(messageId);
        const isOwnMessage = !!(
          authorId &&
          streamClient.userID &&
          authorId === streamClient.userID
        );

        if (authorId && streamClient.userID && !isOwnMessage && !canDeleteAnyMessage) {
          throw new Error('You can only delete your own messages');
        }

        if (isOwnMessage && !canDeleteOwnMessage && !canDeleteAnyMessage) {
          throw new Error('You don’t have permission to delete this message');
        }

        try {
          await streamClient.deleteMessage(messageId);
        } catch (error) {
          const details = extractStreamError(error);
          console.error('[TripChat] Stream deleteMessage failed:', {
            code: details.code,
            status: details.status,
            message: details.message,
            data: details.data,
            messageId,
          });
          if (details.status === 403 || details.code === 403) {
            throw new Error('You don’t have permission to delete this message');
          }
          const codeSuffix = details.code !== undefined ? ` (code ${details.code})` : '';
          throw new Error(`Failed to delete message${codeSuffix}`);
        }
      },
      [
        canDeleteAnyMessage,
        canDeleteOwnMessage,
        demoMode.isDemoMode,
        streamClient,
        findMessageAuthorId,
      ],
    );

    const handleMessagePinToggle = useCallback(
      async (messageId: string, shouldPin: boolean) => {
        if (demoMode.isDemoMode) return;

        try {
          await togglePin(messageId, shouldPin);
        } catch (error) {
          const details = extractStreamError(error);
          console.error('[TripChat] Stream pin toggle failed:', {
            code: details.code,
            status: details.status,
            message: details.message,
            data: details.data,
            messageId,
            shouldPin,
          });
          const codeSuffix = details.code !== undefined ? ` (code ${details.code})` : '';
          throw new Error(`Failed to ${shouldPin ? 'pin' : 'unpin'} message${codeSuffix}`);
        }
      },
      [demoMode.isDemoMode, togglePin],
    );

    // System message preferences apply to all trip types that use Stream trip chat.
    const { data: systemMessagePrefs } = useEffectiveSystemMessagePreferences(resolvedTripId);

    const {
      inputMessage,
      setInputMessage,
      messageFilter,
      setMessageFilter,
      replyingTo,
      setReply,
      clearReply,
      sendMessage,
      filterMessages,
    } = useChatComposer({ tripId: resolvedTripId, demoMode: demoMode.isDemoMode, isEvent });

    // Extract unique roles from participants for channel generation

    const reactionUserNamesById = useMemo(() => {
      try {
        return Object.fromEntries(tripMembers.map(member => [member.id, member.name]));
      } catch (error) {
        logNonCriticalChatError('reactions metadata mapping', error);
        return {};
      }
    }, [tripMembers]);

    const participantRoles = useMemo(() => {
      if (!isPro) return [];
      return [...new Set(participants.map(p => p.role).filter(Boolean))];
    }, [isPro, participants]);

    // Mobile-specific hooks
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const _containerRef = useRef<HTMLDivElement>(null);

    // Scroll latest messages into view when the iOS keyboard opens (page shell owns viewport vars).
    useEffect(() => {
      const handleViewportResize = () => {
        if (!document.body.classList.contains('keyboard-visible')) return;
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 300);
      };

      window.visualViewport?.addEventListener('resize', handleViewportResize);
      return () => window.visualViewport?.removeEventListener('resize', handleViewportResize);
    }, []);

    // Swipe gestures for mobile navigation
    const swipeRef = useRef<HTMLDivElement>(null);
    useSwipeGesture(swipeRef, {
      onSwipeLeft: () => {
        // Handle swipe left gesture
        hapticService.light();
      },
      onSwipeRight: () => {
        // Handle swipe right gesture
        hapticService.light();
      },
      threshold: 50,
    });

    // Track unread counts with real-time updates
    const { totalBroadcastCount, messageUnreadCount } = useUnreadCounts({
      tripId: resolvedTripId,
      messages: liveMessages,
      userId: user?.id || null,
      enabled: !demoMode.isDemoMode && !!user?.id,
      activeChannel: streamActiveChannel,
    });

    // Note: typing indicators are now fully handled by useChatTypingIndicators hook above

    const liveFormattedMessages = useMemo(() => {
      if (demoMode.isDemoMode) return [];
      return buildStreamMessageViewModels({
        messages: liveMessages,
        tripMembers,
        currentUserId: user?.id,
        channelReadState: streamActiveChannel?.state?.read as unknown as Record<
          string,
          { last_read?: string | Date }
        >,
      });
    }, [
      liveMessages,
      demoMode.isDemoMode,
      tripMembers,
      streamActiveChannel?.state?.read,
      user?.id,
    ]);

    const handleSendMessage = async (
      isBroadcast = false,
      isPayment = false,
      paymentData?: any,
      _linkPreview?: any,
      mentionedUserIds?: string[],
    ) => {
      const repliedParentMessageId = replyingTo?.id ?? null;

      // Transform paymentData if needed to match useChatComposer expectations
      let transformedPaymentData;
      if (isPayment && paymentData) {
        transformedPaymentData = {
          amount: paymentData.amount,
          currency: paymentData.currency,
          description: paymentData.description,
          splitCount: paymentData.splitCount,
          splitParticipants: paymentData.splitParticipants || [],
          paymentMethods: paymentData.paymentMethods || [],
        };
      }

      // Pass replyingTo ID if replying
      const message = await sendMessage({
        isBroadcast,
        isPayment,
        paymentData: transformedPaymentData,
      });

      if (!message) {
        return;
      }

      // Message send: light haptic (native-only, hard-gated).
      void hapticService.light();

      if (demoMode.isDemoMode) {
        setDemoMessages(prev => [...prev, message as MockMessage]);
        setThreadReplySuccess(createThreadReplySuccessState(repliedParentMessageId));
        return;
      }

      const authorName = user?.displayName || user?.email?.split('@')[0] || 'You';
      const messageType = isBroadcast ? 'broadcast' : isPayment ? 'payment' : 'text';
      try {
        // Use actual privacy mode from trip config
        const effectivePrivacyMode = getEffectivePrivacyMode(privacyConfig);

        await sendTripMessage(
          message.text,
          authorName,
          undefined,
          undefined,
          user?.id,
          effectivePrivacyMode,
          messageType as 'text' | 'broadcast' | 'payment' | 'system',
          replyingTo?.id,
          replyingTo
            ? {
                id: replyingTo.id,
                text: replyingTo.text,
                authorName: replyingTo.senderName,
              }
            : undefined,
          mentionedUserIds,
        );

        // Auto-parse message for entities (dates, times, locations)
        if (message.text && message.text.trim().length > 10) {
          parseMessage(message.text, resolvedTripId).catch(parseError => {
            if (import.meta.env.DEV) {
              console.warn('[TripChat] Background message parsing failed:', parseError);
            }
          });
        }

        setThreadReplySuccess(createThreadReplySuccessState(repliedParentMessageId));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to send message';

        // Restore the draft so the user doesn't lose their message
        setInputMessage(message.text);

        setFailedMessages(prev => [
          ...prev,
          {
            id: `failed-${Date.now()}`,
            text: message.text,
            authorName,
            messageType: messageType as 'text' | 'broadcast' | 'payment' | 'system',
            createdAtMs: Date.now(),
          },
        ]);
        toast.error(isBroadcast ? 'Broadcast failed to send' : 'Message failed to send', {
          description: errorMsg,
        });
        if (import.meta.env.DEV) {
          console.error('[TripChat] Failed to send message:', error);
        }
      }
    };

    const handleRetryFailedMessage = useCallback(
      async (failedId: string) => {
        const failed = failedMessages.find(m => m.id === failedId);
        if (!failed || !user?.id) return;

        const authorName = user.displayName || user.email?.split('@')[0] || 'You';
        const effectivePrivacyMode = getEffectivePrivacyMode(privacyConfig);

        try {
          await sendTripMessage(
            failed.text,
            authorName,
            undefined,
            undefined,
            user.id,
            effectivePrivacyMode,
            failed.messageType || 'text',
          );
          setFailedMessages(prev => prev.filter(m => m.id !== failedId));
        } catch {
          // Keep in failed list; toast from useTripChat
        }
      },
      [failedMessages, user, privacyConfig, sendTripMessage],
    );

    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    };

    const { handleReaction } = useChatReactions(
      demoMode.isDemoMode,
      user?.id,
      liveMessages,
      toggleReaction,
    );

    const handleOpenThread = (messageId: string) => {
      const message =
        liveFormattedMessages.find(m => m.id === messageId) ||
        demoMessages.find(m => m.id === messageId);
      if (!message) return;

      // For inline reply:
      const content = (message as any).text || (message as any).content || '';
      const authorName =
        (message as any).sender?.name ||
        (message as any).user?.name ||
        (message as any).author_name ||
        'User';

      setReply(messageId, content, authorName);
    };

    // Inline replies: "open thread" now scrolls to the parent message in the
    // main timeline (replies render nested under it). No modal/drawer.
    const handleActivateThread = useCallback(
      (
        messageId: string,
        source:
          | 'reply_badge'
          | 'search_result'
          | 'notification'
          | 'notification_deeplink' = 'reply_badge',
      ) => {
        const telemetrySource = source === 'notification_deeplink' ? 'notification' : source;

        if (!demoMode.isDemoMode && liveMessages.find(m => m.id === messageId)) {
          messageEvents.threadOpened({
            trip_id: resolvedTripId,
            parent_message_id: messageId,
            source: telemetrySource,
          });
        }

        // Defer to next tick so any filter changes (e.g. switching to "all") have applied.
        window.setTimeout(() => {
          const el = document.querySelector(`[data-message-id="${messageId}"]`);
          if (el instanceof HTMLElement) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('search-highlight-flash');
            window.setTimeout(() => el.classList.remove('search-highlight-flash'), 1000);
          }
        }, 50);
      },
      [demoMode.isDemoMode, liveMessages, resolvedTripId],
    );

    // After a successful thread reply send, scroll the parent (and its now-nested
    // reply) into view. The reply itself appears inline via realtime/local state.
    useEffect(() => {
      const parentId = threadReplySuccess?.parentMessageId;
      if (!parentId) return;
      handleActivateThread(parentId, 'reply_badge');
      setThreadReplySuccess(null);
    }, [threadReplySuccess, handleActivateThread]);

    useEffect(() => {
      if (!user?.id || failedMessages.length === 0 || liveMessages.length === 0) return;

      const matchingLiveMessages = liveMessages
        .map(msg => {
          const streamUser = (msg as any).user;
          return {
            text: ((msg as any).text || '').trim(),
            userId: streamUser?.id || (msg as any).user_id,
            createdAtMs: new Date((msg as any).created_at || 0).getTime(),
          };
        })
        .filter(msg => msg.userId === user.id && msg.text.length > 0);

      if (matchingLiveMessages.length === 0) return;

      setFailedMessages(prev =>
        prev.filter(failed => {
          const failedText = failed.text.trim();
          return !matchingLiveMessages.some(
            live =>
              live.text === failedText && Math.abs(live.createdAtMs - failed.createdAtMs) <= 5000,
          );
        }),
      );
    }, [failedMessages.length, liveMessages, user?.id]);

    // ⚡ PERFORMANCE: Synchronous demo message loading (no unnecessary async wrapper)
    useEffect(() => {
      if (!demoMode.isDemoMode) {
        setDemoMessages([]);
        return;
      }

      // Detect if this is a Pro or Event trip
      const isProTripContext = isPro || params.proTripId;
      const isEventContext = isEvent || params.eventId;

      let demoMessagesData;

      if (isProTripContext) {
        demoMessagesData = demoModeService.getProMockMessages('pro', user?.id || 'demo-user');
      } else if (isEventContext) {
        demoMessagesData = demoModeService.getProMockMessages('event', user?.id || 'demo-user');
      } else {
        demoMessagesData = demoModeService.getMockMessages(
          'friends-trip',
          true,
          user?.id || 'demo-user',
        );
      }

      const formattedMessages = demoMessagesData.map(msg => ({
        id: msg.id,
        text: msg.message_content || '',
        sender: {
          id: msg.sender_id || msg.sender_name || msg.id,
          name: msg.sender_name || 'Unknown',
          avatar: getMockAvatar(msg.sender_name || 'Unknown'),
        },
        createdAt: new Date(Date.now() - (msg.timestamp_offset_days || 0) * 86400000).toISOString(),
        isBroadcast:
          msg.tags?.includes('broadcast') ||
          msg.tags?.includes('logistics') ||
          msg.tags?.includes('urgent') ||
          false,
        trip_type: msg.trip_type,
        sender_name: msg.sender_name,
        message_content: msg.message_content,
        delay_seconds: msg.delay_seconds,
        timestamp_offset_days: msg.timestamp_offset_days,
        tags: msg.tags,
      }));

      setDemoMessages(formattedMessages);
    }, [demoMode.isDemoMode, isPro, isEvent, params.proTripId, params.eventId, user?.id]);

    // Auto-select first channel when switching to 'channels' filter
    useEffect(() => {
      if (messageFilter === 'channels' && availableChannels.length > 0 && !roleActiveChannel) {
        // Sort alphabetically and select first
        const sortedChannels = [...availableChannels].sort((a, b) =>
          a.channelName.localeCompare(b.channelName),
        );
        setRoleActiveChannel(sortedChannels[0]);
      }
    }, [messageFilter, availableChannels, roleActiveChannel, setRoleActiveChannel]);

    // Determine which messages to show - authenticated trips show ONLY live messages
    const messagesToShow = demoMode.isDemoMode ? demoMessages : liveFormattedMessages;

    const filteredMessages = filterMessages(messagesToShow as any);

    // Broadcasts tab: the live timeline is a bounded window, so broadcasts older
    // than it are missing from filteredMessages. Fetch the channel's broadcast
    // history from Stream while the tab is active and merge in anything the
    // window doesn't already have (live entries win — they carry fresh
    // reactions/pins). Empty history (fetch failed / none) changes nothing.
    const broadcastHistory = useBroadcastHistory(
      resolvedTripId,
      messageFilter === 'broadcasts' && !demoMode.isDemoMode && !shouldSkipLiveChat,
    );
    const broadcastHistoryModels = useMemo(() => {
      if (broadcastHistory.length === 0) return [];
      return buildStreamMessageViewModels({
        messages: broadcastHistory,
        tripMembers,
        currentUserId: user?.id,
      });
    }, [broadcastHistory, tripMembers, user?.id]);
    // Pinned tab: same off-window gap — fetch pins via Stream's native
    // pinned-messages endpoint while the tab is active.
    const pinnedHistory = usePinnedHistory(
      resolvedTripId,
      messageFilter === 'pinned' && !demoMode.isDemoMode && !shouldSkipLiveChat,
    );
    const pinnedHistoryModels = useMemo(() => {
      if (pinnedHistory.length === 0) return [];
      return buildStreamMessageViewModels({
        messages: pinnedHistory,
        tripMembers,
        currentUserId: user?.id,
      });
    }, [pinnedHistory, tripMembers, user?.id]);

    const filteredWithBroadcastHistory = useMemo(() => {
      // Pinned merge: derivePinnedMessages dedupes by id with LATER entries
      // winning and drops ids a later snapshot marks unpinned — so listing
      // history first means fresh live state (reactions, just-unpinned)
      // always overrides the fetched snapshot.
      if (messageFilter === 'pinned' && pinnedHistoryModels.length > 0) {
        return derivePinnedMessages([...pinnedHistoryModels, ...filteredMessages] as any);
      }
      if (messageFilter !== 'broadcasts' || broadcastHistoryModels.length === 0) {
        return filteredMessages;
      }
      const liveIds = new Set(filteredMessages.map((m: any) => m.id));
      const older = broadcastHistoryModels.filter(m => !liveIds.has(m.id));
      if (older.length === 0) return filteredMessages;
      return [...older, ...filteredMessages].sort(
        (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }, [messageFilter, broadcastHistoryModels, pinnedHistoryModels, filteredMessages]);

    const visibleMessages = useMemo(() => {
      if (blockedUserIds.length === 0) return filteredWithBroadcastHistory;
      return filteredWithBroadcastHistory.filter(
        (msg: any) => !msg.sender?.id || !blockedUserIds.includes(msg.sender.id),
      );
    }, [filteredWithBroadcastHistory, blockedUserIds]);

    const messagesWithFailed = useMemo(() => {
      if (failedMessages.length === 0) return visibleMessages;
      const failedFormatted = failedMessages.map(fm => ({
        id: fm.id,
        text: fm.text,
        sender: { id: user?.id || 'unknown', name: fm.authorName, avatar: user?.avatar },
        createdAt: new Date().toISOString(),
        status: 'failed' as const,
        linkPreview: undefined as undefined,
      }));
      return [...visibleMessages, ...failedFormatted];
    }, [visibleMessages, failedMessages, user?.id, user?.avatar]);

    const linkPreviewEnabled = useLinkPreviewActivation(!showSearchOverlay && !shouldSkipLiveChat);

    const linkPreviewFallbacks = useLinkPreviews(
      messagesWithFailed.map(message => ({
        id: message.id,
        text: message.text || '',
        linkPreview: (message as any).linkPreview,
      })),
      { enabled: linkPreviewEnabled },
    );

    const messagesWithPreviewFallbacks = useMemo(
      () =>
        messagesWithFailed.map(message => ({
          ...message,
          linkPreview: (message as any).linkPreview || linkPreviewFallbacks[message.id],
        })),
      [messagesWithFailed, linkPreviewFallbacks],
    );

    // iMessage-style nested replies: group child replies under their parent.
    // A message is a "reply" if it carries a replyTo.id pointing to another loaded message.
    // Top-level list = messages without a replyTo OR whose parent isn't in the loaded window
    // (orphans surface at top-level so users still see them).
    const messagesWithThreads = useMemo(() => {
      const loadedIds = new Set(messagesWithPreviewFallbacks.map((m: any) => m.id));
      const repliesByParent = new Map<string, any[]>();

      for (const msg of messagesWithPreviewFallbacks as any[]) {
        const parentId: string | undefined = msg?.replyTo?.id;
        if (parentId && loadedIds.has(parentId)) {
          const list = repliesByParent.get(parentId) ?? [];
          list.push(msg);
          repliesByParent.set(parentId, list);
        }
      }

      return (messagesWithPreviewFallbacks as any[])
        .filter(msg => {
          const parentId: string | undefined = msg?.replyTo?.id;
          return !parentId || !loadedIds.has(parentId);
        })
        .map(msg => {
          const replies = repliesByParent.get(msg.id);
          if (!replies || replies.length === 0) return msg;
          // Sort replies oldest → newest by createdAt for natural reading order.
          const sorted = [...replies].sort((a, b) => {
            const at = new Date(a.createdAt || 0).getTime();
            const bt = new Date(b.createdAt || 0).getTime();
            return at - bt;
          });
          return { ...msg, replies: sorted };
        });
    }, [messagesWithPreviewFallbacks]);

    const pinnedMessages = useMemo(
      // History first so live snapshots win (and live unpins delete stale
      // history entries — derivePinnedMessages handles both).
      () => derivePinnedMessages([...pinnedHistoryModels, ...liveFormattedMessages] as any),
      [pinnedHistoryModels, liveFormattedMessages],
    );
    const readStatusesByMessage = useMemo(() => {
      try {
        return selectReadStatusesByMessage({
          messages: liveMessages as any[],
          currentUserId: user?.id,
          activeChannel: streamActiveChannel as Channel | null,
        });
      } catch (error) {
        logNonCriticalChatError('read receipts projection', error);
        return {};
      }
    }, [liveMessages, streamActiveChannel, user?.id]);

    const isLoading = demoMode.isDemoMode ? false : liveLoading;

    // Scroll to a specific message after the correct tab/filter is visible.
    const scrollToMessage = useCallback(
      (
        target:
          | string
          | {
              id: string;
              type: 'message' | 'broadcast';
              openThread?: boolean;
            },
      ) => {
        const {
          id: targetId,
          type,
          openThread = false,
        } = typeof target === 'string'
          ? { id: target, type: 'message' as const, openThread: false }
          : target;

        setShowSearchOverlay(false);

        if (type === 'broadcast' && messageFilter !== 'broadcasts') {
          setMessageFilter('broadcasts');
        } else if (type === 'message' && messageFilter !== 'all') {
          setMessageFilter('all');
        }

        window.setTimeout(() => {
          const targetElement = document.querySelector(`[data-message-id="${targetId}"]`);
          if (!(targetElement instanceof HTMLElement)) return;

          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetElement.classList.add('search-highlight-flash');
          window.setTimeout(() => targetElement.classList.remove('search-highlight-flash'), 1000);

          if (openThread) {
            handleActivateThread(targetId, 'notification_deeplink');
          }
        }, 100);
      },
      [handleActivateThread, messageFilter],
    );

    // Scroll to target message from notification click (when messages finish loading)
    const scrollAttemptedRef = useRef(false);
    useEffect(() => {
      if (!targetMessageId || isLoading || scrollAttemptedRef.current) return;
      scrollAttemptedRef.current = true;

      // Give messages time to render, then scroll
      const timer = setTimeout(() => {
        scrollToMessage({
          id: targetMessageId,
          type: 'message',
          openThread: Boolean(chatNavigationContext?.openThreadId),
        });
      }, 300);

      return () => clearTimeout(timer);
    }, [targetMessageId, isLoading, chatNavigationContext?.openThreadId]);

    // Global keyboard shortcut for search (Ctrl+F or Cmd+F)
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f' && messageFilter !== 'channels') {
          e.preventDefault();
          setShowSearchOverlay(true);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [messageFilter]);

    const renderMessage = useCallback(
      (message: any, _index: number, showSenderInfo: boolean) => (
        <div data-message-id={message.id}>
          <MessageItem
            message={message}
            replies={(message as any).replies}
            reactions={message.reactions || {}}
            onReaction={handleReaction}
            onReply={handleOpenThread}
            onOpenThread={handleActivateThread}
            onEdit={demoMode.isDemoMode ? undefined : handleMessageEdit}
            onDelete={demoMode.isDemoMode ? undefined : handleMessageDelete}
            transportMode="stream"
            onRetry={handleRetryFailedMessage}
            systemMessagePrefs={systemMessagePrefs}
            tripMembers={tripMembers}
            readStatuses={message.readStatuses || readStatusesByMessage[message.id] || []}
            showSenderInfo={showSenderInfo}
            reactionUserNamesById={reactionUserNamesById}
            isAdmin={isUserAdmin}
            canDeleteOwnMessage={canDeleteOwnMessage}
            canDeleteAnyMessage={canDeleteAnyMessage}
            canUpdateOwnMessage={canUpdateOwnMessage}
            canManagePins={canManagePins}
            onTogglePin={demoMode.isDemoMode ? undefined : handleMessagePinToggle}
            onBlockUser={demoMode.isDemoMode ? undefined : blockUserAction}
            onReportContent={
              demoMode.isDemoMode
                ? undefined
                : params =>
                    reportContentAction({
                      ...params,
                      tripId: resolvedTripId,
                    })
            }
            isBlockingUser={isBlocking}
            isReportingContent={isReporting}
          />
        </div>
      ),
      [
        handleReaction,
        handleOpenThread,
        handleActivateThread,
        demoMode.isDemoMode,
        handleMessageEdit,
        handleMessageDelete,
        handleRetryFailedMessage,
        systemMessagePrefs,
        tripMembers,
        readStatusesByMessage,
        reactionUserNamesById,
        isUserAdmin,
        canDeleteOwnMessage,
        canDeleteAnyMessage,
        canUpdateOwnMessage,
        canManagePins,
        handleMessagePinToggle,
        blockUserAction,
        reportContentAction,
        resolvedTripId,
        isBlocking,
        isReporting,
      ],
    );

    return (
      <div className="relative flex flex-col h-full min-h-0 overflow-hidden">
        <PullToRefreshIndicator
          isRefreshing={isRefreshing}
          pullDistance={pullDistance}
          threshold={80}
        />

        {/* Search Overlay Modal */}
        {showSearchOverlay && (
          <ChatSearchOverlay
            tripId={resolvedTripId}
            onClose={() => setShowSearchOverlay(false)}
            onResultSelect={scrollToMessage}
            isDemoMode={demoMode.isDemoMode}
            demoMessages={demoMessages}
          />
        )}

        {/* Offline Mode Banner */}
        {isOffline && (
          <Alert className="mx-4 mt-2 mb-0 border-warning/50 bg-warning/10">
            <WifiOff className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Offline Mode – viewing cached messages
            </AlertDescription>
          </Alert>
        )}

        {/* Chat Container - Messages with Integrated Filter Tabs */}
        <div className="flex-1 flex flex-col min-h-0" data-chat-container>
          <div
            ref={messagesContainerRef}
            className="rounded-2xl border border-border/60 bg-card/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden flex-1 flex flex-col relative min-h-0"
          >
            {/* Filter Tabs */}
            <MessageTypeBar
              activeFilter={messageFilter}
              onFilterChange={setMessageFilter}
              hasChannels={availableChannels.length > 0 || participantRoles.length > 0}
              onSearchClick={() => setShowSearchOverlay(true)}
              isPro={isPro}
              broadcastBadgeCount={totalBroadcastCount}
              unreadCount={messageUnreadCount}
              pinnedCount={pinnedMessages.length}
              availableChannels={availableChannels as any}
              activeChannel={roleActiveChannel}
              onChannelSelect={(channel: any) => {
                setRoleActiveChannel(channel);
                setMessageFilter('channels');
              }}
            />

            {/* Conditional Content Area */}
            {messageFilter === 'channels' && roleActiveChannel ? (
              <ChannelChatView
                channel={roleActiveChannel as any}
                availableChannels={availableChannels as any}
                onChannelChange={setRoleActiveChannel as any}
              />
            ) : (
              <>
                {/* Only replace the whole timeline with an error/initializing card when
                    there is NO loaded history to show. If history is already on screen,
                    a transient error must NOT blank it — surface a slim retry banner
                    above the preserved messages instead (see the banner below). */}
                {chatError && !isLoading && messagesToShow.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center space-y-3">
                      {getStreamApiKey() || chatError.message.includes('Timed out') ? (
                        <>
                          <p className="text-sm text-muted-foreground">
                            Something went wrong in Chat
                          </p>
                          <p className="text-xs text-muted-foreground">{NON_CRITICAL_CHAT_NOTE}</p>
                          <button
                            onClick={() => {
                              reload?.();
                            }}
                            className="text-sm text-primary underline hover:no-underline"
                          >
                            Retry
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">Chat is initializing…</p>
                          <p className="text-xs text-muted-foreground">
                            Hang tight — connecting to the messaging service.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                ) : isLoading && messagesToShow.length === 0 ? (
                  <div className="flex-1 overflow-y-auto p-4">
                    <MessageSkeleton />
                  </div>
                ) : (
                  <>
                    {/* Non-blocking retry banner: history stays visible under a transient
                        error / reconnect instead of being replaced by a full-screen card. */}
                    {chatError && messagesToShow.length > 0 && (
                      <div className="mx-3 mt-3 mb-1 flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                        <p className="text-xs text-amber-100">
                          Reconnecting to chat — showing your recent messages.
                        </p>
                        <button
                          onClick={() => {
                            reload?.();
                          }}
                          className="flex-shrink-0 text-xs font-medium text-amber-200 underline hover:no-underline"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    {messageFilter === 'pinned' && pinnedMessages.length > 0 && (
                      <div className="mx-3 mt-3 mb-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-200">
                          <Pin className="h-3.5 w-3.5" />
                          <span>Pinned Messages</span>
                        </div>
                        <div className="space-y-1.5">
                          {pinnedMessages.slice(0, 3).map(message => (
                            <button
                              key={message.id}
                              onClick={() => scrollToMessage(message.id)}
                              className="block w-full truncate rounded-md bg-black/15 px-2 py-1 text-left text-xs text-amber-100 hover:bg-black/25"
                            >
                              {message.sender.name}: {message.text || 'Attachment'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <FeatureErrorBoundary featureName="Chat Timeline Enhancements" fallback={null}>
                      <VirtualizedMessageContainer
                        messages={messagesWithThreads as any}
                        renderMessage={renderMessage}
                        onLoadMore={demoMode.isDemoMode ? () => {} : loadMoreMessages}
                        hasMore={demoMode.isDemoMode ? false : hasMore}
                        isLoading={isLoadingMore}
                        initialVisibleCount={10}
                        className="chat-scroll-container native-scroll px-3"
                        autoScroll={true}
                        restoreScroll={true}
                        scrollKey={`chat-scroll-${resolvedTripId}`}
                        scrollContainerRef={messageScrollRef}
                      />
                    </FeatureErrorBoundary>
                  </>
                )}

                {/* Typing Indicator */}
                {!demoMode.isDemoMode && typingUsers.length > 0 && (
                  <FeatureErrorBoundary featureName="Typing Indicator" fallback={null}>
                    <TypingIndicator typingUsers={typingUsers} />
                  </FeatureErrorBoundary>
                )}

                {/* Reply Bar */}
                {replyingTo && (
                  <div className="border-t border-border/60 bg-muted/60 px-4 py-2">
                    <InlineReplyComponent
                      replyTo={{
                        id: replyingTo.id,
                        text: replyingTo.text,
                        senderName: replyingTo.senderName,
                      }}
                      onCancel={clearReply}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Persistent Chat Input - Hidden when in Channels mode or user cannot post */}
        {messageFilter !== 'channels' && canPostToChat && (
          <div
            className="chat-composer-tray chat-input-persistent w-full flex-shrink-0 bg-background"
            style={{
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
              touchAction: 'manipulation',
            }}
          >
            <div className="w-full">
              <ChatInput
                inputMessage={inputMessage}
                onInputChange={setInputMessage}
                onSendMessage={handleSendMessage}
                onKeyPress={handleKeyPress}
                apiKey=""
                isTyping={isSendingMessage}
                tripMembers={tripMembers}
                hidePayments={true}
                isPro={isPro}
                tripId={resolvedTripId}
                disableFileUpload={!canUploadMedia}
                safeAreaBottom={false}
                onTypingChange={handleTypingChange}
                canSendBroadcast={canSendBroadcast}
              />
            </div>
          </div>
        )}

        {/* Chat mode restriction banner */}
        {messageFilter !== 'channels' && !canPostToChat && !chatModeLoading && (
          <div className="w-full border-t border-border/60 bg-card/70 px-4 py-3 text-center">
            <p className="text-sm text-muted-foreground">
              {effectiveChatMode === 'broadcasts'
                ? 'This chat is in announcements-only mode. Only admins can post.'
                : effectiveChatMode === 'admin_only'
                  ? 'This chat is in admin-only mode. Only admins can post.'
                  : 'You do not have permission to post in this chat.'}
            </p>
          </div>
        )}

        {/* Threads render inline beneath their parent — no modal/drawer. */}
      </div>
    );
  },
);
