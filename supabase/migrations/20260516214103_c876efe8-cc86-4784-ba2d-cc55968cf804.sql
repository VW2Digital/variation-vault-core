
-- Combos: pacotes de produtos com preço fixo
CREATE TABLE public.combos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  subtitle text DEFAULT '',
  description text DEFAULT '',
  slug text NOT NULL UNIQUE,
  image_url text DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  compare_price numeric DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  max_installments integer DEFAULT 6,
  pix_discount_percent numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.combo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id uuid NOT NULL REFERENCES public.combos(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  variation_id uuid,
  quantity integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_combo_items_combo ON public.combo_items(combo_id);
CREATE INDEX idx_combos_active_sort ON public.combos(active, sort_order);

ALTER TABLE public.combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;

-- Public read for active combos
CREATE POLICY "Anyone can view active combos"
ON public.combos FOR SELECT
USING (active = true OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage combos"
ON public.combos FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view combo items"
ON public.combo_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.combos c
    WHERE c.id = combo_items.combo_id
      AND (c.active = true OR has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "Admins manage combo items"
ON public.combo_items FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_combos_updated_at
BEFORE UPDATE ON public.combos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
