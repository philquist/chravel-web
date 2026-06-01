import { sendChatMessage } from '@/services/chatService';
import { isStreamConfigured } from './streamTransportGuards';
import { sendTripMessageViaStream } from './tripMessageTransport';

export async function sendTripMessageWithCanonicalTransport(
  tripId: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const streamResult = await sendTripMessageViaStream({
    tripId,
    content: (payload.content as string) || '',
    mediaType: payload.media_type as string | undefined,
    mediaUrl: payload.media_url as string | undefined,
    privacyMode: payload.privacy_mode as string | undefined,
    messageType: payload.message_type as string | undefined,
    attachments: payload.attachments as unknown[] | undefined,
    linkPreview: payload.link_preview as
      | { url?: string; title?: string; image?: string; description?: string }
      | undefined,
  });

  if (streamResult) return streamResult;

  if (isStreamConfigured()) {
    throw new Error('Chat connection unavailable. Please try again.');
  }

  return sendChatMessage(payload);
}
