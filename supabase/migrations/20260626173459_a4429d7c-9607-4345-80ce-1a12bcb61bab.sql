DROP FUNCTION IF EXISTS public.grant_super_admin(text, text);

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid() AND revoked_at IS NULL);
$$;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
COMMENT ON FUNCTION public.is_super_admin IS
  'Returns true only when auth.uid() matches an active public.super_admins.user_id row; email is not an authorization fallback.';

CREATE OR REPLACE FUNCTION public.grant_super_admin(target_email text, reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE target_user_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Only super admins can grant super admin access'; END IF;
  SELECT id INTO target_user_id FROM auth.users WHERE lower(email) = lower(target_email) LIMIT 1;
  IF target_user_id IS NULL THEN RAISE EXCEPTION 'Cannot grant super admin access to an email without an auth user'; END IF;
  INSERT INTO public.super_admins (email, user_id, granted_by, note)
  VALUES (lower(target_email), target_user_id, auth.uid(), reason)
  ON CONFLICT (email) DO UPDATE SET
    user_id = EXCLUDED.user_id, revoked_at = NULL,
    granted_by = EXCLUDED.granted_by,
    note = COALESCE(EXCLUDED.note, public.super_admins.note);
END;
$$;

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notifications realtime: owner only" ON realtime.messages;
DROP POLICY IF EXISTS "Users can only subscribe to their own profile topic" ON realtime.messages;
CREATE POLICY "Notifications realtime: owner only"
  ON realtime.messages FOR SELECT TO authenticated
  USING (realtime.topic() = 'notifications:' || auth.uid()::text);
CREATE POLICY "Users can only subscribe to their own profile topic"
  ON realtime.messages FOR SELECT TO authenticated
  USING (realtime.topic() = 'profiles:' || auth.uid()::text);

-- Lock down any present push/capacity helpers regardless of exact arg list.
DO $guard$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_trip_member_push_tokens','send_push_to_trip_members',
                        'get_trip_member_limit','is_trip_at_member_capacity')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, authenticated', r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role', r.nspname, r.proname, r.args);
  END LOOP;
END
$guard$;

CREATE OR REPLACE FUNCTION public.match_trip_embeddings(
  query_embedding vector, trip_id_input text,
  match_threshold double precision DEFAULT 0.7, match_count integer DEFAULT 10
)
RETURNS TABLE (id uuid, source_type text, source_id uuid, content_text text, similarity double precision, metadata jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions
AS $$
  SELECT trip_embeddings.id, trip_embeddings.source_type, trip_embeddings.source_id,
    trip_embeddings.content_text,
    1 - (trip_embeddings.embedding <=> query_embedding) AS similarity,
    trip_embeddings.metadata
  FROM public.trip_embeddings
  WHERE trip_embeddings.trip_id = trip_id_input
    AND trip_embeddings.embedding IS NOT NULL
    AND 1 - (trip_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC LIMIT match_count;
$$;
REVOKE EXECUTE ON FUNCTION public.match_trip_embeddings(vector, text, double precision, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.match_trip_embeddings(vector, text, double precision, integer) TO authenticated;
