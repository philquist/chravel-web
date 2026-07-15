import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import type { ChatMessage } from '@/features/concierge/types';

export type AiQueryHistoryRow = Pick<
  Database['public']['Tables']['ai_queries']['Row'],
  'id' | 'query_text' | 'response_text' | 'created_at' | 'metadata'
>;

export function isAiQueryHistoryRow(value: unknown): value is AiQueryHistoryRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    ('query_text' in value || 'response_text' in value)
  );
}

export function isConciergeChatMessage(value: unknown): value is ChatMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'type' in value &&
    typeof (value as ChatMessage).content === 'string' &&
    'timestamp' in value
  );
}

/**
 * Normalize React Query cache entries that may be either mapped ChatMessage[]
 * objects or legacy/raw ai_queries rows (from the broken prefetch path).
 */
export function normalizeConciergeHistoryCache(data: unknown): ChatMessage[] {
  if (!Array.isArray(data) || data.length === 0) return [];
  if (isConciergeChatMessage(data[0])) {
    return data.filter(isConciergeChatMessage);
  }
  if (isAiQueryHistoryRow(data[0])) {
    return mapAiQueryRowsToConciergeMessages(data as AiQueryHistoryRow[]);
  }
  return [];
}

export function mapAiQueryRowsToConciergeMessages(rows: AiQueryHistoryRow[]): ChatMessage[] {
  if (!rows || rows.length === 0) return [];

  const messages: ChatMessage[] = [];

  rows.forEach((row, idx) => {
    const ts = row.created_at ?? new Date().toISOString();

    if (row.query_text) {
      messages.push({
        id: `history-user-${row.id}-${idx}`,
        type: 'user',
        content: row.query_text,
        timestamp: ts,
      });
    }

    if (row.response_text) {
      const meta = row.metadata as Record<string, unknown> | null;
      const assistantMsg: ChatMessage = {
        id: `history-assistant-${row.id}-${idx}`,
        type: 'assistant',
        content: row.response_text,
        timestamp: ts,
      };

      if (meta) {
        if (Array.isArray(meta.functionCallPlaces)) {
          assistantMsg.functionCallPlaces =
            meta.functionCallPlaces as ChatMessage['functionCallPlaces'];
        }
        if (Array.isArray(meta.functionCallFlights)) {
          assistantMsg.functionCallFlights =
            meta.functionCallFlights as ChatMessage['functionCallFlights'];
        }
        if (Array.isArray(meta.functionCallHotels)) {
          assistantMsg.functionCallHotels =
            meta.functionCallHotels as ChatMessage['functionCallHotels'];
        }
        if (typeof meta.googleMapsWidget === 'string') {
          assistantMsg.googleMapsWidget = meta.googleMapsWidget;
        }
        if (typeof meta.googleMapsWidgetContextToken === 'string') {
          assistantMsg.googleMapsWidgetContextToken = meta.googleMapsWidgetContextToken;
        }
        if (Array.isArray(meta.conciergeActions)) {
          assistantMsg.conciergeActions = meta.conciergeActions as ChatMessage['conciergeActions'];
        }
        if (Array.isArray(meta.sources)) {
          assistantMsg.sources = meta.sources as ChatMessage['sources'];
        }
      }

      messages.push(assistantMsg);
    }
  });

  return messages;
}

export async function fetchConciergeHistoryMessages(
  tripId: string,
  userId: string,
): Promise<ChatMessage[]> {
  const { data: rows, error: queryError } = await supabase
    .from('ai_queries')
    .select('id, query_text, response_text, created_at, metadata')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(50);

  if (queryError) {
    throw new Error(queryError.message ?? 'Failed to fetch concierge history');
  }

  return mapAiQueryRowsToConciergeMessages(rows ?? []);
}
