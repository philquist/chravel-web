import type { MessageResponse } from 'stream-chat';
import { defaultAvatar } from '@/utils/mockAvatars';
import type { ReadStatus } from '../components/ReadReceipts';

export interface TripMemberSummary {
  id: string;
  name: string;
  avatar?: string;
}

interface StreamReadState {
  last_read?: string | Date;
}

interface StreamAttachment {
  type?: string;
  image_url?: string;
  asset_url?: string;
  og_scrape_url?: string;
  title_link?: string;
  title?: string;
  text?: string;
  thumb_url?: string;
}

interface StreamReaction {
  type?: string;
  user?: { id?: string };
}

export interface StreamMessageViewModel {
  id: string;
  text: string;
  sender: {
    id: string;
    name: string;
    avatar?: string;
    userId?: string;
  };
  createdAt: string;
  isBroadcast: boolean;
  isPayment: boolean;
  isPinned: boolean;
  pinnedAt?: string;
  isEdited: boolean;
  editedAt?: string;
  tags: string[];
  message_type?: string;
  system_event_type?: string;
  system_payload?: unknown;
  linkPreview?: {
    url?: string;
    title?: string;
    description?: string;
    image?: string;
  };
  replyTo?: { id: string; text: string; sender: string };
  replyCount?: number;
  threadPreviewSnippet?: string;
  hasUnreadThreadReplies?: boolean;
  mediaType?: string;
  mediaUrl?: string;
  reactions?: Record<string, { count: number; userReacted: boolean; users: string[] }>;
  readStatuses: ReadStatus[];
}

interface StreamThreadReplyPreview {
  text?: string;
  content?: string;
  created_at?: string;
}

interface StreamParentMessageFields {
  reply_count?: number;
  latest_replies?: StreamThreadReplyPreview[];
  thread_participants?: Array<{ id?: string }>;
  thread_participant_ids?: string[];
  thread_unread_count?: number;
  thread_has_unread?: boolean;
  unread_thread_replies?: boolean;
}

const getAuthorName = (message: MessageResponse): string | undefined => {
  const candidate = message as MessageResponse & { author_name?: string };
  return message.user?.name || candidate.author_name;
};

const getUserId = (message: MessageResponse): string | undefined => {
  const candidate = message as MessageResponse & { user_id?: string };
  return message.user?.id || candidate.user_id;
};

const toLinkPreview = (attachment?: StreamAttachment) => {
  if (!attachment) return undefined;
  return {
    url: attachment.og_scrape_url || attachment.title_link,
    title: attachment.title,
    description: attachment.text,
    image: attachment.image_url || attachment.thumb_url,
  };
};

const resolveMedia = (message: MessageResponse) => {
  const candidate = message as MessageResponse & {
    media_type?: string;
    media_url?: string;
    link_preview?: StreamMessageViewModel['linkPreview'];
  };

  let mediaType = candidate.media_type;
  let mediaUrl = candidate.media_url;
  let linkPreview = candidate.link_preview;

  const attachments = (message.attachments || []) as StreamAttachment[];
  if (attachments.length > 0) {
    const firstAttachment = attachments[0];
    if (firstAttachment.type === 'image') {
      mediaType = 'image';
      mediaUrl = firstAttachment.image_url || firstAttachment.asset_url;
    } else if (firstAttachment.type === 'video') {
      mediaType = 'video';
      mediaUrl = firstAttachment.asset_url;
    } else if (firstAttachment.type === 'file') {
      mediaType = 'file';
      mediaUrl = firstAttachment.asset_url;
    }

    if (!linkPreview) {
      const urlAttachment = attachments.find(a => a.og_scrape_url || a.title_link);
      linkPreview = toLinkPreview(urlAttachment);
    }
  }

  return { mediaType, mediaUrl, linkPreview };
};

const buildReactions = (message: MessageResponse) => {
  const reactionCounts = message.reaction_counts;
  if (!reactionCounts) return undefined;

  const ownReactions = (message.own_reactions || []) as StreamReaction[];
  const latestReactions = (message.latest_reactions || []) as StreamReaction[];
  const formatted: Record<string, { count: number; userReacted: boolean; users: string[] }> = {};

  Object.entries(reactionCounts).forEach(([type, count]) => {
    formatted[type] = {
      count,
      userReacted: ownReactions.some(r => r.type === type),
      users: latestReactions
        .filter(r => r.type === type)
        .flatMap(r => (r.user?.id ? [r.user.id] : [])),
    };
  });

  return Object.keys(formatted).length > 0 ? formatted : undefined;
};

const buildReadStatuses = (params: {
  messageId: string;
  messageCreatedAt: string;
  messageSenderId?: string;
  currentUserId?: string;
  readState?: Record<string, StreamReadState>;
  membersById: Map<string, TripMemberSummary>;
}): ReadStatus[] => {
  const { messageId, messageCreatedAt, messageSenderId, currentUserId, readState, membersById } =
    params;
  if (!readState) return [];

  const messageDate = new Date(messageCreatedAt);
  if (Number.isNaN(messageDate.getTime())) return [];

  const statuses: ReadStatus[] = [];
  Object.entries(readState).forEach(([readerId, state]) => {
    const readAt = state.last_read;
    if (!readAt || readerId === currentUserId || readerId === messageSenderId) return;
    if (!membersById.has(readerId)) return;

    const readDate = new Date(readAt);
    if (Number.isNaN(readDate.getTime()) || readDate < messageDate) return;
    const readAtIso = readAt instanceof Date ? readAt.toISOString() : readAt;

    statuses.push({
      id: `${messageId}:${readerId}`,
      message_id: messageId,
      user_id: readerId,
      read_at: readAtIso,
      created_at: readAtIso,
    });
  });

  return statuses;
};

export function buildStreamMessageViewModels(params: {
  messages: MessageResponse[];
  tripMembers: TripMemberSummary[];
  currentUserId?: string;
  channelReadState?: Record<string, StreamReadState>;
}): StreamMessageViewModel[] {
  const { messages, tripMembers, currentUserId, channelReadState } = params;
  const membersById = new Map(tripMembers.map(member => [member.id, member]));
  const messageById = new Map(messages.map(message => [message.id, message]));

  return messages
    .filter(message => {
      const parentId =
        message.parent_id || (message as MessageResponse & { reply_to_id?: string }).reply_to_id;
      return !parentId;
    })
    .map(message =>
      mapStreamMessageToViewModel({
        message,
        membersById,
        messageById,
        currentUserId,
        channelReadState,
      }),
    );
}

export function mapStreamMessageToViewModel(params: {
  message: MessageResponse;
  membersById: Map<string, TripMemberSummary>;
  messageById: Map<string, MessageResponse>;
  currentUserId?: string;
  channelReadState?: Record<string, StreamReadState>;
}): StreamMessageViewModel {
  const { message, membersById, messageById, currentUserId, channelReadState } = params;
  const messageUserId = getUserId(message);
  const authorName = getAuthorName(message);
  const createdAt = message.created_at || new Date().toISOString();
  const updatedAt = message.updated_at || createdAt;
  const messageType = (message as MessageResponse & { message_type?: string }).message_type;
  const pinnedAt = (message as MessageResponse & { pinned_at?: string }).pinned_at;
  const pinnedFlag = (message as MessageResponse & { pinned?: boolean }).pinned;
  const isPinned = typeof pinnedFlag === 'boolean' ? pinnedFlag : Boolean(pinnedAt);
  const parentId =
    message.parent_id || (message as MessageResponse & { reply_to_id?: string }).reply_to_id;
  const { mediaType, mediaUrl, linkPreview } = resolveMedia(message);
  const member = messageUserId ? membersById.get(messageUserId) : undefined;
  const parentMessage = parentId ? messageById.get(parentId) : undefined;
  const threadParent = message as MessageResponse & StreamParentMessageFields;
  const replyCount = threadParent.reply_count ?? 0;
  const latestReply = threadParent.latest_replies?.[threadParent.latest_replies.length - 1];
  const threadPreviewSnippet = latestReply?.text || latestReply?.content;
  const isThreadParticipant =
    (threadParent.thread_participant_ids || []).includes(currentUserId || '') ||
    (threadParent.thread_participants || []).some(p => p.id === currentUserId);
  const hasUnreadByCount = (threadParent.thread_unread_count || 0) > 0;
  const latestReplyCreatedAt = latestReply?.created_at;
  const currentUserLastReadAt = currentUserId
    ? channelReadState?.[currentUserId]?.last_read
    : undefined;
  const hasUnreadByReadMarker =
    Boolean(latestReplyCreatedAt && currentUserLastReadAt) &&
    new Date(latestReplyCreatedAt as string).getTime() >
      new Date(currentUserLastReadAt as string).getTime();
  const hasUnreadThreadReplies =
    threadParent.thread_has_unread ||
    threadParent.unread_thread_replies ||
    (isThreadParticipant && hasUnreadByCount) ||
    hasUnreadByReadMarker ||
    false;

  return {
    id: message.id,
    text: message.text || (message as MessageResponse & { content?: string }).content || '',
    sender: {
      id: messageUserId || authorName || 'system',
      name: member?.name || authorName || 'System',
      avatar: member?.avatar || defaultAvatar,
      userId: messageUserId,
    },
    createdAt,
    isBroadcast: messageType === 'broadcast',
    isPayment: messageType === 'payment',
    isPinned,
    pinnedAt: isPinned ? pinnedAt : undefined,
    isEdited: createdAt !== updatedAt,
    editedAt: createdAt !== updatedAt ? updatedAt : undefined,
    tags: messageType === 'system' ? ['system'] : [],
    message_type: messageType,
    system_event_type: (message as MessageResponse & { system_event_type?: string })
      .system_event_type,
    system_payload: (message as MessageResponse & { system_payload?: unknown }).system_payload,
    linkPreview,
    replyTo: parentMessage
      ? {
          id: parentMessage.id,
          text:
            parentMessage.text ||
            (parentMessage as MessageResponse & { content?: string }).content ||
            '',
          sender: getAuthorName(parentMessage) || 'System',
        }
      : undefined,
    replyCount,
    threadPreviewSnippet,
    hasUnreadThreadReplies,
    mediaType,
    mediaUrl,
    reactions: buildReactions(message),
    readStatuses: buildReadStatuses({
      messageId: message.id,
      messageCreatedAt: createdAt,
      messageSenderId: messageUserId,
      currentUserId,
      readState: channelReadState,
      membersById,
    }),
  };
}
