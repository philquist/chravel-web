-- New trips default to 'contain' hero fit so cover photos show more of the image
-- without changing existing rows (they keep their current cover_display_mode).
ALTER TABLE public.trips
ALTER COLUMN cover_display_mode SET DEFAULT 'contain';
