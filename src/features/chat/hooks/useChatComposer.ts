import { useState, useCallback } from 'react';
import { useChatMessageParser } from './useChatMessageParser';
import { getMockAvatar } from '@/utils/mockAvatars';
import { useAuth } from '@/hooks/useAuth';
import { usePayments } from '@/hooks/usePayments';
import { derivePinnedMessages } from '../utils/pinnedMessages';
import { getFilteredMessagesByChatView } from '../utils/messageClassification';

export interface ChatMessage {
  id: string;
  text: string;
  sender: { id: string; name: string; avatar?: string };
  createdAt: string;
  isAiMessage?: boolean;
  isBroadcast?: boolean;
  isPayment?: boolean;
  reactions?: { [key: string]: string[] };
  replyTo?: { id: string; text: string; sender: string; createdAt?: string };
  tags?: string[];
  // Rich media support
  mediaType?: 'image' | 'video' | 'document' | null;
  mediaUrl?: string | null;
  linkPreview?: {
    url: string;
    title?: string;
    description?: string;
    image?: string;
    domain?: string;
  } | null;
  attachments?: Array<{
    type: 'image' | 'video' | 'file' | 'link' | 'audio';
    ref_id: string;
    url?: string;
    mimeType?: string;
    durationMs?: number;
    waveform?: number[];
  }>;
}

export interface ReplyContext {
  id: string;
  text: string;
  senderName: string;
}

export interface PaymentData {
  amount: number;
  currency: string;
  description: string;
  splitCount: number;
  splitParticipants: string[];
  paymentMethods: string[];
}

export interface UseChatComposerOptions {
  tripId?: string;
  demoMode?: boolean;
  isEvent?: boolean;
}

export const useChatComposer = ({
  tripId,
  demoMode = false,
  isEvent = false,
}: UseChatComposerOptions = {}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<ReplyContext | null>(null);
  const [messageFilter, setMessageFilter] = useState<'all' | 'broadcasts' | 'pinned' | 'channels'>(
    'all',
  );

  const { user } = useAuth();
  const { parseMessage } = useChatMessageParser();
  const { paymentMethods } = usePayments(tripId);

  const createMessage = useCallback(
    (
      content: string,
      options: {
        isBroadcast?: boolean;
        isPayment?: boolean;
        paymentData?: PaymentData;
      } = {},
    ): ChatMessage => {
      const messageId = `msg_${Date.now()}`;
      const { isBroadcast = false, isPayment = false, paymentData } = options;
      // Do NOT silently assign stock/AI avatars in authenticated mode.
      // In demo mode we still use mock avatars for visual richness.
      const avatar = user?.avatar || (demoMode ? getMockAvatar('You') : undefined);

      if (isPayment && paymentData) {
        const perPersonAmount = (paymentData.amount / paymentData.splitCount).toFixed(2);
        const preferredMethod = paymentMethods?.find(m => m.isPreferred) || paymentMethods?.[0];
        const preferredPaymentMethod = preferredMethod
          ? `${preferredMethod.displayName || preferredMethod.type.charAt(0).toUpperCase() + preferredMethod.type.slice(1)}: ${preferredMethod.identifier}`
          : 'your preferred payment method';

        return {
          id: messageId,
          text: `${paymentData.description} - ${paymentData.currency} ${paymentData.amount.toFixed(2)} (split ${paymentData.splitCount} ways) • Pay me $${perPersonAmount} via ${preferredPaymentMethod}`,
          sender: { id: user?.id || 'demo-user', name: 'You', avatar },
          createdAt: new Date().toISOString(),
          isBroadcast: false,
          isPayment: true,
          reactions: {},
          tags: ['payment'],
          replyTo: replyingTo
            ? {
                id: replyingTo.id,
                text: replyingTo.text,
                sender: replyingTo.senderName,
              }
            : undefined,
        };
      }

      return {
        id: messageId,
        text: content,
        sender: { id: user?.id || 'demo-user', name: 'You', avatar },
        createdAt: new Date().toISOString(),
        isBroadcast,
        reactions: {},
        replyTo: replyingTo
          ? {
              id: replyingTo.id,
              text: replyingTo.text,
              sender: replyingTo.senderName,
            }
          : undefined,
      };
    },
    [replyingTo, user?.avatar, user?.id, demoMode, paymentMethods],
  );

  const sendMessage = useCallback(
    async (
      options: {
        isBroadcast?: boolean;
        isPayment?: boolean;
        paymentData?: PaymentData;
      } = {},
    ): Promise<ChatMessage | null> => {
      const { isPayment = false, paymentData: _paymentData } = options;

      // Prevent payment creation for events
      if (isEvent && isPayment) {
        console.warn('Payment messages are not allowed for events');
        return null;
      }

      if (!isPayment && inputMessage.trim() === '') return null;

      const message = createMessage(inputMessage, options);

      // Clear input and reply context immediately for optimistic UI
      const currentInput = inputMessage;
      setInputMessage('');
      setReplyingTo(null);

      // Parse message for media and links in the background (only if not in demo mode)
      if (!demoMode && tripId && !isPayment) {
        parseMessage(message.id, currentInput, tripId).catch(error => {
          if (import.meta.env.DEV) {
            console.error('[useChatComposer] Background message parsing failed:', error);
          }
        });
      }

      return message;
    },
    [inputMessage, createMessage, demoMode, tripId, parseMessage, isEvent],
  );

  const setReply = useCallback((messageId: string, messageText: string, senderName: string) => {
    setReplyingTo({ id: messageId, text: messageText, senderName });
  }, []);

  const clearReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const filterMessages = useCallback(
    (messages: ChatMessage[]) => {
      if (messageFilter === 'pinned') return derivePinnedMessages(messages);
      return getFilteredMessagesByChatView(messages, messageFilter);
    },
    [messageFilter],
  );

  return {
    // State
    inputMessage,
    replyingTo,
    messageFilter,

    // Actions
    setInputMessage,
    setMessageFilter,
    sendMessage,
    setReply,
    clearReply,
    filterMessages,
  };
};
