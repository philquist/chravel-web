-- Fix PRIVILEGE_ESCALATION: profiles UPDATE policy had no WITH CHECK, so users
-- could patch app_role/role/subscription_*/free_* on their own row and grant
-- themselves admin or unlimited-quota access. Lock down mutable columns.

-- Drop the permissive self-update policy (name from finding).
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Trigger enforces that authenticated users cannot change any authorization
-- or entitlement column. Service role and super admins bypass. Column list
-- covers every entitlement/role field currently on profiles.
CREATE OR REPLACE FUNCTION public.enforce_profile_self_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_service boolean := (current_setting('request.jwt.claim.role', true) = 'service_role')
                        OR (auth.role() = 'service_role');
  is_admin   boolean := coalesce(public.is_super_admin(), false);
BEGIN
  IF is_service OR is_admin THEN
    RETURN NEW;
  END IF;

  -- Block any client-driven change to authorization / entitlement columns.
  IF NEW.app_role                IS DISTINCT FROM OLD.app_role
     OR NEW.role                 IS DISTINCT FROM OLD.role
     OR NEW.subscription_status  IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_end     IS DISTINCT FROM OLD.subscription_end
     OR NEW.free_event_limit     IS DISTINCT FROM OLD.free_event_limit
     OR NEW.free_pro_trip_limit  IS DISTINCT FROM OLD.free_pro_trip_limit
     OR NEW.free_events_used     IS DISTINCT FROM OLD.free_events_used
     OR NEW.free_pro_trips_used  IS DISTINCT FROM OLD.free_pro_trips_used
     -- Identity columns must never be reassigned by the row's owner.
     OR NEW.user_id              IS DISTINCT FROM OLD.user_id
     OR NEW.email                IS DISTINCT FROM OLD.email
  THEN
    RAISE EXCEPTION 'profiles: cannot modify authorization/entitlement columns from client'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_self_update_scope ON public.profiles;
CREATE TRIGGER enforce_profile_self_update_scope
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_self_update_scope();

-- Recreate the self-update policy with an explicit WITH CHECK pinning ownership
-- (defense in depth alongside the trigger).
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
