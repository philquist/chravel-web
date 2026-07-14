
-- Fix 1: payment_splits creator UPDATE policy — pin immutable fields via WITH CHECK
DROP POLICY IF EXISTS "Payment creators can update splits for their payments" ON public.payment_splits;
CREATE POLICY "Payment creators can update splits for their payments"
ON public.payment_splits
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.trip_payment_messages tpm
    WHERE tpm.id = payment_splits.payment_message_id
      AND tpm.created_by = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trip_payment_messages tpm
    WHERE tpm.id = payment_splits.payment_message_id
      AND tpm.created_by = (SELECT auth.uid())
  )
  AND NOT (payment_message_id IS DISTINCT FROM (SELECT ps.payment_message_id FROM public.payment_splits ps WHERE ps.id = payment_splits.id))
  AND NOT (debtor_user_id IS DISTINCT FROM (SELECT ps.debtor_user_id FROM public.payment_splits ps WHERE ps.id = payment_splits.id))
  AND NOT (confirmation_status IS DISTINCT FROM (SELECT ps.confirmation_status FROM public.payment_splits ps WHERE ps.id = payment_splits.id))
  AND NOT (confirmed_by IS DISTINCT FROM (SELECT ps.confirmed_by FROM public.payment_splits ps WHERE ps.id = payment_splits.id))
  AND NOT (confirmed_at IS DISTINCT FROM (SELECT ps.confirmed_at FROM public.payment_splits ps WHERE ps.id = payment_splits.id))
);

-- Fix 2: trip_admins default scope — backfill existing rows explicitly, then require explicit 'full'
UPDATE public.trip_admins
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object('admin_scope', 'full')
WHERE permissions IS NULL OR NOT (permissions ? 'admin_scope');

CREATE OR REPLACE FUNCTION public.is_full_trip_admin(_user_id uuid, _trip_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_admins
    WHERE user_id = _user_id AND trip_id = _trip_id
      AND permissions->>'admin_scope' = 'full'
  )
$function$;

CREATE OR REPLACE FUNCTION public.has_coordinator_capability(_user_id uuid, _trip_id text, _capability text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_admins
    WHERE user_id = _user_id AND trip_id = _trip_id
      AND (
        permissions->>'admin_scope' = 'full'
        OR COALESCE((permissions->>_capability)::boolean, false) = true
      )
  )
$function$;
