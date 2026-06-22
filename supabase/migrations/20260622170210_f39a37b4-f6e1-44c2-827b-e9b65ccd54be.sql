
-- 1. Backfill user_id on super_admins from auth.users by email
UPDATE public.super_admins sa
SET user_id = u.id
FROM auth.users u
WHERE sa.user_id IS NULL
  AND lower(u.email) = lower(sa.email);

-- 2. Harden is_super_admin: prefer UUID match; allow email fallback only for unlinked rows
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE revoked_at IS NULL
      AND (
        user_id = auth.uid()
        OR (
          user_id IS NULL
          AND auth.uid() IS NOT NULL
          AND email = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
  );
$$;

-- 3. Auto-link user_id when a pre-granted super admin (by email) signs up
CREATE OR REPLACE FUNCTION public.link_super_admin_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.super_admins
  SET user_id = NEW.id
  WHERE user_id IS NULL
    AND lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS link_super_admin_on_signup_trg ON auth.users;
CREATE TRIGGER link_super_admin_on_signup_trg
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.link_super_admin_on_signup();

-- 4. Document sensitive tables to prevent future policy mistakes
COMMENT ON TABLE public.profiles IS
  'Contains sensitive billing (stripe_customer_id, stripe_subscription_id) and contact (email, phone, real_name) fields. The SELECT policy MUST remain owner-scoped (auth.uid() = user_id). Do NOT add peer-read policies on this table; create a separate view exposing only display_name/avatar_url if peer visibility is needed.';

COMMENT ON COLUMN public.profiles.stripe_customer_id IS 'SENSITIVE: never expose via peer-read policies.';
COMMENT ON COLUMN public.profiles.stripe_subscription_id IS 'SENSITIVE: never expose via peer-read policies.';
COMMENT ON COLUMN public.profiles.phone IS 'SENSITIVE: owner-only.';
COMMENT ON COLUMN public.profiles.email IS 'SENSITIVE: owner-only.';
COMMENT ON COLUMN public.profiles.real_name IS 'SENSITIVE: owner-only.';

COMMENT ON TABLE public.notification_deliveries IS
  'Recipient contact details (email/phone) and provider message IDs. Intentionally fail-closed: only service_role may access. Do NOT add an authenticated SELECT policy without strict per-user scoping (recipient_user_id = auth.uid()).';
