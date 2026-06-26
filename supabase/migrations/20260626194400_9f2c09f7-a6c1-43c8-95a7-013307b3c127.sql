-- 1. Ensure RLS on realtime.messages
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- 2. Recreate notifications + profiles realtime topic policies
DROP POLICY IF EXISTS "Notifications realtime: owner only" ON realtime.messages;
CREATE POLICY "Notifications realtime: owner only"
ON realtime.messages
FOR SELECT
TO authenticated
USING (realtime.topic() = ('notifications:' || (auth.uid())::text));

DROP POLICY IF EXISTS "Users can only subscribe to their own profile topic" ON realtime.messages;
CREATE POLICY "Users can only subscribe to their own profile topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (realtime.topic() = ('profiles:' || (auth.uid())::text));

-- 3. Revoke push-token RPCs from anon/authenticated; grant only to service_role.
--    Done conditionally because the RPCs may not be deployed in every environment.
DO $$
DECLARE
  fn_name text;
  fn_oid oid;
BEGIN
  FOREACH fn_name IN ARRAY ARRAY[
    'claim_pending_push_tokens',
    'mark_push_token_delivery_attempt',
    'release_stale_push_tokens'
  ] LOOP
    FOR fn_oid IN
      SELECT p.oid FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname = fn_name
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                     fn_name, pg_get_function_identity_arguments(fn_oid));
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
                     fn_name, pg_get_function_identity_arguments(fn_oid));
    END LOOP;
  END LOOP;
END $$;

-- 4. Recreate match_trip_embeddings as SECURITY INVOKER (preserve existing signature).
DO $$
DECLARE
  fn_args text;
BEGIN
  SELECT pg_get_function_identity_arguments(oid) INTO fn_args
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace AND proname = 'match_trip_embeddings'
  LIMIT 1;

  IF fn_args IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION public.match_trip_embeddings(%s) SECURITY INVOKER', fn_args);
    EXECUTE format('ALTER FUNCTION public.match_trip_embeddings(%s) SET search_path = public', fn_args);
  END IF;
END $$;

-- 5. Lock down trip-capacity helper RPCs to service_role (conditional).
DO $$
DECLARE
  fn_name text;
  fn_oid oid;
BEGIN
  FOREACH fn_name IN ARRAY ARRAY[
    'get_trip_member_limit',
    'is_trip_at_member_capacity'
  ] LOOP
    FOR fn_oid IN
      SELECT p.oid FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname = fn_name
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                     fn_name, pg_get_function_identity_arguments(fn_oid));
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
                     fn_name, pg_get_function_identity_arguments(fn_oid));
    END LOOP;
  END LOOP;
END $$;