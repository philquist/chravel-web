-- Add trips.member_count, maintained via trigger on trip_members.
-- Replaces the ad-hoc consumer-side default of 1 in usePendingRequestTripCards
-- and useDashboardJoinRequests with a real, accurate count.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS member_count INTEGER NOT NULL DEFAULT 0;

-- Backfill from existing trip_members rows. Idempotent because the SET clause
-- always recomputes from the current state of trip_members.
UPDATE public.trips t
SET member_count = sub.cnt
FROM (
  SELECT trip_id, COUNT(*)::int AS cnt
  FROM public.trip_members
  GROUP BY trip_id
) sub
WHERE sub.trip_id = t.id;

CREATE OR REPLACE FUNCTION public.sync_trip_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id TEXT;
BEGIN
  v_trip_id := COALESCE(NEW.trip_id, OLD.trip_id);
  IF v_trip_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.trips
  SET member_count = (
    SELECT COUNT(*)::int
    FROM public.trip_members
    WHERE trip_id = v_trip_id
  )
  WHERE id = v_trip_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trip_members_member_count_sync ON public.trip_members;
CREATE TRIGGER trip_members_member_count_sync
AFTER INSERT OR DELETE OR UPDATE OF trip_id ON public.trip_members
FOR EACH ROW
EXECUTE FUNCTION public.sync_trip_member_count();
