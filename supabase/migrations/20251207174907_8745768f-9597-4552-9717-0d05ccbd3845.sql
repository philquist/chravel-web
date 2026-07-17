-- Grant super admin privileges to bootstrap founder (email scrubbed; see docs/ops/super-admin-bootstrap.md)
UPDATE public.profiles 
SET 
  subscription_status = 'active',
  subscription_product_id = 'prod_super_admin_unlimited',
  role = 'super_admin',
  app_role = 'super_admin',
  free_pro_trip_limit = 999,
  free_event_limit = 999,
  free_pro_trips_used = 0,
  free_events_used = 0
WHERE email = current_setting('app.bootstrap_admin_email', true);
-- Historical: original literal scrubbed. Row was already granted in prod.