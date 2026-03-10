
-- Wholesale pricing tiers per variation
CREATE TABLE public.wholesale_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id uuid NOT NULL REFERENCES public.product_variations(id) ON DELETE CASCADE,
  min_quantity integer NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.wholesale_prices ENABLE ROW LEVEL SECURITY;

-- Anyone can read wholesale prices (public catalog)
CREATE POLICY "Anyone can view wholesale prices"
  ON public.wholesale_prices FOR SELECT TO public
  USING (true);

-- Owner can manage wholesale prices (through product ownership)
CREATE POLICY "Owner can insert wholesale prices"
  ON public.wholesale_prices FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM product_variations pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.id = wholesale_prices.variation_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Owner can update wholesale prices"
  ON public.wholesale_prices FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM product_variations pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.id = wholesale_prices.variation_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Owner can delete wholesale prices"
  ON public.wholesale_prices FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM product_variations pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.id = wholesale_prices.variation_id AND p.user_id = auth.uid()
    )
  );
