-- Drop any trigger that uses the wholesale enforcement function on the orders table
DO $$
DECLARE
  trg RECORD;
BEGIN
  FOR trg IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.orders'::regclass
      AND NOT tgisinternal
      AND pg_get_triggerdef(oid) ILIKE '%enforce_wholesale_minimum_on_order%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.orders', trg.tgname);
  END LOOP;
END $$;

-- Drop the enforcement function itself
DROP FUNCTION IF EXISTS public.enforce_wholesale_minimum_on_order() CASCADE;