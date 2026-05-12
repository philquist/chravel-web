import React, { useState, useEffect } from 'react';
import { X, Copy, Check, ScrollText } from 'lucide-react';
import { useTripType } from '@/hooks/useTripType';
import { getStreamClient } from '@/services/stream/streamClient';
import { CHANNEL_TYPE_TRIP, tripChannelId } from '@/services/stream/streamChannelFactory';
import { format } from 'date-fns';

interface SystemEvent {
  id: string;
  content: string;
  system_event_type: string;
  payload: unknown;
  created_at: string;
}

interface EventLogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
}

export const EventLogDrawer: React.FC<EventLogDrawerProps> = ({ isOpen, onClose, tripId }) => {
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { isConsumer } = useTripType(tripId);

  useEffect(() => {
    if (!isConsumer || !isOpen) return;

    let cancelled = false;
    const fetchEvents = async (): Promise<void> => {
      setLoading(true);
      try {
        const client = getStreamClient();
        if (!client?.userID) {
          if (!cancelled) setEvents([]);
          return;
        }

        const channel = client.channel(CHANNEL_TYPE_TRIP, tripChannelId(tripId));
        // Fetch the most recent system messages on this channel. Stream's
        // query-messages takes filter-by-message_type via custom field.
        const result = await channel.query({
          messages: { limit: 100 },
          watch: false,
          state: false,
        });

        if (cancelled) return;

        const systemMessages: SystemEvent[] = (result.messages || [])
          .filter(m => (m as { message_type?: string }).message_type === 'system')
          .map(m => {
            const custom = m as unknown as Record<string, unknown>;
            return {
              id: m.id,
              content: m.text || '',
              system_event_type: (custom.system_event_type as string) || 'unknown',
              payload: custom.system_payload ?? null,
              created_at: m.created_at?.toString() || new Date().toISOString(),
            };
          })
          .reverse(); // newest first

        setEvents(systemMessages);
      } catch (error) {
        console.error('[EventLog] Stream query failed:', error);
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchEvents();
    return () => {
      cancelled = true;
    };
  }, [isConsumer, isOpen, tripId]);

  const copyAllToClipboard = async (): Promise<void> => {
    const json = JSON.stringify(events, null, 2);
    await navigator.clipboard.writeText(json);
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyEventToClipboard = async (event: SystemEvent): Promise<void> => {
    const json = JSON.stringify(event, null, 2);
    await navigator.clipboard.writeText(json);
    setCopiedId(event.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Only render for consumer trips
  if (!isConsumer) {
    return null;
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-background border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/90">
              Trip Activity
            </p>
            <div className="flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-foreground">Event Log</h2>
              <span className="text-sm text-muted-foreground">({events.length} events)</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyAllToClipboard}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-lg transition-colors"
            >
              {copiedId === 'all' ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              Copy All
            </button>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Events List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-center text-muted-foreground py-8">Loading events...</div>
          ) : events.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No system events found</div>
          ) : (
            events.map(event => (
              <div key={event.id} className="border border-border/80 rounded-xl p-3 bg-muted/20">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm text-foreground">{event.content}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(event.created_at), 'MMM d, h:mm a')}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                        {event.system_event_type}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                      className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded transition-colors"
                    >
                      {expandedId === event.id ? 'Hide' : 'JSON'}
                    </button>
                    <button
                      onClick={() => copyEventToClipboard(event)}
                      className="p-1 hover:bg-muted rounded transition-colors"
                    >
                      {copiedId === event.id ? (
                        <Check className="w-3 h-3 text-green-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
                {expandedId === event.id && event.payload != null ? (
                  <pre className="mt-2 p-2 bg-muted rounded-lg text-xs overflow-x-auto text-muted-foreground">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
