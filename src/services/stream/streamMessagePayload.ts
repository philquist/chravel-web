import type { Channel } from 'stream-chat';

type UnknownRecord = Record<string, unknown>;

export interface StreamLinkPreviewInput {
  url?: string;
  title?: string;
  image?: string;
  description?: string;
}

export interface BuildTripStreamPayloadInput {
  content: string;
  mediaType?: string;
  mediaUrl?: string;
  privacyMode?: string;
  messageType?: 'text' | 'broadcast' | 'payment' | 'system' | string;
  replyToId?: string;
  mentionedUserIds?: string[];
  attachments?: unknown[];
  linkPreview?: StreamLinkPreviewInput;
  quotedReference?: StreamQuotedReferenceInput;
  idempotencyKey?: string;
}

export interface StreamQuotedReferenceInput {
  id: string;
  text: string;
  authorName: string;
  createdAt?: string;
}

export interface StreamQuotedReference {
  id: string;
  text: string;
  authorName: string;
  createdAt?: string;
}

export interface BuildTripStreamPayloadResult {
  ok: true;
  payload: Parameters<Channel['sendMessage']>[0];
  normalizedContent: string;
}

export interface BuildTripStreamPayloadError {
  ok: false;
  error: 'empty_content' | 'content_too_long';
}

type StreamMessageWithExtraData = {
  quoted_reference?: unknown;
  extra_data?: Record<string, unknown> | null;
};

const normalizeAttachment = (attachment: unknown): UnknownRecord | null => {
  if (!attachment || typeof attachment !== 'object') return null;

  const row = attachment as UnknownRecord;
  const type = typeof row.type === 'string' ? row.type : 'file';
  const directAssetUrl = typeof row.asset_url === 'string' ? row.asset_url : null;
  const directUrl = typeof row.url === 'string' ? row.url : null;
  const assetUrl = directAssetUrl || directUrl;

  if (!assetUrl) return null;

  const normalized: UnknownRecord = {
    type,
    asset_url: assetUrl,
    title: typeof row.title === 'string' ? row.title : undefined,
  };

  // Preserve voice-note metadata so receivers can render waveform/duration.
  if (typeof row.mime_type === 'string') normalized.mime_type = row.mime_type;
  if (typeof row.mimeType === 'string' && !normalized.mime_type) {
    normalized.mime_type = row.mimeType;
  }
  if (typeof row.duration_ms === 'number') normalized.duration_ms = row.duration_ms;
  if (typeof row.durationMs === 'number' && normalized.duration_ms === undefined) {
    normalized.duration_ms = row.durationMs;
  }
  if (Array.isArray(row.waveform)) normalized.waveform = row.waveform;
  if (typeof row.ref_id === 'string') normalized.ref_id = row.ref_id;

  return normalized;
};

function attachmentAssetUrl(attachment: UnknownRecord): string | null {
  const assetUrl = typeof attachment.asset_url === 'string' ? attachment.asset_url : null;
  const url = typeof attachment.url === 'string' ? attachment.url : null;
  return assetUrl || url;
}

function buildAttachments(input: BuildTripStreamPayloadInput): UnknownRecord[] {
  const normalized = (input.attachments || [])
    .map(normalizeAttachment)
    .filter((value): value is UnknownRecord => Boolean(value));

  // Callers often pass both mediaUrl (legacy single-media field) and attachments[].
  // Skip mediaUrl when that URL is already represented so mosaics/voice notes stay 1:1.
  if (input.mediaUrl) {
    const alreadyPresent = normalized.some(
      attachment => attachmentAssetUrl(attachment) === input.mediaUrl,
    );
    if (!alreadyPresent) {
      normalized.push({
        type: input.mediaType || 'file',
        asset_url: input.mediaUrl,
      });
    }
  }

  if (input.linkPreview?.url) {
    normalized.push({
      type: 'link',
      og_scrape_url: input.linkPreview.url,
      title: input.linkPreview.title,
      text: input.linkPreview.description,
      asset_url: input.linkPreview.image,
    });
  }

  return normalized;
}

export function buildTripStreamMessagePayload(
  input: BuildTripStreamPayloadInput,
): BuildTripStreamPayloadResult | BuildTripStreamPayloadError {
  const normalizedContent = input.content.trim();

  if (normalizedContent.length > 4000) return { ok: false, error: 'content_too_long' };

  // Build attachments FIRST: a photo/video/document (or a link preview) can be sent with no
  // caption. Previously empty content was rejected before attachments were considered, so
  // caption-less media uploaded to storage but never posted a chat message and the user saw
  // a misleading "connection unavailable" error. Only reject when there is nothing to send.
  const attachments = buildAttachments(input);
  if (!normalizedContent && attachments.length === 0) {
    return { ok: false, error: 'empty_content' };
  }

  const payload: Record<string, unknown> = {
    text: normalizedContent,
  };

  if (input.privacyMode && input.privacyMode !== 'standard') {
    payload.privacy_mode = input.privacyMode;
  }

  if (input.messageType && input.messageType !== 'text') {
    payload.message_type = input.messageType;
  }

  if (input.replyToId && !input.replyToId.startsWith('legacy-')) {
    payload.parent_id = input.replyToId;
  }

  const normalizedQuotedReference = normalizeQuotedReference(input.quotedReference);
  if (normalizedQuotedReference) {
    payload.quoted_reference = normalizedQuotedReference;
  }

  if (input.mentionedUserIds && input.mentionedUserIds.length > 0) {
    payload.mentioned_users = input.mentionedUserIds;
  }
  if (input.idempotencyKey) {
    payload.idempotency_key = input.idempotencyKey;
  }

  if (attachments.length > 0) {
    payload.attachments = attachments;
  }

  return {
    ok: true,
    normalizedContent,
    payload: payload as Parameters<Channel['sendMessage']>[0],
  };
}

function normalizeQuotedReference(value: unknown): StreamQuotedReference | null {
  if (!value || typeof value !== 'object') return null;

  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const text = typeof row.text === 'string' ? row.text.trim() : '';
  const authorName = typeof row.authorName === 'string' ? row.authorName.trim() : '';
  const createdAt =
    typeof row.createdAt === 'string' && row.createdAt.trim().length > 0
      ? row.createdAt.trim()
      : undefined;

  if (!id || !text || !authorName) return null;
  return { id, text, authorName, createdAt };
}

export function extractQuotedReferenceFromStreamMessage(
  message: StreamMessageWithExtraData,
): StreamQuotedReference | undefined {
  const fromTopLevel = normalizeQuotedReference(message.quoted_reference);
  if (fromTopLevel) return fromTopLevel;

  const fromExtraData = normalizeQuotedReference(message.extra_data?.quoted_reference);
  if (fromExtraData) return fromExtraData;

  return undefined;
}
