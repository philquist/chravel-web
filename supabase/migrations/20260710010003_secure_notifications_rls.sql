-- Fix F-19: the base public.notifications table had no RLS policy in the migration history.
-- If RLS is disabled, PostgREST access is governed only by table grants, so an authenticated
-- user could potentially read other users' notifications. Enable RLS and scope access to the
-- recipient (user_id).
--
-- Safety:
--   * The table is created outside the tracked migrations, so this is guarded by an existence
--     check (to_regclass) — on a migrations-only shadow/CI database where the table is absent,
--     it safely no-ops instead of failing.
--   * All notification INSERTs are performed by service-role edge functions and SECURITY
--     DEFINER fanout triggers, both of which bypass RLS, so delivery is unaffected.
--   * Recipients keep full access to their own rows: SELECT (list), UPDATE (mark read /
--     toggle visibility) and DELETE (dismiss). Realtime delivery is already topic-scoped to
--     'notifications:' || auth.uid(), so this aligns table access with realtime access.

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE NOTICE 'public.notifications not found; skipping notifications RLS hardening';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'user_id'
  ) THEN
    RAISE NOTICE 'public.notifications has no user_id column; skipping notifications RLS hardening';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications';
  EXECUTE 'CREATE POLICY "Users can view their own notifications" ON public.notifications
             FOR SELECT USING (user_id = auth.uid())';

  EXECUTE 'DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications';
  EXECUTE 'CREATE POLICY "Users can update their own notifications" ON public.notifications
             FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';

  EXECUTE 'DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications';
  EXECUTE 'CREATE POLICY "Users can delete their own notifications" ON public.notifications
             FOR DELETE USING (user_id = auth.uid())';
END $$;
