import type {
  ReservationDraft,
  SmartImportPreviewEvent,
  SmartImportStatus,
} from '@/services/conciergeGateway';
import type { HotelResult } from '@/features/chat/components/HotelResultCards';

export interface AIConciergeChatProps {
  tripId: string;
  basecamp?: { name?: string; address: string };
  isDemoMode?: boolean;
  isActive?: boolean;
  onTabChange?: (tab: string) => void;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  pendingActions?: Array<{
    id: string;
    toolName: string;
    actionType: string;
    message: string;
    title?: string;
    detail?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  sources?: Array<{
    title: string;
    url: string;
    snippet: string;
    source?: string;
  }>;
  googleMapsWidget?: string;
  googleMapsWidgetContextToken?: string;
  functionCallPlaces?: Array<{
    placeId?: string | null;
    name: string;
    address?: string;
    rating?: number | null;
    userRatingCount?: number | null;
    priceLevel?: string | null;
    mapsUrl?: string | null;
    previewPhotoUrl?: string | null;
    photoUrls?: string[];
  }>;
  functionCallFlights?: Array<{
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    passengers: number;
    deeplink: string;
    provider?: string | null;
    price?: { amount?: number | null; currency?: string | null; display?: string | null } | null;
    airline?: string | null;
    flightNumber?: string | null;
    stops?: number | null;
    durationMinutes?: number | null;
    departTime?: string | null;
    arriveTime?: string | null;
    refundable?: boolean | null;
  }>;
  functionCallHotels?: HotelResult[];
  conciergeActions?: Array<{
    actionType: string;
    success: boolean;
    message: string;
    entityId?: string;
    entityName?: string;
    scope?: string;
    status?: 'success' | 'failure' | 'duplicate' | 'skipped';
  }>;
  reservationDrafts?: ReservationDraft[];
  smartImportPreview?: {
    previewEvents: SmartImportPreviewEvent[];
    tripId: string;
    totalEvents: number;
    duplicateCount: number;
    lodgingName?: string;
  };
  smartImportStatus?: { status: SmartImportStatus; message: string };
  bulkDeletePreview?: {
    previewEvents: SmartImportPreviewEvent[];
    previewToken: string;
    tripId: string;
    totalEvents: number;
  };
  isStreamingVoice?: boolean;
}

export interface ConciergeInvokePayload {
  response?: string;
  usage?: ChatMessage['usage'];
  sources?: ChatMessage['sources'];
  citations?: ChatMessage['sources'];
  googleMapsWidget?: string;
  googleMapsWidgetContextToken?: string;
  success?: boolean;
  error?: string;
  places?: Array<Record<string, unknown>>;
  flights?: Array<Record<string, unknown>>;
  hotels?: Array<Record<string, unknown>>;
  conciergeActions?: Array<Record<string, unknown>>;
}

export interface ConciergeAttachment {
  mimeType: string;
  data: string;
  name?: string;
}

export type AttachmentIntent = 'smart_import' | 'summarize' | 'qa';

export interface FallbackEvent {
  title?: string;
  name?: string;
  startTime?: string;
  location?: string;
}

export interface FallbackPayment {
  isSettled?: boolean;
  settled?: boolean;
  amount?: number;
  description?: string;
  paidBy?: string;
  createdByName?: string;
}

export interface FallbackTripContext {
  itinerary?: FallbackEvent[];
  calendar?: FallbackEvent[];
  payments?: FallbackPayment[];
}

export type AiStatus =
  | 'checking'
  | 'connected'
  | 'limited'
  | 'error'
  | 'thinking'
  | 'offline'
  | 'degraded'
  | 'timeout';
