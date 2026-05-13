-- Pin alerts should respect the same preference as organizer broadcasts (not trip-chat firehose).
CREATE OR REPLACE FUNCTION public.notify_on_pin_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id UUID;
BEGIN
  SELECT m.trip_id INTO v_trip_id FROM public.trip_chat_messages m WHERE m.id = NEW.message_id;
  IF v_trip_id IS NOT NULL THEN
    PERFORM public.create_notification_for_trip_members(
      v_trip_id,
      NEW.pinned_by,
      'pin',
      'pin',
      NEW.id,
      'broadcasts',
      'normal',
      '/trip/' || v_trip_id::text || '?tab=chat&filter=pinned',
      'Message pinned',
      'A message was pinned in chat',
      jsonb_build_object('pin_id', NEW.id, 'message_id', NEW.message_id),
      'pin:' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;
