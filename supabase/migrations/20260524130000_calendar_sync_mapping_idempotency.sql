-- Calendar sync hardening: immutable external<->internal mapping, idempotent sync logs,
-- UTC normalization checks, and reconciliation/alerting surfaces.

CREATE TABLE IF NOT EXISTS public.calendar_event_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL,
  internal_event_id UUID NOT NULL REFERENCES public.trip_events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'outlook', 'ics', 'internal')),
  external_calendar_id TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  correlation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, provider, external_calendar_id, external_event_id),
  UNIQUE (trip_id, internal_event_id, provider),
  UNIQUE (correlation_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_event_mappings_trip_id
  ON public.calendar_event_mappings(trip_id);
CREATE INDEX IF NOT EXISTS idx_calendar_event_mappings_internal_event_id
  ON public.calendar_event_mappings(internal_event_id);

ALTER TABLE public.calendar_event_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip members can view calendar mappings" ON public.calendar_event_mappings;
CREATE POLICY "Trip members can view calendar mappings"
ON public.calendar_event_mappings
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.trip_members tm
    WHERE tm.trip_id = calendar_event_mappings.trip_id
      AND tm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Trip admins can manage calendar mappings" ON public.calendar_event_mappings;
CREATE POLICY "Trip admins can manage calendar mappings"
ON public.calendar_event_mappings
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.trip_members tm
    WHERE tm.trip_id = calendar_event_mappings.trip_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.trip_members tm
    WHERE tm.trip_id = calendar_event_mappings.trip_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
  )
);

CREATE TABLE IF NOT EXISTS public.calendar_sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'outlook', 'ics', 'internal')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete', 'rsvp')),
  internal_event_id UUID REFERENCES public.trip_events(id) ON DELETE SET NULL,
  external_event_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'duplicate', 'retrying', 'failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  external_updated_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, idempotency_key),
  CHECK (
    -- storage is UTC-normalized by using timestamptz; this guard blocks naive values serialized without zone
    external_updated_at IS NULL OR external_updated_at::text ~ '(\+00|Z)'
  )
);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_events_trip_status_created
  ON public.calendar_sync_events(trip_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_events_processed_at
  ON public.calendar_sync_events(processed_at DESC);

ALTER TABLE public.calendar_sync_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip members can view calendar sync events" ON public.calendar_sync_events;
CREATE POLICY "Trip members can view calendar sync events"
ON public.calendar_sync_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.trip_members tm
    WHERE tm.trip_id = calendar_sync_events.trip_id
      AND tm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Trip admins can manage calendar sync events" ON public.calendar_sync_events;
CREATE POLICY "Trip admins can manage calendar sync events"
ON public.calendar_sync_events
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.trip_members tm
    WHERE tm.trip_id = calendar_sync_events.trip_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trip_members tm
    WHERE tm.trip_id = calendar_sync_events.trip_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
  )
);

CREATE OR REPLACE VIEW public.calendar_sync_reconciliation_report AS
WITH duplicate_mappings AS (
  SELECT trip_id, provider, external_calendar_id, external_event_id, count(*) AS duplicate_count
  FROM public.calendar_event_mappings
  GROUP BY 1,2,3,4
  HAVING count(*) > 1
), orphaned_mappings AS (
  SELECT m.trip_id, m.provider, m.external_calendar_id, m.external_event_id, m.internal_event_id
  FROM public.calendar_event_mappings m
  LEFT JOIN public.trip_events te ON te.id = m.internal_event_id
  WHERE te.id IS NULL
)
SELECT
  coalesce(dm.trip_id, om.trip_id) AS trip_id,
  coalesce(dm.provider, om.provider) AS provider,
  coalesce(dm.external_calendar_id, om.external_calendar_id) AS external_calendar_id,
  coalesce(dm.external_event_id, om.external_event_id) AS external_event_id,
  om.internal_event_id,
  coalesce(dm.duplicate_count, 0) AS duplicate_count,
  (om.internal_event_id IS NOT NULL) AS is_orphaned
FROM duplicate_mappings dm
FULL OUTER JOIN orphaned_mappings om
ON dm.trip_id = om.trip_id
  AND dm.provider = om.provider
  AND dm.external_calendar_id = om.external_calendar_id
  AND dm.external_event_id = om.external_event_id;

CREATE OR REPLACE VIEW public.calendar_sync_alert_metrics AS
SELECT
  trip_id,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
  COUNT(*) FILTER (WHERE status = 'retrying') AS retrying_count,
  COUNT(*) FILTER (WHERE retry_count >= 5) AS retry_exhausted_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'failed') / NULLIF(COUNT(*), 0),
    2
  ) AS error_rate_percent,
  MAX(created_at) AS latest_event_at
FROM public.calendar_sync_events
WHERE created_at >= now() - interval '24 hours'
GROUP BY trip_id;
