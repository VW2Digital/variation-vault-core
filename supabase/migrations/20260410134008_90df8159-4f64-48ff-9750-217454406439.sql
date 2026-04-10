
CREATE TABLE public.coupon_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(coupon_id, product_id)
);

ALTER TABLE public.coupon_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read coupon_products" ON public.coupon_products FOR SELECT USING (true);
CREATE POLICY "Admins can manage coupon_products" ON public.coupon_products FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Migrate existing product_id associations
INSERT INTO public.coupon_products (coupon_id, product_id)
SELECT id, product_id FROM public.coupons WHERE product_id IS NOT NULL;
