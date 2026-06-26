-- Platform constitution hardening slice:
-- 1) Canonical server-side permission resolver (parity with config/permission-matrix.json)
-- 2) trip_mutation_log for high-risk shared writes
-- 3) RLS rebinding for shared-object families

-- ---------------------------------------------------------------------------
-- Generated matrix evaluator (regenerate via: npm run permissions:generate)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.permission_matrix_allows(
  p_role TEXT,
  p_resource TEXT,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  CASE p_role
    WHEN 'demo' THEN
      CASE p_resource
        WHEN 'tasks' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'polls' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'calendar' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'basecamp' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'links' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        ELSE RETURN FALSE;
      END;
    WHEN 'super_admin' THEN
      CASE p_resource
        WHEN 'tasks' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'polls' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'calendar' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'basecamp' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'links' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        ELSE RETURN FALSE;
      END;
    WHEN 'consumer_member' THEN
      CASE p_resource
        WHEN 'tasks' THEN RETURN p_action IN ('read', 'write', 'delete');
        WHEN 'polls' THEN RETURN p_action IN ('read', 'write', 'delete');
        WHEN 'calendar' THEN RETURN p_action IN ('read', 'write', 'delete');
        WHEN 'basecamp' THEN RETURN p_action IN ('read', 'write', 'delete');
        WHEN 'links' THEN RETURN p_action IN ('read', 'write', 'delete');
        ELSE RETURN FALSE;
      END;
    WHEN 'consumer_guest' THEN
      CASE p_resource
        WHEN 'tasks' THEN RETURN FALSE;
        WHEN 'polls' THEN RETURN FALSE;
        WHEN 'calendar' THEN RETURN FALSE;
        WHEN 'basecamp' THEN RETURN FALSE;
        WHEN 'links' THEN RETURN FALSE;
        ELSE RETURN FALSE;
      END;
    WHEN 'pro_admin' THEN
      CASE p_resource
        WHEN 'tasks' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'polls' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'calendar' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'basecamp' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'links' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        ELSE RETURN FALSE;
      END;
    WHEN 'pro_editor' THEN
      CASE p_resource
        WHEN 'tasks' THEN RETURN p_action IN ('read', 'write', 'delete');
        WHEN 'polls' THEN RETURN p_action IN ('read', 'write');
        WHEN 'calendar' THEN RETURN p_action IN ('read', 'write', 'delete');
        WHEN 'basecamp' THEN RETURN p_action IN ('read');
        WHEN 'links' THEN RETURN p_action IN ('read', 'write');
        ELSE RETURN FALSE;
      END;
    WHEN 'pro_viewer' THEN
      CASE p_resource
        WHEN 'tasks' THEN RETURN p_action IN ('read');
        WHEN 'polls' THEN RETURN p_action IN ('read', 'write');
        WHEN 'calendar' THEN RETURN p_action IN ('read');
        WHEN 'basecamp' THEN RETURN p_action IN ('read');
        WHEN 'links' THEN RETURN p_action IN ('read', 'write');
        ELSE RETURN FALSE;
      END;
    WHEN 'event_organizer' THEN
      CASE p_resource
        WHEN 'tasks' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'polls' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'calendar' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'basecamp' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        WHEN 'links' THEN RETURN p_action IN ('read', 'write', 'delete', 'admin');
        ELSE RETURN FALSE;
      END;
    WHEN 'event_attendee' THEN
      CASE p_resource
        WHEN 'tasks' THEN RETURN p_action IN ('read');
        WHEN 'polls' THEN RETURN p_action IN ('read');
        WHEN 'calendar' THEN RETURN p_action IN ('read');
        WHEN 'basecamp' THEN RETURN p_action IN ('read');
        WHEN 'links' THEN RETURN p_action IN ('read');
        ELSE RETURN FALSE;
      END;
    ELSE RETURN FALSE;
  END CASE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Resolve matrix role for an actor on a trip
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_trip_permission_role(
  p_user_id UUID,
  p_trip_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_type TEXT;
  v_permission_level public.permission_level;
  v_has_admin_row BOOLEAN;
  v_is_creator BOOLEAN;
  v_has_organizer_role BOOLEAN;
BEGIN
  IF p_user_id IS NULL OR p_trip_id IS NULL THEN
    RETURN 'consumer_guest';
  END IF;

  IF public.is_super_admin() AND p_user_id = auth.uid() THEN
    RETURN 'super_admin';
  END IF;

  IF NOT public.is_active_trip_member(p_user_id, p_trip_id) THEN
    RETURN 'consumer_guest';
  END IF;

  SELECT COALESCE(trip_type, 'consumer') INTO v_trip_type
  FROM public.trips
  WHERE id = p_trip_id;

  IF v_trip_type IS NULL OR v_trip_type = 'consumer' THEN
    RETURN 'consumer_member';
  END IF;

  IF v_trip_type = 'event' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = p_trip_id AND t.created_by = p_user_id
    ) INTO v_is_creator;

    SELECT EXISTS (
      SELECT 1 FROM public.trip_admins ta
      WHERE ta.trip_id = p_trip_id AND ta.user_id = p_user_id
    ) INTO v_has_admin_row;

    SELECT EXISTS (
      SELECT 1
      FROM public.user_trip_roles utr
      JOIN public.trip_roles tr ON tr.id = utr.role_id
      WHERE utr.trip_id = p_trip_id
        AND utr.user_id = p_user_id
        AND (
          lower(tr.role_name) IN ('organizer', 'admin')
          OR tr.permission_level = 'admin'::public.permission_level
        )
    ) INTO v_has_organizer_role;

    IF v_is_creator OR v_has_admin_row OR v_has_organizer_role THEN
      RETURN 'event_organizer';
    END IF;

    RETURN 'event_attendee';
  END IF;

  -- Pro trips
  SELECT EXISTS (
    SELECT 1 FROM public.trip_admins ta
    WHERE ta.trip_id = p_trip_id AND ta.user_id = p_user_id
  ) INTO v_has_admin_row;

  SELECT tr.permission_level INTO v_permission_level
  FROM public.user_trip_roles utr
  JOIN public.trip_roles tr ON tr.id = utr.role_id
  WHERE utr.trip_id = p_trip_id
    AND utr.user_id = p_user_id
    AND utr.is_primary = TRUE
  LIMIT 1;

  IF v_has_admin_row OR v_permission_level = 'admin'::public.permission_level THEN
    RETURN 'pro_admin';
  END IF;

  IF v_permission_level = 'edit'::public.permission_level THEN
    RETURN 'pro_editor';
  END IF;

  IF v_permission_level = 'view'::public.permission_level THEN
    RETURN 'pro_viewer';
  END IF;

  -- Pro member without explicit role assignment defaults to editor (client parity)
  RETURN 'pro_editor';
END;
$$;

CREATE OR REPLACE FUNCTION public.can_trip_actor_for_user(
  p_user_id UUID,
  p_trip_id TEXT,
  p_resource TEXT,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := public.resolve_trip_permission_role(p_user_id, p_trip_id);
  RETURN public.permission_matrix_allows(v_role, p_resource, p_action);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_trip_actor(
  p_trip_id TEXT,
  p_resource TEXT,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN public.can_trip_actor_for_user(auth.uid(), p_trip_id, p_resource, p_action);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_trip_mutation_permissions(p_trip_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_trip_type TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object(
      'role', 'consumer_guest',
      'trip_type', 'consumer',
      'can_create_task', FALSE,
      'can_edit_task', FALSE,
      'can_delete_task', FALSE,
      'can_create_poll', FALSE,
      'can_close_poll', FALSE,
      'can_delete_poll', FALSE,
      'can_create_event', FALSE,
      'can_edit_event', FALSE,
      'can_delete_event', FALSE,
      'can_set_basecamp', FALSE,
      'can_save_link', FALSE
    );
  END IF;

  v_role := public.resolve_trip_permission_role(auth.uid(), p_trip_id);

  SELECT COALESCE(trip_type, 'consumer') INTO v_trip_type
  FROM public.trips
  WHERE id = p_trip_id;

  RETURN json_build_object(
    'role', v_role,
    'trip_type', COALESCE(v_trip_type, 'consumer'),
    'can_create_task', public.permission_matrix_allows(v_role, 'tasks', 'write'),
    'can_edit_task', public.permission_matrix_allows(v_role, 'tasks', 'write'),
    'can_delete_task', public.permission_matrix_allows(v_role, 'tasks', 'delete'),
    'can_create_poll', public.permission_matrix_allows(v_role, 'polls', 'write'),
    'can_close_poll', public.permission_matrix_allows(v_role, 'polls', 'admin'),
    'can_delete_poll', public.permission_matrix_allows(v_role, 'polls', 'delete'),
    'can_create_event', public.permission_matrix_allows(v_role, 'calendar', 'write'),
    'can_edit_event', public.permission_matrix_allows(v_role, 'calendar', 'write'),
    'can_delete_event', public.permission_matrix_allows(v_role, 'calendar', 'delete'),
    'can_set_basecamp', public.permission_matrix_allows(v_role, 'basecamp', 'admin'),
    'can_save_link', public.permission_matrix_allows(v_role, 'links', 'write')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_trip_actor(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_trip_actor_for_user(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_trip_mutation_permissions(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_trip_permission_role(UUID, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Mutation audit log (high-risk shared writes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trip_mutation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL,
  object_id TEXT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  action TEXT NOT NULL,
  mutation_id UUID,
  idempotency_key TEXT,
  before_version INTEGER,
  after_version INTEGER,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_mutation_log_trip_created
  ON public.trip_mutation_log (trip_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_mutation_log_idempotency
  ON public.trip_mutation_log (trip_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.trip_mutation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip members can read mutation log" ON public.trip_mutation_log;
CREATE POLICY "Trip members can read mutation log"
  ON public.trip_mutation_log
  FOR SELECT
  TO authenticated
  USING (public.is_active_trip_member(auth.uid(), trip_id));

DROP POLICY IF EXISTS "Service role manages mutation log" ON public.trip_mutation_log;
CREATE POLICY "Service role manages mutation log"
  ON public.trip_mutation_log
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE OR REPLACE FUNCTION public.log_trip_mutation(
  p_trip_id TEXT,
  p_object_type TEXT,
  p_object_id TEXT,
  p_actor_id UUID,
  p_source_type TEXT,
  p_action TEXT,
  p_mutation_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_before_version INTEGER DEFAULT NULL,
  p_after_version INTEGER DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.trip_mutation_log (
    trip_id,
    object_type,
    object_id,
    actor_id,
    source_type,
    action,
    mutation_id,
    idempotency_key,
    before_version,
    after_version,
    details
  ) VALUES (
    p_trip_id,
    p_object_type,
    p_object_id,
    p_actor_id,
    COALESCE(p_source_type, 'manual'),
    p_action,
    p_mutation_id,
    p_idempotency_key,
    p_before_version,
    p_after_version,
    COALESCE(p_details, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_trip_mutation(
  TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT, INTEGER, INTEGER, JSONB
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS: shared-object writes must pass resolver (read stays membership-based)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Trip members can create tasks" ON public.trip_tasks;
CREATE POLICY "Trip members can create tasks" ON public.trip_tasks
  FOR INSERT
  WITH CHECK (
    public.is_active_trip_member(auth.uid(), trip_id)
    AND public.can_trip_actor(trip_id, 'tasks', 'write')
    AND creator_id = auth.uid()
  );

DROP POLICY IF EXISTS "Task creators and admins can update tasks" ON public.trip_tasks;
CREATE POLICY "Resolver-gated task updates" ON public.trip_tasks
  FOR UPDATE
  USING (
    public.is_active_trip_member(auth.uid(), trip_id)
    AND public.can_trip_actor(trip_id, 'tasks', 'write')
    AND (creator_id = auth.uid() OR public.can_trip_actor(trip_id, 'tasks', 'admin'))
  );

DROP POLICY IF EXISTS "Task creators and admins can delete tasks" ON public.trip_tasks;
CREATE POLICY "Resolver-gated task deletes" ON public.trip_tasks
  FOR DELETE
  USING (
    public.is_active_trip_member(auth.uid(), trip_id)
    AND public.can_trip_actor(trip_id, 'tasks', 'delete')
    AND (creator_id = auth.uid() OR public.can_trip_actor(trip_id, 'tasks', 'admin'))
  );

DROP POLICY IF EXISTS "Trip members can create polls" ON public.trip_polls;
CREATE POLICY "Trip members can create polls" ON public.trip_polls
  FOR INSERT
  WITH CHECK (
    public.is_active_trip_member(auth.uid(), trip_id)
    AND public.can_trip_actor(trip_id, 'polls', 'write')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Poll creators can update their polls" ON public.trip_polls;
DROP POLICY IF EXISTS "Poll creators and admins can update polls" ON public.trip_polls;
CREATE POLICY "Resolver-gated poll updates" ON public.trip_polls
  FOR UPDATE
  USING (
    public.is_active_trip_member(auth.uid(), trip_id)
    AND (
      (created_by = auth.uid() AND public.can_trip_actor(trip_id, 'polls', 'write'))
      OR public.can_trip_actor(trip_id, 'polls', 'admin')
    )
  );

DROP POLICY IF EXISTS "Poll creators can delete their polls" ON public.trip_polls;
DROP POLICY IF EXISTS "Poll creators and admins can delete polls" ON public.trip_polls;
CREATE POLICY "Resolver-gated poll deletes" ON public.trip_polls
  FOR DELETE
  USING (
    public.is_active_trip_member(auth.uid(), trip_id)
    AND public.can_trip_actor(trip_id, 'polls', 'delete')
    AND (created_by = auth.uid() OR public.can_trip_actor(trip_id, 'polls', 'admin'))
  );

DROP POLICY IF EXISTS "Trip members can create events" ON public.trip_events;
CREATE POLICY "Trip members can create events" ON public.trip_events
  FOR INSERT
  WITH CHECK (
    public.is_active_trip_member(auth.uid(), trip_id::text)
    AND public.can_trip_actor(trip_id::text, 'calendar', 'write')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Event creators and admins can update events" ON public.trip_events;
CREATE POLICY "Resolver-gated event updates" ON public.trip_events
  FOR UPDATE
  USING (
    public.is_active_trip_member(auth.uid(), trip_id::text)
    AND public.can_trip_actor(trip_id::text, 'calendar', 'write')
    AND (created_by = auth.uid() OR public.can_trip_actor(trip_id::text, 'calendar', 'admin'))
  );

DROP POLICY IF EXISTS "Event creators and admins can delete events" ON public.trip_events;
CREATE POLICY "Resolver-gated event deletes" ON public.trip_events
  FOR DELETE
  USING (
    public.is_active_trip_member(auth.uid(), trip_id::text)
    AND public.can_trip_actor(trip_id::text, 'calendar', 'delete')
    AND (created_by = auth.uid() OR public.can_trip_actor(trip_id::text, 'calendar', 'admin'))
  );

DROP POLICY IF EXISTS "Trip members can create links" ON public.trip_links;
DROP POLICY IF EXISTS "Trip members can insert links" ON public.trip_links;
CREATE POLICY "Resolver-gated link inserts" ON public.trip_links
  FOR INSERT
  WITH CHECK (
    public.is_active_trip_member(auth.uid(), trip_id)
    AND public.can_trip_actor(trip_id, 'links', 'write')
    AND added_by = auth.uid()
  );

COMMENT ON FUNCTION public.can_trip_actor IS
  'Canonical permission resolver entrypoint: can(auth.uid(), trip, resource, action).';

COMMENT ON FUNCTION public.get_trip_mutation_permissions IS
  'Returns flat mutation permission flags for the calling user on a trip.';
