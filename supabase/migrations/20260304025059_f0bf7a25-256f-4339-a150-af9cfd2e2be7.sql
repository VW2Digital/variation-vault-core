ALTER TABLE public.products ADD COLUMN IF NOT EXISTS free_shipping boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS free_shipping_min_value numeric DEFAULT 0;