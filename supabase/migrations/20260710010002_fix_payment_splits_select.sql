-- Fix F-18: the payment_splits SELECT policy's visibility check was a literal `(true)`
-- inside an EXISTS on the parent trip_payment_messages, so it only confirmed the parent row
-- existed — it did NOT apply the parent's membership/trip-type visibility. In effect any
-- authenticated caller who referenced a payment_message_id could read its splits.
--
-- Fix: mirror the parent trip_payment_messages SELECT predicate (active trip membership +
-- trip-type gating: consumer = any member; pro/event = message creator, debtor, trip admin,
-- or a role with payments.can_view), plus a short-circuit so a split's own debtor always
-- sees it. This only tightens access — members who could already see the parent message,
-- and debtors, still see the split; unrelated users no longer do.

DROP POLICY IF EXISTS "Trip members can view payment splits" ON public.payment_splits;
CREATE POLICY "Trip members can view payment splits"
ON public.payment_splits
FOR SELECT
USING (
  debtor_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.trip_payment_messages tpm
    JOIN public.trips t ON t.id = tpm.trip_id
    JOIN public.trip_members tm
      ON tm.trip_id = tpm.trip_id
      AND tm.user_id = auth.uid()
    WHERE tpm.id = public.payment_splits.payment_message_id
      AND (
        t.trip_type = 'consumer'
        OR (
          t.trip_type IN ('pro', 'event') AND (
            tpm.created_by = auth.uid()
            OR public.is_payment_debtor(tpm.id, auth.uid())
            OR EXISTS (
              SELECT 1 FROM public.trip_admins ta
              WHERE ta.trip_id = t.id AND ta.user_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1 FROM public.user_trip_roles utr
              JOIN public.trip_roles tr ON utr.role_id = tr.id
              WHERE utr.user_id = auth.uid()
                AND utr.trip_id = tpm.trip_id
                AND (tr.feature_permissions -> 'payments' ->> 'can_view')::boolean = true
            )
          )
        )
      )
  )
);
