-- Append option to an active poll (Suggest option)
-- Date: 2026-07-13
-- Purpose: Allow trip members to suggest a new option on an active poll without
--          rewriting existing options. Append-only; works even after options_locked_at
--          (which freezes *mutation* of existing options after the first vote).
--
-- Security: SECURITY DEFINER with auth.uid() + active membership + poll ownership of trip.
-- Kill switch: feature_flags.poll_suggest_option
-- Rollback: DROP FUNCTION IF EXISTS public.append_poll_option(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.append_poll_option(
  p_poll_id uuid,
  p_option_text text,
  p_current_version integer DEFAULT NULL
)
RETURNS public.trip_polls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll public.trip_polls%ROWTYPE;
  v_uid uuid := (SELECT auth.uid());
  v_text text := btrim(p_option_text);
  v_options jsonb;
  v_option jsonb;
  v_existing text;
  v_count integer;
  v_new_id text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_text IS NULL OR char_length(v_text) < 1 OR char_length(v_text) > 120 THEN
    RAISE EXCEPTION 'Option text must be between 1 and 120 characters';
  END IF;

  SELECT * INTO v_poll
  FROM public.trip_polls
  WHERE id = p_poll_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Poll not found';
  END IF;

  IF v_poll.status <> 'active' THEN
    RAISE EXCEPTION 'Cannot suggest options on a closed poll';
  END IF;

  IF v_poll.deadline_at IS NOT NULL AND v_poll.deadline_at <= now() THEN
    RAISE EXCEPTION 'Voting deadline has passed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.trip_members tm
    WHERE tm.trip_id = v_poll.trip_id
      AND tm.user_id = v_uid
      AND (tm.status IS NULL OR tm.status = 'active')
  ) THEN
    RAISE EXCEPTION 'You must be a trip member to suggest an option';
  END IF;

  IF p_current_version IS NOT NULL AND COALESCE(v_poll.version, 0) <> p_current_version THEN
    RAISE EXCEPTION 'Poll has been modified by another user. Please refresh and try again.';
  END IF;

  v_options := COALESCE(v_poll.options, '[]'::jsonb);
  IF jsonb_typeof(v_options) <> 'array' THEN
    RAISE EXCEPTION 'Poll options are corrupted';
  END IF;

  v_count := jsonb_array_length(v_options);
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'This poll already has the maximum of 10 options';
  END IF;

  FOR v_option IN SELECT * FROM jsonb_array_elements(v_options)
  LOOP
    v_existing := lower(btrim(COALESCE(v_option->>'text', '')));
    IF v_existing = lower(v_text) THEN
      RAISE EXCEPTION 'That option already exists';
    END IF;
  END LOOP;

  v_new_id := gen_random_uuid()::text;

  v_options := v_options || jsonb_build_array(
    jsonb_build_object(
      'id', v_new_id,
      'text', v_text,
      'votes', 0,
      'voters', '[]'::jsonb
    )
  );

  UPDATE public.trip_polls
  SET
    options = v_options,
    version = COALESCE(version, 0) + 1,
    updated_at = now()
  WHERE id = p_poll_id
  RETURNING * INTO v_poll;

  RETURN v_poll;
END;
$$;

REVOKE ALL ON FUNCTION public.append_poll_option(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_poll_option(uuid, text, integer) TO authenticated;

INSERT INTO public.feature_flags (key, enabled, description) VALUES
  (
    'poll_suggest_option',
    true,
    'Allow trip members to suggest a new option on an active poll (append-only RPC).'
  )
ON CONFLICT (key) DO NOTHING;
