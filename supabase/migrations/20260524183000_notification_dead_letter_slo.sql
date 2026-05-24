-- Notification delivery dead-letter + SLO observability contract

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_dead_letter
  ON public.notification_deliveries (dead_lettered_at)
  WHERE dead_lettered_at IS NOT NULL;

CREATE OR REPLACE VIEW public.notification_delivery_slo AS
SELECT
  channel,
  count(*) FILTER (WHERE status = 'sent') AS sent_count,
  count(*) FILTER (WHERE status = 'failed') AS failed_count,
  count(*) FILTER (WHERE dead_lettered_at IS NOT NULL) AS dead_letter_count,
  round(
    100.0 * count(*) FILTER (WHERE status = 'sent') / NULLIF(count(*) FILTER (WHERE status IN ('sent', 'failed')), 0),
    2
  ) AS success_rate_pct,
  percentile_disc(0.95) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (COALESCE(sent_at, updated_at) - created_at))
  ) FILTER (WHERE status = 'sent') AS p95_delivery_latency_seconds,
  CASE
    WHEN channel = 'push' THEN 99.5
    WHEN channel = 'email' THEN 99.0
    ELSE 98.0
  END AS target_success_rate_pct
FROM public.notification_deliveries
GROUP BY channel;
