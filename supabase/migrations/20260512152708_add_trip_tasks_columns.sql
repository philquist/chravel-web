-- Add trip_tasks.priority, trip_tasks.status, trip_tasks.source_type, and
-- trip_polls.source_type. universalSearchService surfaces priority/status in
-- search results, and usePendingActions writes source_type='ai_concierge' for
-- concierge-created tasks/polls.

ALTER TABLE public.trip_tasks
  ADD COLUMN IF NOT EXISTS priority TEXT
    CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'blocked', 'done', 'cancelled')),
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS trip_tasks_status_idx
  ON public.trip_tasks (trip_id, status);
CREATE INDEX IF NOT EXISTS trip_tasks_source_type_idx
  ON public.trip_tasks (source_type);

ALTER TABLE public.trip_polls
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual';
