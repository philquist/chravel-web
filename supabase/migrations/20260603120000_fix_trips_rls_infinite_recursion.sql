-- Fix: "infinite recursion detected in policy for relation trips" (Postgres 42P17)
--
-- Symptom: saving a trip cover photo (new-trip creation AND editing an existing
-- trip) failed. The client does `UPDATE public.trips SET cover_image_url = …
-- RETURNING …`. Evaluating that statement recursed:
--
--   trips UPDATE policy "Trip members can update cover image"
--     -> inline EXISTS(SELECT FROM trip_admins …)            [applies trip_admins RLS]
--   trip_admins ALL policy "Trip admins manage admins"
--     -> inline EXISTS(SELECT FROM trips …)                  [re-enters trips RLS]
--   => Postgres aborts with "infinite recursion detected in policy for relation trips".
--
-- Storage upload succeeded; only the DB write 500'd, so the UI showed the
-- misleading "uploaded but could not be saved to trip details" toast and the
-- uploaded file was cleaned up. trip-covers had zero successful uploads for weeks.
--
-- Fix: route the cross-table membership checks through SECURITY DEFINER helpers
-- (is_trip_admin / is_trip_creator) that run as owner and bypass RLS, so the
-- policy graph among trips <-> trip_admins <-> trip_members is acyclic. This is
-- the exact pattern the trips SELECT policy already uses safely via
-- is_trip_member(). Authorization semantics are preserved unchanged.

-- 1. SECURITY DEFINER helper mirroring is_trip_member / is_trip_admin.
CREATE OR REPLACE FUNCTION public.is_trip_creator(_user_id uuid, _trip_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips
    WHERE id = _trip_id AND created_by = _user_id
  )
$function$;

-- 2. trips UPDATE policy: replace the inline trip_admins subquery with the
--    SECURITY DEFINER helper. The created_by branch and the consumer/pro
--    trip_members branch are otherwise unchanged from the live policy. The
--    trip_members inline subquery is safe: trip_members SELECT policies do not
--    reference trips inline (they use is_trip_member / user_id = auth.uid()).
DROP POLICY IF EXISTS "Trip members can update cover image" ON public.trips;

CREATE POLICY "Trip members can update cover image"
ON public.trips
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    trips.created_by = auth.uid()
    OR public.is_trip_admin(auth.uid(), trips.id)
    OR (
      trips.trip_type IN ('consumer', 'pro')
      AND EXISTS (
        SELECT 1
        FROM public.trip_members tm
        WHERE tm.trip_id = trips.id
          AND tm.user_id = auth.uid()
      )
    )
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    trips.created_by = auth.uid()
    OR public.is_trip_admin(auth.uid(), trips.id)
    OR (
      trips.trip_type IN ('consumer', 'pro')
      AND EXISTS (
        SELECT 1
        FROM public.trip_members tm
        WHERE tm.trip_id = trips.id
          AND tm.user_id = auth.uid()
      )
    )
  )
);

-- 3. trip_admins ALL policy: replace the inline trips subquery (the other half
--    of the cycle) with the SECURITY DEFINER helper so the latent recursion
--    risk is removed entirely. Same authorization: trip admin OR trip creator.
DROP POLICY IF EXISTS "Trip admins manage admins" ON public.trip_admins;

CREATE POLICY "Trip admins manage admins"
ON public.trip_admins
FOR ALL
TO authenticated
USING (
  public.is_trip_admin((SELECT auth.uid()), trip_id)
  OR public.is_trip_creator((SELECT auth.uid()), trip_id)
);
