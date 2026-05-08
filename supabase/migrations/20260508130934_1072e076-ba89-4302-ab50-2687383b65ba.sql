ALTER TABLE public.flash_campaigns
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'existing',
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variation_id uuid REFERENCES public.product_variations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS discount_mode text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_price numeric,
  ADD COLUMN IF NOT EXISTS max_installments integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS pix_discount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_link_id uuid REFERENCES public.payment_links(id) ON DELETE SET NULL;