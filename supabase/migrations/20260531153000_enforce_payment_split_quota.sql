CREATE OR REPLACE FUNCTION public.create_payment_with_splits_v2(
  p_trip_id text,
  p_amount numeric,
  p_currency text,
  p_description text,
  p_split_count integer,
  p_split_participants jsonb,
  p_payment_methods jsonb,
  p_created_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payment_id uuid;
  participant uuid;
  split_amount numeric;
  effective_plan text := 'free';
  payment_limit integer := 3;
  existing_payment_count integer := 0;
BEGIN
  IF p_split_count IS NULL OR p_split_count <= 0 THEN
    RAISE EXCEPTION 'Payment split count must be greater than zero';
  END IF;

  SELECT COALESCE(ue.plan, 'free')
  INTO effective_plan
  FROM user_entitlements ue
  WHERE ue.user_id = p_created_by
    AND ue.plan <> 'free'
    AND (
      ue.status IN ('active', 'trialing', 'past_due')
      OR (
        ue.status = 'canceled'
        AND ue.current_period_end IS NOT NULL
        AND ue.current_period_end > now()
      )
    )
  ORDER BY CASE ue.plan
    WHEN 'pro-enterprise' THEN 6
    WHEN 'pro-growth' THEN 5
    WHEN 'pro-starter' THEN 4
    WHEN 'frequent-chraveler' THEN 3
    WHEN 'explorer' THEN 2
    ELSE 1
  END DESC
  LIMIT 1;

  payment_limit := CASE effective_plan
    WHEN 'explorer' THEN 10
    WHEN 'frequent-chraveler' THEN -1
    WHEN 'pro-starter' THEN -1
    WHEN 'pro-growth' THEN -1
    WHEN 'pro-enterprise' THEN -1
    ELSE 3
  END;

  IF payment_limit >= 0 THEN
    SELECT COUNT(*)
    INTO existing_payment_count
    FROM trip_payment_messages
    WHERE trip_id = p_trip_id
      AND created_by = p_created_by;

    IF existing_payment_count >= payment_limit THEN
      RAISE EXCEPTION 'Payment request limit reached for current plan';
    END IF;
  END IF;

  split_amount := p_amount / p_split_count;

  INSERT INTO trip_payment_messages (
    trip_id, amount, currency, description, split_count,
    split_participants, payment_methods, created_by
  ) VALUES (
    p_trip_id, p_amount, p_currency, p_description, p_split_count,
    p_split_participants, p_payment_methods, p_created_by
  ) RETURNING id INTO payment_id;

  FOR participant IN SELECT jsonb_array_elements_text(p_split_participants)::uuid
  LOOP
    INSERT INTO payment_splits (
      payment_message_id, debtor_user_id, amount_owed
    ) VALUES (
      payment_id, participant, split_amount
    );
  END LOOP;

  INSERT INTO payment_audit_log (payment_message_id, action, actor_user_id, metadata)
  VALUES (
    payment_id,
    'created',
    p_created_by,
    jsonb_build_object('amount', p_amount, 'currency', p_currency)
  );

  RETURN payment_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Payment creation failed: %', SQLERRM;
END;
$$;
