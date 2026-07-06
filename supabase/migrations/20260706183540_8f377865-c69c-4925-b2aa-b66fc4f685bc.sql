-- Coordinator Access for Pro Trips: additive infrastructure.
-- See prior response for rationale. Retry uses correct feature_flags column (`key`).

UPDATE public.trip_admins
SET permissions = COALESCE(permissions, '{}'::jsonb)
  || jsonb_build_object(
    'admin_scope',                 COALESCE(permissions->>'admin_scope', 'full'),
    'can_manage_shared_calendar',  COALESCE((permissions->>'can_manage_shared_calendar')::boolean, true),
    'can_manage_shared_tasks',     COALESCE((permissions->>'can_manage_shared_tasks')::boolean, true),
    'can_manage_shared_places',    COALESCE((permissions->>'can_manage_shared_places')::boolean, true),
    'can_manage_shared_files',     COALESCE((permissions->>'can_manage_shared_files')::boolean, true),
    'can_manage_shared_links',     COALESCE((permissions->>'can_manage_shared_links')::boolean, true),
    'can_invite_members',          COALESCE((permissions->>'can_invite_members')::boolean, true)
  );

CREATE OR REPLACE FUNCTION public.is_full_trip_admin(_user_id uuid, _trip_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_admins
    WHERE user_id = _user_id AND trip_id = _trip_id
      AND COALESCE(permissions->>'admin_scope', 'full') = 'full'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_trip_coordinator(_user_id uuid, _trip_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_admins
    WHERE user_id = _user_id AND trip_id = _trip_id
      AND permissions->>'admin_scope' = 'coordinator'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_coordinator_capability(
  _user_id uuid, _trip_id text, _capability text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_admins
    WHERE user_id = _user_id AND trip_id = _trip_id
      AND (
        COALESCE(permissions->>'admin_scope', 'full') = 'full'
        OR COALESCE((permissions->>_capability)::boolean, false) = true
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_full_trip_admin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_coordinator(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_coordinator_capability(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_trip_admin_permissions(p_trip_id TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_permissions JSONB;
  v_scope TEXT;
BEGIN
  IF public.is_super_admin() THEN
    RETURN json_build_object(
      'is_admin', true, 'admin_scope', 'full',
      'can_manage_roles', true, 'can_manage_channels', true, 'can_designate_admins', true,
      'can_manage_shared_calendar', true, 'can_manage_shared_tasks', true,
      'can_manage_shared_places', true, 'can_manage_shared_files', true,
      'can_manage_shared_links', true, 'can_invite_members', true
    );
  END IF;

  SELECT permissions INTO v_permissions
  FROM public.trip_admins
  WHERE trip_id = p_trip_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object(
      'is_admin', false, 'admin_scope', null,
      'can_manage_roles', false, 'can_manage_channels', false, 'can_designate_admins', false,
      'can_manage_shared_calendar', false, 'can_manage_shared_tasks', false,
      'can_manage_shared_places', false, 'can_manage_shared_files', false,
      'can_manage_shared_links', false, 'can_invite_members', false
    );
  END IF;

  v_scope := COALESCE(v_permissions->>'admin_scope', 'full');

  RETURN json_build_object(
    'is_admin', true,
    'admin_scope', v_scope,
    'can_manage_roles',      (v_scope = 'full') AND COALESCE((v_permissions->>'can_manage_roles')::boolean, false),
    'can_manage_channels',   (v_scope = 'full') AND COALESCE((v_permissions->>'can_manage_channels')::boolean, false),
    'can_designate_admins',  (v_scope = 'full') AND COALESCE((v_permissions->>'can_designate_admins')::boolean, false),
    'can_manage_shared_calendar', CASE WHEN v_scope = 'full' THEN true ELSE COALESCE((v_permissions->>'can_manage_shared_calendar')::boolean, false) END,
    'can_manage_shared_tasks',    CASE WHEN v_scope = 'full' THEN true ELSE COALESCE((v_permissions->>'can_manage_shared_tasks')::boolean, false) END,
    'can_manage_shared_places',   CASE WHEN v_scope = 'full' THEN true ELSE COALESCE((v_permissions->>'can_manage_shared_places')::boolean, false) END,
    'can_manage_shared_files',    CASE WHEN v_scope = 'full' THEN true ELSE COALESCE((v_permissions->>'can_manage_shared_files')::boolean, false) END,
    'can_manage_shared_links',    CASE WHEN v_scope = 'full' THEN true ELSE COALESCE((v_permissions->>'can_manage_shared_links')::boolean, false) END,
    'can_invite_members',         CASE WHEN v_scope = 'full' THEN true ELSE COALESCE((v_permissions->>'can_invite_members')::boolean, false) END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_trip_admin_permissions(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.promote_to_admin(
  _trip_id text, _target_user_id uuid, _scope text DEFAULT 'full'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  trip_data RECORD;
  v_perms  JSONB;
BEGIN
  IF _scope NOT IN ('full', 'coordinator') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid scope');
  END IF;

  SELECT * INTO trip_data FROM public.trips WHERE id = _trip_id;

  IF NOT (
    trip_data.created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.trip_admins
      WHERE trip_id = _trip_id AND user_id = auth.uid()
        AND COALESCE(permissions->>'admin_scope', 'full') = 'full'
        AND (permissions->>'can_designate_admins')::boolean = true
    )
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only full admins with permission can promote users');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.trip_members WHERE trip_id = _trip_id AND user_id = _target_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'User must be a trip member first');
  END IF;

  IF _scope = 'coordinator' THEN
    v_perms := jsonb_build_object(
      'admin_scope', 'coordinator',
      'can_manage_roles', false, 'can_manage_channels', false, 'can_designate_admins', false,
      'can_manage_shared_calendar', true, 'can_manage_shared_tasks', true,
      'can_manage_shared_places', true, 'can_manage_shared_files', true,
      'can_manage_shared_links', true, 'can_invite_members', false
    );
  ELSE
    v_perms := jsonb_build_object(
      'admin_scope', 'full',
      'can_manage_roles', true, 'can_manage_channels', true, 'can_designate_admins', false,
      'can_manage_shared_calendar', true, 'can_manage_shared_tasks', true,
      'can_manage_shared_places', true, 'can_manage_shared_files', true,
      'can_manage_shared_links', true, 'can_invite_members', true
    );
  END IF;

  INSERT INTO public.trip_admins (trip_id, user_id, granted_by, permissions)
  VALUES (_trip_id, _target_user_id, auth.uid(), v_perms)
  ON CONFLICT (trip_id, user_id)
  DO UPDATE SET permissions = EXCLUDED.permissions, granted_by = EXCLUDED.granted_by;

  RETURN jsonb_build_object('success', true, 'message', 'User promoted with scope ' || _scope, 'admin_scope', _scope);
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_to_admin(text, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_admin_scope(
  _trip_id text, _target_user_id uuid, _scope text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  trip_data RECORD;
BEGIN
  IF _scope NOT IN ('full', 'coordinator') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid scope');
  END IF;

  SELECT * INTO trip_data FROM public.trips WHERE id = _trip_id;

  IF NOT (
    trip_data.created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.trip_admins
      WHERE trip_id = _trip_id AND user_id = auth.uid()
        AND COALESCE(permissions->>'admin_scope', 'full') = 'full'
        AND (permissions->>'can_designate_admins')::boolean = true
    )
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only full admins with permission can change scope');
  END IF;

  UPDATE public.trip_admins
     SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object('admin_scope', _scope)
   WHERE trip_id = _trip_id AND user_id = _target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Admin row not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'admin_scope', _scope);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_admin_scope(text, uuid, text) TO authenticated;

INSERT INTO public.feature_flags (key, enabled, description)
VALUES (
  'pro_coordinator_role',
  false,
  'Enables the Coordinator admin scope in the Team tab UI (invite/promote as coordinator). Backend infra is live; enable this flag only after the private-surface RLS narrowing pass has shipped.'
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON FUNCTION public.get_trip_admin_permissions(TEXT) IS
  'Returns admin status, admin_scope, and capability flags for the calling user on a given trip. admin_scope: full = blanket access (backward compatible); coordinator = logistics only.';
COMMENT ON FUNCTION public.is_full_trip_admin(uuid, text) IS
  'True only for admins with admin_scope=full. Use for private-surface RLS (channels, chat, AI, private media).';
COMMENT ON FUNCTION public.is_trip_coordinator(uuid, text) IS
  'True only for admins with admin_scope=coordinator (logistics-only outside organizers).';