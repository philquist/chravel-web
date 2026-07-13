-- ============================================================================
-- Support custom / percentage payment splits via optional per-participant amounts.
--
-- REGRESSION SAFETY:
--   - No auth/trip-access changes (same creator + membership checks as before).
--   - p_custom_amounts DEFAULT NULL keeps equal-split path byte-compatible for
--     existing callers that omit the arg → no payment-state drift for equal.
--   - When custom amounts are provided, cent-sum MUST equal ROUND(p_amount*100)
--     and every split participant must have an entry — prevents ledger skew.
--   - Settlement RPCs unchanged (still operate on payment_splits.amount_owed).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_payment_with_splits_v2(
  p_trip_id text,
  p_amount numeric,
  p_currency text,
  p_description text,
  p_split_count integer,
  p_split_participants jsonb,
  p_payment_methods jsonb,
  p_created_by uuid,
  p_custom_amounts jsonb DEFAULT NULL
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
  v_auth_uid uuid := auth.uid();
  effective_plan text := 'free';
  payment_limit integer := 3;
  existing_payment_count integer := 0;
  total_cents integer;
  base_cents integer;
  remainder_cents integer;
  participant_index integer := 0;
  custom_sum_cents integer := 0;
  custom_key text;
  custom_value numeric;
  participant_text text;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_created_by IS NULL OR p_created_by <> v_auth_uid THEN
    RAISE EXCEPTION 'Payment creator must match authenticated user';
  END IF;

  IF NOT public.is_active_trip_member(v_auth_uid, p_trip_id) THEN
    RAISE EXCEPTION 'Not a member of this trip';
  END IF;

  IF p_split_count IS NULL OR p_split_count <= 0 THEN
    RAISE EXCEPTION 'Payment split count must be greater than zero';
  END IF;

  IF jsonb_typeof(p_split_participants) <> 'array'
    OR jsonb_array_length(p_split_participants) <> p_split_count THEN
    RAISE EXCEPTION 'Split participants must match split count';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(p_split_participants) AS participant_id(user_id)
    WHERE NOT public.is_active_trip_member(participant_id.user_id::uuid, p_trip_id)
  ) THEN
    RAISE EXCEPTION 'All split participants must be trip members';
  END IF;

  -- Validate optional custom amounts (uneven / percentage-resolved shares)
  IF p_custom_amounts IS NOT NULL THEN
    IF jsonb_typeof(p_custom_amounts) <> 'object' THEN
      RAISE EXCEPTION 'Custom amounts must be a JSON object of participant_id → amount';
    END IF;

    FOR participant_text IN SELECT jsonb_array_elements_text(p_split_participants)
    LOOP
      IF NOT (p_custom_amounts ? participant_text) THEN
        RAISE EXCEPTION 'Custom amounts missing participant %', participant_text;
      END IF;
    END LOOP;

    FOR custom_key IN SELECT jsonb_object_keys(p_custom_amounts)
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(p_split_participants) AS p(user_id)
        WHERE p.user_id = custom_key
      ) THEN
        RAISE EXCEPTION 'Custom amounts include unknown participant %', custom_key;
      END IF;

      custom_value := (p_custom_amounts ->> custom_key)::numeric;
      IF custom_value IS NULL OR custom_value < 0 THEN
        RAISE EXCEPTION 'Custom amount for % must be a non-negative number', custom_key;
      END IF;
      custom_sum_cents := custom_sum_cents + ROUND(custom_value * 100)::integer;
    END LOOP;

    IF custom_sum_cents <> ROUND(p_amount * 100)::integer THEN
      RAISE EXCEPTION 'Custom amounts must sum to the payment total';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_trip_id), hashtext(v_auth_uid::text));

  SELECT COALESCE(ue.plan, 'free')
  INTO effective_plan
  FROM user_entitlements ue
  WHERE ue.user_id = v_auth_uid
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
      AND created_by = v_auth_uid;

    IF existing_payment_count >= payment_limit THEN
      RAISE EXCEPTION 'Payment request limit reached for current plan';
    END IF;
  END IF;

  total_cents := ROUND(p_amount * 100)::integer;
  base_cents := total_cents / p_split_count;
  remainder_cents := total_cents - (base_cents * p_split_count);

  INSERT INTO trip_payment_messages (
    trip_id, amount, currency, description, split_count,
    split_participants, payment_methods, created_by
  ) VALUES (
    p_trip_id, p_amount, p_currency, p_description, p_split_count,
    p_split_participants, p_payment_methods, v_auth_uid
  ) RETURNING id INTO payment_id;

  FOR participant IN SELECT jsonb_array_elements_text(p_split_participants)::uuid
  LOOP
    IF p_custom_amounts IS NOT NULL THEN
      split_amount := (p_custom_amounts ->> participant::text)::numeric;
    ELSE
      split_amount := (
        base_cents + CASE WHEN participant_index < remainder_cents THEN 1 ELSE 0 END
      )::numeric / 100;
    END IF;

    INSERT INTO payment_splits (
      payment_message_id, debtor_user_id, amount_owed
    ) VALUES (
      payment_id, participant, split_amount
    );

    participant_index := participant_index + 1;
  END LOOP;

  INSERT INTO payment_audit_log (payment_message_id, action, actor_user_id, metadata)
  VALUES (
    payment_id,
    'created',
    v_auth_uid,
    jsonb_build_object(
      'amount', p_amount,
      'currency', p_currency,
      'split_mode', CASE WHEN p_custom_amounts IS NULL THEN 'equal' ELSE 'custom' END
    )
  );

  RETURN payment_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Payment creation failed: %', SQLERRM;
END;
$$;
