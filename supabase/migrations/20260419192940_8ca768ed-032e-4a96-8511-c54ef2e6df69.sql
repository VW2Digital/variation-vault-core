-- Tabela de upsells (produtos sugeridos no checkout)
CREATE TABLE public.product_upsells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  upsell_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT product_upsells_unique UNIQUE (product_id, upsell_product_id),
  CONSTRAINT product_upsells_no_self CHECK (product_id <> upsell_product_id)
);

CREATE INDEX idx_product_upsells_product_id ON public.product_upsells(product_id);

ALTER TABLE public.product_upsells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view upsells"
  ON public.product_upsells FOR SELECT
  USING (true);

CREATE POLICY "Owner can insert upsells"
  ON public.product_upsells FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_upsells.product_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Owner can update upsells"
  ON public.product_upsells FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_upsells.product_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Owner can delete upsells"
  ON public.product_upsells FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_upsells.product_id AND p.user_id = auth.uid()
  ));