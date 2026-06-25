DO $$
DECLARE
  v_trip text := '22be43ef-270d-4c99-9b53-b3541d5c82ef';
  v_u1 uuid := '013d9240-10c0-44e5-8da5-abfa2c4751c5';
  v_u2 uuid := '5f87a85c-3af6-4978-819a-6f4ceb76f553';
  v_u3 uuid := '68610b32-32c3-42cf-acb8-86dbd7b96d26';
  v_msg_id uuid;
  v_total numeric;
  v_amounts numeric[];
  v_desc text := 'Penny rounding smoke test ' || gen_random_uuid()::text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_msg_id := public.create_payment_with_splits_v2(
    v_trip, 100.00::numeric, 'USD'::text, v_desc, 3,
    jsonb_build_array(v_u1::text, v_u2::text, v_u3::text),
    '["venmo"]'::jsonb, v_u1
  );

  EXECUTE 'RESET ROLE';

  SELECT array_agg(amount_owed ORDER BY amount_owed DESC), SUM(amount_owed)
    INTO v_amounts, v_total
  FROM public.payment_splits WHERE payment_message_id = v_msg_id;

  RAISE NOTICE 'msg_id=% amounts=% total=%', v_msg_id, v_amounts, v_total;

  IF v_total <> 100.00 THEN
    RAISE EXCEPTION 'Total mismatch: expected 100.00 got %', v_total;
  END IF;
  IF v_amounts <> ARRAY[33.34, 33.33, 33.33]::numeric[] THEN
    RAISE EXCEPTION 'Distribution mismatch: expected [33.34,33.33,33.33] got %', v_amounts;
  END IF;

  DELETE FROM public.payment_splits WHERE payment_message_id = v_msg_id;
  DELETE FROM public.trip_payment_messages WHERE id = v_msg_id;
  PERFORM set_config('request.jwt.claims', '', true);

  RAISE NOTICE 'Smoke test PASSED';
END $$;