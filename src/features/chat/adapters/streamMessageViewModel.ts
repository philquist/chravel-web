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
  url?: string;
  og_scrape_url?: string;
  title_link?: string;
  title?: string;
  text?: string;
  thumb_url?: string;
  mime_type?: string;
  duration_ms?: number;
  waveform?: number[];
  ref_id?: string;
}

export type StreamViewAttachment = {
  type: 'image' | 'video' | 'file' | 'link' | 'audio';
  ref_id: string;
  url?: string;
  mimeType?: string;
  durationMs?: number;
  waveform?: number[];
};

// .webm is intentionally omitted: it is ambiguous (audio or video). Classify webm via
// explicit type/mime only so video/webm never becomes VoiceNotePlayer.
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|ogg|oga|opus|aac|caf)(\?|$)/i;

function isAudioStreamAttachment(attachment: StreamAttachment): boolean {
  if (attachment.type === 'video') return false;
  if (attachment.mime_type?.startsWith('video/')) return false;
  if (attachment.type === 'audio') return true;
  if (attachment.mime_type?.startsWith('audio/')) return true;
  const url = attachment.asset_url || attachment.url || attachment.image_url;
  return !!url && AUDIO_EXT_RE.test(url);
}

function mapStreamAttachments(attachments: StreamAttachment[]): StreamViewAttachment[] {
  return attachments
    .map((attachment, index): StreamViewAttachment | null => {
      // Link/OG unfurl rows are represented via linkPreview, not mosaic/files.
      if (attachment.type === 'link') return null;
      if (
        (attachment.og_scrape_url || attachment.title_link) &&
        attachment.type !== 'image' &&
        attachment.type !== 'video' &&
        attachment.type !== 'file' &&
        attachment.type !== 'audio'
      ) {
        return null;
      }

      const url =
        attachment.type === 'image'
          ? attachment.image_url || attachment.asset_url || attachment.url
          : attachment.asset_url || attachment.url || attachment.image_url;
      if (!url) return null;

      let type: StreamViewAttachment['type'] = 'file';
      if (isAudioStreamAttachment(attachment)) {
        type = 'audio';
      } else if (attachment.type === 'image') {
        type = 'image';
      } else if (attachment.type === 'video') {
        type = 'video';
      } else if (attachment.type === 'file') {
        type = 'file';
      } else if (attachment.image_url && !attachment.asset_url) {
        type = 'image';
      }

      return {
        type,
        ref_id:
          (typeof attachment.ref_id === 'string' && attachment.ref_id) || `att-${index}`,
        url,
        mimeType: attachment.mime_type,
        durationMs: attachment.duration_ms,
        waveform: Array.isArray(attachment.waveform) ? attachment.waveform : undefined,
      };
    })
    .filter((value): value is StreamViewAttachment => Boolean(value));
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
  /** Full attachment list for mosaics / voice notes / files (Stream → UI). */
  attachments?: StreamViewAttachment[];
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
  const mappedAttachments = mapStreamAttachments(attachments);

  if (attachments.length > 0) {
    const firstAttachment = attachments[0];
    if (firstAttachment.type === 'image') {
      mediaType = 'image';
      mediaUrl = firstAttachment.image_url || firstAttachment.asset_url || firstAttachment.url;
    } else if (firstAttachment.type === 'video') {
      mediaType = 'video';
      mediaUrl = firstAttachment.asset_url || firstAttachment.url;
    } else if (isAudioStreamAttachment(firstAttachment)) {
      mediaType = 'audio';
      mediaUrl = firstAttachment.asset_url || firstAttachment.url;
    } else if (firstAttachment.type === 'file') {
      // Normalize Stream "file" → UI "document" so MessageBubble's download row renders
      // when attachments fail to map for any reason.
      mediaType = 'document';
      mediaUrl = firstAttachment.asset_url || firstAttachment.url;
    }

    if (!linkPreview) {
      const urlAttachment = attachments.find(a => a.og_scrape_url || a.title_link);
      linkPreview = toLinkPreview(urlAttachment);
    }
  }

  // Prefer first mapped media attachment when custom media_* fields are absent.
  if (!mediaUrl && mappedAttachments.length > 0) {
    const firstMedia = mappedAttachments[0];
    mediaUrl = firstMedia.url;
    mediaType =
      firstMedia.type === 'file'
        ? 'document'
        : firstMedia.type === 'audio'
          ? 'audio'
          : firstMedia.type;
  }

  return {
    mediaType,
    mediaUrl,
    linkPreview,
    attachments: mappedAttachments.length > 0 ? mappedAttachments : undefined,
  };
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
  const privacyMode = (message as MessageResponse & { privacy_mode?: string }).privacy_mode;
  const pinnedAt = (message as MessageResponse & { pinned_at?: string }).pinned_at;
  const pinnedFlag = (message as MessageResponse & { pinned?: boolean }).pinned;
  const isPinned = typeof pinnedFlag === 'boolean' ? pinnedFlag : Boolean(pinnedAt);
  const parentId =
    message.parent_id || (message as MessageResponse & { reply_to_id?: string }).reply_to_id;
  const { mediaType, mediaUrl, linkPreview, attachments } = resolveMedia(message);
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
    // Match the broadcast predicate used by the unread badge (useUnreadCounts)
    // and readStateSelectors: a message is a broadcast if EITHER marker is set.
    // Using message_type alone here made the Broadcasts tab render empty while
    // the badge still counted privacy_mode-tagged broadcasts.
    isBroadcast: messageType === 'broadcast' || privacyMode === 'broadcast',
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
    attachments,
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
