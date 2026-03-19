ALTER TABLE public.payment_links
  ADD COLUMN IF NOT EXISTS pix_discount_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_installments integer DEFAULT 1;