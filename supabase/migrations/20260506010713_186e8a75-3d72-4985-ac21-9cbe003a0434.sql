ALTER TABLE public.product_upsells
ADD COLUMN IF NOT EXISTS upsell_variation_id uuid;

CREATE INDEX IF NOT EXISTS idx_product_upsells_product_id ON public.product_upsells(product_id);
CREATE INDEX IF NOT EXISTS idx_product_upsells_upsell_product_id ON public.product_upsells(upsell_product_id);