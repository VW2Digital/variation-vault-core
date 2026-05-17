
-- FKs para permitir embedding do PostgREST em combo_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'combo_items_product_id_fkey'
  ) THEN
    ALTER TABLE public.combo_items
      ADD CONSTRAINT combo_items_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'combo_items_variation_id_fkey'
  ) THEN
    ALTER TABLE public.combo_items
      ADD CONSTRAINT combo_items_variation_id_fkey
      FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE SET NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
