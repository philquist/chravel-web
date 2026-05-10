import { invokeConcierge } from '@/services/conciergeGateway';
import type {
  AttachmentIntent,
  ChatMessage,
  ConciergeAttachment,
  ConciergeInvokePayload,
  FallbackTripContext,
} from '@/features/concierge/types';
import { VOICE_LIVE_ENABLED } from '@/config/voiceFeatureFlags';
import type { ConciergeSession } from '@/store/conciergeSessionStore';

export const FAST_RESPONSE_TIMEOUT_MS = 60_000;
export const MAX_CHAT_HISTORY_MESSAGES = 10;
export const MAX_SINGLE_MESSAGE_LENGTH = 3000;
export const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
]);
export const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'text/calendar',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
export const ALL_ACCEPTED_TYPES = new Set([...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES]);

export const UPLOAD_ENABLED = true;
export const DUPLEX_VOICE_ENABLED = VOICE_LIVE_ENABLED;

export const EMPTY_SESSION: ConciergeSession = {
  tripId: '',
  messages: [],
  voiceState: 'idle',
  lastError: null,
  lastErrorAt: null,
  lastSuccessAt: null,
  historyLoadedFromServer: false,
};

export function extractRichMetadata(
  msg: ChatMessage | undefined | null,
): Record<string, unknown> | null {
  if (!msg) return null;
  const meta: Record<string, unknown> = {};
  if (msg.functionCallPlaces?.length) meta.functionCallPlaces = msg.functionCallPlaces;
  if (msg.functionCallFlights?.length) meta.functionCallFlights = msg.functionCallFlights;
  if (msg.functionCallHotels?.length) meta.functionCallHotels = msg.functionCallHotels;
  if (msg.googleMapsWidget) meta.googleMapsWidget = msg.googleMapsWidget;
  if (msg.conciergeActions?.length) meta.conciergeActions = msg.conciergeActions;
  if (msg.sources?.length) meta.sources = msg.sources;
  return Object.keys(meta).length > 0 ? meta : null;
}

export const _uniqueId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const fileToAttachmentPayload = async (file: File): Promise<ConciergeAttachment> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`Failed to read "${file.name}"`));
    reader.readAsDataURL(file);
  });

  const base64Index = dataUrl.indexOf('base64,');
  if (base64Index < 0) {
    throw new Error(`Unable to encode "${file.name}" for upload`);
  }

  return {
    mimeType: file.type || 'image/jpeg',
    data: dataUrl.substring(base64Index + 'base64,'.length),
    name: file.name,
  };
};

export const invokeConciergeWithTimeout = async (
  requestBody: Record<string, unknown> & { message: string },
  options: { demoMode?: boolean } = {},
): Promise<{ data: ConciergeInvokePayload | null; error: { message?: string } | null }> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('AI request timed out')),
      FAST_RESPONSE_TIMEOUT_MS,
    );
  });

  try {
    const response = (await Promise.race([
      invokeConcierge(requestBody, options),
      timeoutPromise,
    ])) as {
      data: ConciergeInvokePayload | null;
      error: { message?: string } | null;
    };
    return response;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const normalizePayments = (
  payments: FallbackTripContext['payments'],
): NonNullable<FallbackTripContext['payments']> => {
  if (!Array.isArray(payments)) return [];
  return payments.filter(
    (payment): payment is NonNullable<FallbackTripContext['payments']>[number] =>
      typeof payment === 'object' && payment !== null,
  );
};

export const generateFallbackResponse = (
  query: string,
  tripContext: FallbackTripContext,
  basecampLocation?: { name: string; address: string },
): string => {
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.match(/\b(where|location|address|directions|near|around|close)\b/)) {
    if (basecampLocation) {
      return `📍 **Location Information**\n\nBased on your trip basecamp:\n\n**${basecampLocation.name}**\n${basecampLocation.address}\n\nYou can use Google Maps to find directions and nearby places.`;
    }
    return `📍 I can help with location queries once the AI service is restored. For now, you can use the Places tab to search for locations.`;
  }

  if (lowerQuery.match(/\b(when|time|schedule|calendar|event|agenda|upcoming)\b/)) {
    if (tripContext?.itinerary?.length || tripContext?.calendar?.length) {
      const events = tripContext.itinerary || tripContext.calendar || [];
      const upcoming = events.slice(0, 3);
      let response = `📅 **Upcoming Events**\n\n`;
      upcoming.forEach(event => {
        response += `• ${event.title || event.name}`;
        if (event.startTime) response += ` - ${event.startTime}`;
        if (event.location) response += ` at ${event.location}`;
        response += `\n`;
      });
      return response;
    }
    return `📅 Check the Calendar tab for your trip schedule.`;
  }

  if (lowerQuery.match(/\b(payment|money|owe|spent|cost|budget|expense)\b/)) {
    if (tripContext?.payments?.length) {
      const unsettled = normalizePayments(tripContext.payments).filter(
        p => !p.isSettled && !p.settled,
      );
      if (unsettled.length > 0) {
        const totalOwed = unsettled.reduce((sum: number, p) => sum + (p.amount || 0), 0);
        let response = `💰 **Outstanding Payments**\n\n`;
        unsettled.slice(0, 5).forEach(p => {
          const paidBy = p.paidBy || p.createdByName || 'Someone';
          response += `• ${p.description}: $${p.amount?.toFixed(2) || '0.00'} (paid by ${paidBy})\n`;
        });
        response += `\n**Total Outstanding:** $${totalOwed.toFixed(2)}`;
        if (unsettled.length > 5) {
          response += `\n\n_...and ${unsettled.length - 5} more payments. Check the Payments tab for full details._`;
        }
        return response;
      }
      return `💰 **All Settled!**\n\nNo outstanding payments for this trip. Check the Payments tab to add new expenses.`;
    }
    return `💰 No payment data available yet. Add expenses in the Payments tab to track who owes what.`;
  }

  if (lowerQuery.match(/\b(task|todo|complete|done|pending|assigned)\b/)) {
    return `✅ Check the Tasks tab to see what needs to be completed.`;
  }

  return `I'm temporarily unavailable, but you can:\n\n• Use the **Places** tab to find locations\n• Check the **Calendar** for your schedule\n• View **Payments** for expense tracking\n• See **Tasks** for what needs to be done\n\nFull AI assistance will return shortly!`;
};
