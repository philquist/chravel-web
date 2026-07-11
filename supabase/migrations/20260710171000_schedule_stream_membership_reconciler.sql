-- Schedule the Stream membership reconciler.
--
-- stream-reconcile-membership existed but was NEVER scheduled — so nothing kept Stream
-- channel membership in sync with the database, and any fire-and-forget add/remove that
-- failed stayed broken until a user complained. Register a pg_cron job that invokes the
-- reconciler's GET (cron) path every 15 minutes with a service-role bearer (which the
-- function's verifyCronAuth accepts) and a full batch. Idempotent.
--
-- Applied via the normal migration flow on merge so it lands together with the expanded
-- reconciler code (pro-channel coverage + stale pruning). NOTE (scale): a single call
-- reconciles up to batchSize trips (all channel types) and issues Stream API calls per
-- channel. batchSize=100 covers the current base in one run; at larger scale, page via the
-- function's cursor/nextCursor and/or lower the frequency to stay within Stream rate limits.
--
-- ⚠️ OPERATOR PREREQUISITE (cron auth): this job authenticates with a service-role bearer
-- read from `current_setting('app.settings.service_role_key', true)`, matching the existing
-- chravel-process-account-deletions job. As of 2026-07-11 that GUC is NOT configured in this
-- project (no database-, role-, or vault-level setting), so the bearer resolves empty and the
-- reconciler's GET is rejected 401 by verifyCronAuth — the SAME latent failure that silently
-- breaks every other edge-function cron here. This backstop therefore stays dormant until an
-- operator provisions the secret ONCE (never commit the key), e.g.:
--     ALTER DATABASE postgres SET app.settings.service_role_key = '<service-role-key>';
--   -- or store it in Vault and read it via vault.decrypted_secrets.
-- Until then, Stream membership still converges via the two client-side provisioning paths
-- (useStreamProChannel open-time self-heal + useRoleAssignments post-mutation reconcile),
-- which invoke the function with the user's JWT and do NOT depend on this cron.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE NOTICE 'cron schema not available; skipping stream-reconcile-membership schedule.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chravel-stream-reconcile-membership') THEN
    PERFORM cron.unschedule('chravel-stream-reconcile-membership');
  END IF;

  PERFORM cron.schedule(
    'chravel-stream-reconcile-membership',
    '*/15 * * * *',
    $cron$
    SELECT net.http_get(
      url := 'https://jmjiyekmxwsxkfnqwyaa.supabase.co/functions/v1/stream-reconcile-membership?batchSize=100',
      headers := ('{"Content-Type":"application/json","Authorization":"Bearer ' ||
                  current_setting('app.settings.service_role_key', true) || '"}')::jsonb
    );
    $cron$
  );
END $$;
