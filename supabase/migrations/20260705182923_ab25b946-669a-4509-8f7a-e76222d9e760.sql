ALTER TABLE public.trip_members ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.trip_members ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.is_active_trip_member(_user_id uuid, _trip_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE user_id = _user_id AND trip_id = _trip_id
      AND (status IS NULL OR status = 'active')
  )
$function$;

DROP POLICY IF EXISTS "Users can view their trips" ON public.trips;
CREATE POLICY "Users can view their trips"
ON public.trips FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) = created_by
  OR public.is_active_trip_member((SELECT auth.uid()), id)
);

CREATE OR REPLACE FUNCTION public.leave_trip(_trip_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_creator_id uuid;
  v_active_count int;
  v_new_admin uuid;
  v_is_creator boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'You must be logged in');
  END IF;

  SELECT created_by INTO v_creator_id FROM public.trips WHERE id = _trip_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Trip not found');
  END IF;

  IF NOT public.is_active_trip_member(v_user_id, _trip_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'You are not a member of this trip');
  END IF;

  v_is_creator := (v_creator_id = v_user_id);

  SELECT COUNT(*) INTO v_active_count
  FROM public.trip_members
  WHERE trip_id = _trip_id AND (status IS NULL OR status = 'active') AND user_id != v_user_id;

  UPDATE public.trip_members
  SET status = 'left', left_at = now()
  WHERE trip_id = _trip_id AND user_id = v_user_id;

  IF v_active_count = 0 THEN
    UPDATE public.trips SET is_archived = true WHERE id = _trip_id;
    RETURN jsonb_build_object('success', true, 'archived', true);
  END IF;

  IF v_is_creator THEN
    SELECT user_id INTO v_new_admin
    FROM public.trip_members
    WHERE trip_id = _trip_id AND (status IS NULL OR status = 'active')
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_new_admin IS NOT NULL THEN
      UPDATE public.trip_members SET role = 'admin' WHERE trip_id = _trip_id AND user_id = v_new_admin;
      INSERT INTO public.trip_admins (trip_id, user_id, granted_by, permissions)
      VALUES (_trip_id, v_new_admin, v_user_id, '{"can_manage_roles":true,"can_manage_channels":true,"can_designate_admins":true}'::jsonb)
      ON CONFLICT (trip_id, user_id) DO UPDATE SET permissions = EXCLUDED.permissions;
    END IF;

    RETURN jsonb_build_object('success', true, 'notify_user_id', v_new_admin);
  END IF;

  RETURN jsonb_build_object('success', true, 'notify_user_id', v_creator_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.leave_trip(text) TO authenticated;