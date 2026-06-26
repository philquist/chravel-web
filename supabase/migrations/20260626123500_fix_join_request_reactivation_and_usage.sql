CREATE OR REPLACE FUNCTION public.approve_join_request(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req RECORD;
  trip_data RECORD;
  profile_exists BOOLEAN;
  v_member_insert_rowcount integer;
BEGIN
  SELECT * INTO req
  FROM public.trip_join_requests
  WHERE id = _request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Join request not found'
    );
  END IF;

  IF req.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'This request has already been ' || req.status
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = req.user_id
  ) INTO profile_exists;

  IF NOT profile_exists THEN
    DELETE FROM public.trip_join_requests WHERE id = _request_id;
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'This join request is no longer valid (user account was deleted)',
      'cleaned_up', TRUE
    );
  END IF;

  SELECT * INTO trip_data FROM public.trips WHERE id = req.trip_id;

  IF NOT FOUND THEN
    DELETE FROM public.trip_join_requests WHERE id = _request_id;
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'This trip no longer exists',
      'cleaned_up', TRUE
    );
  END IF;

  IF trip_data.trip_type IN ('pro', 'event') THEN
    IF NOT (
      trip_data.created_by = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.trip_admins
        WHERE trip_id = req.trip_id AND user_id = auth.uid()
      )
    ) THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Only trip admins can approve join requests for Pro/Event trips'
      );
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.trip_members
      WHERE trip_id = req.trip_id
        AND user_id = auth.uid()
        AND (status IS NULL OR status = 'active')
    ) THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Only trip members can approve join requests'
      );
    END IF;
  END IF;

  IF public.is_trip_at_member_capacity(req.trip_id) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error_code', 'TRIP_FULL',
      'message', 'This trip has reached its member limit. Upgrade your plan or remove members to add more people.',
      'member_limit', public.get_trip_member_limit(req.trip_id),
      'member_count', COALESCE(trip_data.member_count, 0)
    );
  END IF;

  UPDATE public.trip_join_requests
  SET
    status = 'approved',
    resolved_at = now(),
    resolved_by = auth.uid()
  WHERE id = _request_id;

  INSERT INTO public.trip_members (trip_id, user_id, role, status)
  VALUES (req.trip_id, req.user_id, 'member', 'active')
  ON CONFLICT (trip_id, user_id) DO UPDATE
  SET
    status = 'active',
    left_at = NULL,
    role = EXCLUDED.role
  WHERE public.trip_members.status IS DISTINCT FROM 'active';

  GET DIAGNOSTICS v_member_insert_rowcount = ROW_COUNT;

  IF v_member_insert_rowcount > 0 AND req.invite_code IS NOT NULL AND req.invite_code != '' THEN
    UPDATE public.trip_invites
    SET current_uses = current_uses + 1,
        updated_at = now()
    WHERE trip_id = req.trip_id AND code = req.invite_code;
  END IF;

  BEGIN
    PERFORM public.create_notification(
      req.user_id,
      '✅ Join Request Approved',
      'Your request to join "' || trip_data.name || '" has been approved!',
      'success',
      jsonb_build_object(
        'trip_id', req.trip_id,
        'trip_name', trip_data.name,
        'trip_type', trip_data.trip_type,
        'action', 'join_approved'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to send approval notification: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'User added to trip successfully',
    'trip_id', req.trip_id,
    'user_id', req.user_id,
    'member_inserted', v_member_insert_rowcount > 0
  );
END;
$$;
