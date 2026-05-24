-- Normalize existing all-day events to UTC midnight.
-- All-day start_time values stored as local-midnight (timezone-dependent) are
-- rounded to the start of their UTC date. This is idempotent: rows already at
-- UTC midnight are unchanged. After this migration, new writes also use UTC
-- midnight via the updated calendarService.convertFromCalendarEvent.

BEGIN;

UPDATE public.trip_events
SET
  start_time = date_trunc('day', start_time AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
  end_time = CASE
    WHEN end_time IS NOT NULL
    THEN (date_trunc('day', end_time AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
         + INTERVAL '23 hours 59 minutes 59 seconds 999 milliseconds'
    ELSE NULL
  END
WHERE is_all_day = true;

COMMIT;
