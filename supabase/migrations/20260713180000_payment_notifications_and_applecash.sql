-- ============================================================================
-- Wire payment push notifications to trip_payment_messages + allow applecash.
--
-- ROOT CAUSE:
--   notify_on_payment() + trigger_notify_payment targeted the legacy
--   public.trip_payments table (payer_id / title columns). That table is not
--   present on ChravelApp prod — live expenses write to trip_payment_messages
--   — so new payment requests never fan out push/in-app notifications.
--
-- FIX (no RLS / auth / trip-access changes; notification fanout only):
--   1. Rewrite notify_on_payment to read trip_payment_messages columns
--      (created_by, description, amount, currency) and call the TEXT trip_id
--      fanout helper (20260709130000).
--   2. Drop any stale trigger on trip_payments (if table exists); create trigger
--      on trip_payment_messages AFTER INSERT.
--   3. Expand user_payment_methods.method_type CHECK to include applecash
--      (client already offers it; DB was rejecting inserts).
--
-- Idempotent / backward-safe: CREATE OR REPLACE + DROP IF EXISTS.
-- Does not alter payment_splits settlement state or trip membership checks.
-- ============================================================================

-- 1) Notification wrapper for the live payment table
CREATE OR REPLACE FUNCTION public.notify_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount_text TEXT;
BEGIN
  -- Skip non-uuid / demo trip ids (notifications.trip_id is UUID).
  IF NEW.trip_id IS NULL OR NEW.trip_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_amount_text := to_char(NEW.amount, 'FM999999990.00') || ' ' || COALESCE(NEW.currency, 'USD');
  EXCEPTION WHEN OTHERS THEN
    v_amount_text := COALESCE(NEW.currency, 'USD');
  END;

  PERFORM public.create_notification_for_trip_members(
    NEW.trip_id::text,
    NEW.created_by,
    'payment',
    'payment',
    NEW.id,
    'payments',
    'high',
    '/trip/' || NEW.trip_id::text || '?tab=payments',
    'New payment request',
    COALESCE(NEW.description, 'Payment update') || ' · ' || v_amount_text,
    jsonb_build_object(
      'payment_id', NEW.id,
      'amount', NEW.amount,
      'currency', NEW.currency,
      'description', NEW.description
    ),
    'payment:' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

-- 2) Retarget trigger onto the live table (guard legacy table — may not exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trip_payments'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trigger_notify_payment ON public.trip_payments';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trigger_notify_payment ON public.trip_payment_messages;
CREATE TRIGGER trigger_notify_payment
  AFTER INSERT ON public.trip_payment_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_payment();

-- 3) Allow Apple Cash as a saved preferred method (client already supports it)
ALTER TABLE public.user_payment_methods
  DROP CONSTRAINT IF EXISTS user_payment_methods_method_type_check;

ALTER TABLE public.user_payment_methods
  ADD CONSTRAINT user_payment_methods_method_type_check
  CHECK (method_type = ANY (ARRAY[
    'venmo'::text,
    'zelle'::text,
    'cashapp'::text,
    'applepay'::text,
    'applecash'::text,
    'paypal'::text,
    'cash'::text,
    'other'::text
  ]));
