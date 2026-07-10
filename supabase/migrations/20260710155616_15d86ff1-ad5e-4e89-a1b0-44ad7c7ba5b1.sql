-- Remove legacy calendar-event notification trigger to prevent duplicate alerts.
-- The new canonical fanout is `trigger_notify_calendar_event_added` (added in
-- 20260709155343_*.sql), which writes with metadata.fanout_event_key so the
-- partial unique dedupe index works. The old `trigger_notify_calendar_event`
-- wrote a second row with different title and no fanout key, so recipients saw
-- two nearly-identical notifications per manually created event.
DROP TRIGGER IF EXISTS trigger_notify_calendar_event ON public.trip_events;