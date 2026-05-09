-- Fix join request notification metadata: Add trip_type for proper routing
-- Bug: When users click on "Join Request Approved" notifications, navigation fails
-- because trip_type is missing from metadata, causing fallback DB query which may fail.

-- 1. Update approve_join_request to include trip_type in notification metadata
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
BEGIN
  -- Fetch the join request
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

  -- Check if user profile exists (proxy for user existence)
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = req.user_id
  ) INTO profile_exists;

  IF NOT profile_exists THEN
    -- User was deleted - clean up the orphaned request
    DELETE FROM public.trip_join_requests WHERE id = _request_id;
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'This join request is no longer valid (user account was deleted)',
      'cleaned_up', TRUE
    );
  END IF;

  -- Get trip data for authorization check
  SELECT * INTO trip_data FROM public.trips WHERE id = req.trip_id;

  IF NOT FOUND THEN
    -- Trip was deleted - clean up
    DELETE FROM public.trip_join_requests WHERE id = _request_id;
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'This trip no longer exists',
      'cleaned_up', TRUE
    );
  END IF;

  -- Check authorization: For consumer trips, any member can approve
  -- For pro/event trips, only creator or admins can approve
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
    -- Consumer trip: any member can approve
    IF NOT EXISTS (
      SELECT 1 FROM public.trip_members
      WHERE trip_id = req.trip_id AND user_id = auth.uid()
    ) THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Only trip members can approve join requests'
      );
    END IF;
  END IF;

  -- Update the request status
  UPDATE public.trip_join_requests
  SET
    status = 'approved',
    resolved_at = now(),
    resolved_by = auth.uid()
  WHERE id = _request_id;

  -- Add user to trip members
  INSERT INTO public.trip_members (trip_id, user_id, role)
  VALUES (req.trip_id, req.user_id, 'member')
  ON CONFLICT (trip_id, user_id) DO NOTHING;

  -- Increment invite usage counter when invite_code is present
  IF req.invite_code IS NOT NULL AND req.invite_code != '' THEN
    UPDATE public.trip_invites
    SET current_uses = current_uses + 1,
        updated_at = now()
    WHERE trip_id = req.trip_id AND code = req.invite_code;
  END IF;

  -- Try to send notification (non-critical - wrapped in exception handler)
  -- FIX: Include trip_type in metadata for proper notification click routing
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
    -- Log but don't fail - notification is non-critical
    RAISE NOTICE 'Failed to send approval notification: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'User added to trip successfully',
    'trip_id', req.trip_id,
    'user_id', req.user_id
  );
END;
$$;

COMMENT ON FUNCTION public.approve_join_request(uuid) IS
'Approves a join request, adds user to trip_members, increments invite usage when applicable, and notifies the requester. Notification includes trip_type for proper routing.';

-- 2. Update reject_join_request to include trip_type in notification metadata
CREATE OR REPLACE FUNCTION public.reject_join_request(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req RECORD;
  trip_data RECORD;
  profile_exists BOOLEAN;
  v_cooldown_until TIMESTAMPTZ;
BEGIN
  SELECT * INTO req FROM public.trip_join_requests WHERE id = _request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Join request not found');
  END IF;

  IF req.status != 'pending' THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'This request has already been ' || req.status);
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = req.user_id) INTO profile_exists;

  IF NOT profile_exists THEN
    DELETE FROM public.trip_join_requests WHERE id = _request_id;
    RETURN jsonb_build_object('success', TRUE, 'message', 'Orphaned request removed (user account no longer exists)', 'cleaned_up', TRUE);
  END IF;

  SELECT * INTO trip_data FROM public.trips WHERE id = req.trip_id;

  IF NOT FOUND THEN
    DELETE FROM public.trip_join_requests WHERE id = _request_id;
    RETURN jsonb_build_object('success', TRUE, 'message', 'Orphaned request removed (trip no longer exists)', 'cleaned_up', TRUE);
  END IF;

  IF trip_data.trip_type IN ('pro', 'event') THEN
    IF NOT (
      trip_data.created_by = auth.uid() OR
      EXISTS (SELECT 1 FROM public.trip_admins WHERE trip_id = req.trip_id AND user_id = auth.uid())
    ) THEN
      RETURN jsonb_build_object('success', FALSE, 'message', 'Only trip admins can reject join requests for Pro/Event trips');
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = req.trip_id AND user_id = auth.uid()) THEN
      RETURN jsonb_build_object('success', FALSE, 'message', 'Only trip members can reject join requests');
    END IF;
  END IF;

  v_cooldown_until := NOW() + INTERVAL '24 hours';

  -- Update status and set 24-hour re-request cooldown
  UPDATE public.trip_join_requests
  SET
    status = 'rejected',
    resolved_at = NOW(),
    resolved_by = auth.uid(),
    rejection_cooldown_until = v_cooldown_until
  WHERE id = _request_id;

  -- Audit log
  INSERT INTO public.admin_audit_logs (admin_id, action, trip_id, target_user_id, old_state, new_state)
  VALUES (
    auth.uid(),
    'reject_join',
    req.trip_id,
    req.user_id,
    jsonb_build_object('status', 'pending', 'request_id', _request_id),
    jsonb_build_object('status', 'rejected', 'cooldown_until', v_cooldown_until::text)
  );

  -- FIX: Include trip_type in metadata for proper notification click routing
  BEGIN
    PERFORM public.create_notification(
      req.user_id,
      'Join Request Update',
      'Your request to join "' || trip_data.name || '" was not approved at this time.',
      'info',
      jsonb_build_object(
        'trip_id', req.trip_id,
        'trip_name', trip_data.name,
        'trip_type', trip_data.trip_type,
        'action', 'join_rejected'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to send rejection notification: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Join request rejected',
    'trip_id', req.trip_id,
    'cooldown_until', v_cooldown_until::text
  );
END;
$$;

COMMENT ON FUNCTION public.reject_join_request(uuid) IS
'Rejects a join request with 24-hour re-request cooldown, logs to audit, and notifies requester. Notification includes trip_type for proper routing.';
