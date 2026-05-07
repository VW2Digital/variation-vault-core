
CREATE OR REPLACE FUNCTION public.flash_campaign_register_conversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _camp uuid;
  _paid text[] := ARRAY['PAID','CONFIRMED','RECEIVED','RECEIVED_IN_CASH'];
BEGIN
  IF (TG_OP = 'UPDATE')
     AND upper(NEW.status) = ANY(_paid)
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NOT (upper(OLD.status) = ANY(_paid)) THEN

    SELECT campaign_id INTO _camp
    FROM public.flash_campaign_events
    WHERE order_id = NEW.id AND event_type = 'order'
    LIMIT 1;

    IF _camp IS NOT NULL THEN
      INSERT INTO public.flash_campaign_events(campaign_id, event_type, order_id)
      VALUES (_camp, 'conversion', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.flash_campaign_events DROP CONSTRAINT flash_campaign_events_event_type_check;
ALTER TABLE public.flash_campaign_events ADD CONSTRAINT flash_campaign_events_event_type_check
  CHECK (event_type IN ('view','click','order','conversion'));

DROP TRIGGER IF EXISTS trg_flash_campaign_conversion ON public.orders;
CREATE TRIGGER trg_flash_campaign_conversion
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.flash_campaign_register_conversion();
