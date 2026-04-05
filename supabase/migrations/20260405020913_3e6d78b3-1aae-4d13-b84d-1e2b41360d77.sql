ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS unit_price numeric NOT NULL DEFAULT 0;