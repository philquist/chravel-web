-- Seed the kill switch for silent push auto-registration on app start.
--
-- src/hooks/usePushAutoRegister.ts reads useFeatureFlag('push_notifications_auto_register', true)
-- and its doc comment notes the DB row seed was a tracked follow-up. This seeds
-- it ENABLED at 100% rollout so the flag row exists for admins to flip off
-- (takes effect within ~60s, no redeploy) without changing the default behaviour.

INSERT INTO public.feature_flags (key, enabled, rollout_percentage, description) VALUES
  ('push_notifications_auto_register', true, 100,
   'Silently re-register push tokens on app start when permission is granted — disable to stop auto-registration')
ON CONFLICT (key) DO NOTHING;
