-- Add trip_files.file_url so the concierge context aggregator can surface a
-- download/preview URL for trip-attached files. Nullable: existing rows have
-- their bytes in Supabase Storage and the URL will be backfilled on next
-- upload or as part of the migration after the storage proxy lands.

ALTER TABLE public.trip_files
  ADD COLUMN IF NOT EXISTS file_url TEXT;
