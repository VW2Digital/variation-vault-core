
ALTER TABLE public.products
  ADD COLUMN pix_discount_percent numeric DEFAULT 0,
  ADD COLUMN max_installments integer DEFAULT 6,
  ADD COLUMN installments_interest text DEFAULT 'sem_juros';
