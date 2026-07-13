/**
 * Message Mapper
 *
 * Bidirectional transform between Chravel's TripChatMessage shape
 * (used by all UI components) and Stream's MessageResponse.
 *
 * This is the critical adapter that lets us keep the existing UI
 * while swapping the messaging backend.
 */

import type { MessageResponse, UserResponse } from 'stream-chat';

/**
 * Chravel's message shape (matches useTripChat return type).
 * This is what UI components expect.
 */
export interface ChrravelChatMessage {
  id: string;
  trip_id: string;
  content: string;
  author_name: string;
  user_id?: string;
  created_at: string;
  updated_at: string;
  media_type?: string;
  media_url?: string;
  sentiment?: string;
  link_preview?: unknown;
  privacy_mode?: string;
  privacy_encrypted?: boolean;
  message_type?: string;
  system_event_type?: string;
  system_payload?: Record<string, unknown>;
  is_edited?: boolean;
  edited_at?: string;
  client_message_id?: string;
  reply_to_id?: string;
  mentioned_user_ids?: string[];
  reactions?: Record<string, { count: number; userReacted: boolean; users: string[] }>;
  attachments?: Array<{
    type: string;
    ref_id: string;
    url?: string;
    mimeType?: string;
    durationMs?: number;
    waveform?: number[];
  }>;
}

/**
 * Convert a Stream MessageResponse to a Chravel TripChatMessage.
 */
export function streamMessageToChravel(msg: MessageResponse, tripId: string): ChrravelChatMessage {
  const user = msg.user as UserResponse | undefined;

  // Extract media from Stream attachments
  let mediaType: string | undefined;
  let mediaUrl: string | undefined;
  let linkPreview: unknown = null;
  const mappedAttachments: Array<{
    type: string;
    ref_id: string;
    url?: string;
    mimeType?: string;
    durationMs?: number;
    waveform?: number[];
  }> = [];

  if (msg.attachments && msg.attachments.length > 0) {
    for (let i = 0; i < msg.attachments.length; i++) {
      const attachment = msg.attachments[i] as Record<string, unknown>;
      if (attachment.type === 'link' || attachment.og_scrape_url || attachment.title_link) {
        continue;
      }
      const url =
        (typeof attachment.asset_url === 'string' && attachment.asset_url) ||
        (typeof attachment.url === 'string' && attachment.url) ||
        (typeof attachment.image_url === 'string' && attachment.image_url) ||
        undefined;
      if (!url) continue;
      mappedAttachments.push({
        type: typeof attachment.type === 'string' ? attachment.type : 'file',
        ref_id: typeof attachment.ref_id === 'string' ? attachment.ref_id : `att-${i}`,
        url,
        mimeType: typeof attachment.mime_type === 'string' ? attachment.mime_type : undefined,
        durationMs: typeof attachment.duration_ms === 'number' ? attachment.duration_ms : undefined,
        waveform: Array.isArray(attachment.waveform) ? (attachment.waveform as number[]) : undefined,
      });
    }

    const firstAttachment = msg.attachments[0];
    if (firstAttachment.type === 'image') {
      mediaType = 'image';
      mediaUrl = firstAttachment.image_url || firstAttachment.asset_url;
    } else if (firstAttachment.type === 'video') {
      mediaType = 'video';
      mediaUrl = firstAttachment.asset_url;
    } else if (firstAttachment.type === 'audio') {
      mediaType = 'audio';
      mediaUrl = firstAttachment.asset_url;
    } else if (firstAttachment.type === 'file') {
      mediaType = 'document';
      mediaUrl = firstAttachment.asset_url;
    }

    // URL enrichment attachment = link preview
    const urlAttachment = msg.attachments.find(
      (a: Record<string, unknown>) => a.og_scrape_url || a.title_link,
    );
    if (urlAttachment) {
      linkPreview = {
        url: urlAttachment.og_scrape_url || urlAttachment.title_link,
        title: urlAttachment.title,
        description: urlAttachment.text,
        image: urlAttachment.image_url || urlAttachment.thumb_url,
      };
    }
  }

  const custom = (msg as unknown as Record<string, unknown>) || {};

  // Extract reactions
  const reactions: Record<string, { count: number; userReacted: boolean; users: string[] }> = {};
  if (msg.reaction_counts) {
    for (const [type, count] of Object.entries(msg.reaction_counts)) {
      reactions[type] = {
        count: count as number,
        userReacted: false,
        users: [],
      };
    }
  }

  // Populate users from latest_reactions
  if (msg.latest_reactions) {
    for (const reaction of msg.latest_reactions) {
      const type = reaction.type;
      if (!reactions[type]) {
        reactions[type] = { count: 0, userReacted: false, users: [] };
      }
      if (reaction.user?.id && !reactions[type].users.includes(reaction.user.id)) {
        reactions[type].users.push(reaction.user.id);
      }
    }
  }

  // Set own reaction flags
  if (msg.own_reactions) {
    for (const reaction of msg.own_reactions) {
      const type = reaction.type;
      if (!reactions[type]) {
        reactions[type] = { count: 0, userReacted: false, users: [] };
      }
      reactions[type].userReacted = true;
      if (reaction.user?.id && !reactions[type].users.includes(reaction.user.id)) {
        reactions[type].users.push(reaction.user.id);
      }
    }
  }

  return {
    id: msg.id,
    trip_id: tripId,
    content: msg.text || '',
    author_name: user?.name || user?.id || 'Unknown',
    user_id: user?.id,
    created_at: msg.created_at || new Date().toISOString(),
    updated_at: msg.updated_at || msg.created_at || new Date().toISOString(),
    media_type: mediaType,
    media_url: mediaUrl,
    link_preview: linkPreview,
    sentiment: custom.sentiment as string | undefined,
    privacy_mode: custom.privacy_mode as string | undefined,
    privacy_encrypted: false, // No encryption in Stream path
    message_type: custom.message_type as string | undefined,
    system_event_type: custom.system_event_type as string | undefined,
    system_payload: custom.system_payload as Record<string, unknown> | undefined,
    is_edited: msg.created_at !== msg.updated_at,
    edited_at: msg.created_at !== msg.updated_at ? msg.updated_at : undefined,
    client_message_id: msg.id, // Stream uses message ID for dedup
    reply_to_id: msg.parent_id || undefined,
    mentioned_user_ids: msg.mentioned_users?.map((u: UserResponse) => u.id),
    reactions: Object.keys(reactions).length > 0 ? reactions : undefined,
    attachments: mappedAttachments.length > 0 ? mappedAttachments : undefined,
  };
}

/**
 * Build Stream message payload from Chravel send parameters.
 */
export function chravelMessageToStreamPayload(params: {
  content: string;
  userId: string;
  privacyMode?: string;
  messageType?: string;
  systemEventType?: string;
  systemPayload?: Record<string, unknown>;
  replyToId?: string;
  mentionedUserIds?: string[];
  mediaType?: string;
  mediaUrl?: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    text: params.content,
    user_id: params.userId,
  };

  // Custom data
  if (params.privacyMode && params.privacyMode !== 'standard') {
    payload.privacy_mode = params.privacyMode;
  }
  if (params.messageType && params.messageType !== 'text') {
    payload.message_type = params.messageType;
  }
  if (params.systemEventType) {
    payload.system_event_type = params.systemEventType;
  }
  if (params.systemPayload) {
    payload.system_payload = params.systemPayload;
  }

  // Thread reply
  if (params.replyToId) {
    payload.parent_id = params.replyToId;
  }

  // Mentions
  if (params.mentionedUserIds && params.mentionedUserIds.length > 0) {
    payload.mentioned_users = params.mentionedUserIds;
  }

  // Attachments
  if (params.mediaUrl) {
    payload.attachments = [
      {
        type: params.mediaType || 'file',
        asset_url: params.mediaUrl,
      },
    ];
  }

  return payload;
}
