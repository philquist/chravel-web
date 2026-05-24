-- Add a full unique constraint on (trip_id, idempotency_key) so PostgREST can
-- use onConflict for upsert-based dedup. NULLs are always distinct in Postgres,
-- so rows created without an idempotency_key still insert freely.
-- The partial index added in 20260305000000 is dropped to avoid maintaining a
-- redundant structure — the unique constraint covers the same uniqueness guarantee.

ALTER TABLE public.trip_events
  ADD CONSTRAINT trip_events_trip_idempotency_unique
  UNIQUE (trip_id, idempotency_key);

DROP INDEX IF EXISTS public.trip_events_idempotency_key_idx;
