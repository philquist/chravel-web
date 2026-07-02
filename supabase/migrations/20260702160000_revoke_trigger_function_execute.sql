-- P2 hardening: lock down direct RPC execution of SECURITY DEFINER *trigger*
-- functions.
--
-- These functions are only ever invoked implicitly by row triggers. Because they
-- are SECURITY DEFINER and live in the `public` schema, PostgREST also exposes
-- them at `/rest/v1/rpc/<name>` and (per the Supabase security advisor
-- 0028/0029) they are callable by the `anon` and `authenticated` roles. A direct
-- call runs the definer-privileged body outside of any triggering statement —
-- e.g. `broadcast_chat_message`, `notify_on_*`, `log_role_change`,
-- `sync_trip_member_count`, `create_org_owner_membership` — which is never
-- intended and is an attack surface for forging notifications/broadcasts or
-- tampering with audit/membership state.
--
-- Trigger execution itself is NOT governed by the EXECUTE privilege (triggers
-- fire under the table-owner context), and Supabase edge functions call the
-- database with the `service_role` key, which is unaffected by these REVOKEs.
-- So removing anon/authenticated/PUBLIC EXECUTE is defense-in-depth with no
-- behavioral impact on triggers, RLS, membership/access checks, or server-side
-- flows. It cannot cause Trip Not Found, auth desync, RLS leaks, or payment
-- drift because it changes no policy, no query, and no client data path — only
-- who may directly invoke internal trigger bodies as an RPC.
--
-- Forward-only: to reintroduce a function here as a real RPC, GRANT EXECUTE to
-- the intended role in a later migration.

DO $$
DECLARE
  fn text;
  trigger_only_fns text[] := ARRAY[
    'public.auto_archive_channel_on_role_delete()',
    'public.auto_create_channel_for_new_role()',
    'public.auto_create_channel_for_role()',
    'public.auto_process_document()',
    'public.broadcast_chat_message()',
    'public.compute_admin_audit_hash()',
    'public.create_org_owner_membership()',
    'public.ensure_creator_is_member()',
    'public.handle_new_user()',
    'public.handle_new_user_notification_preferences()',
    'public.initialize_pro_trip_admin()',
    'public.initialize_trip_privacy_config()',
    'public.link_pro_trip_to_org()',
    'public.link_super_admin_on_signup()',
    'public.log_role_change()',
    'public.log_super_admin_change()',
    'public.notify_on_basecamp_update()',
    'public.notify_on_broadcast()',
    'public.notify_on_calendar_event()',
    'public.notify_on_chat_message()',
    'public.notify_on_poll_created()',
    'public.sync_trip_member_count()',
    'public.update_preferences_updated_at()',
    'public.update_updated_at_column()',
    'public.update_updated_at_trip_tasks()'
  ];
BEGIN
  FOREACH fn IN ARRAY trigger_only_fns LOOP
    -- Skip gracefully if a function was renamed/removed in a later migration.
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn);
    END IF;
  END LOOP;
END;
$$;
