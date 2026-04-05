
-- Create coupons table
CREATE TABLE public.coupons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 1,
  current_uses INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NOT NULL
);

-- Unique constraint on code (case-insensitive)
CREATE UNIQUE INDEX coupons_code_unique ON public.coupons (UPPER(code));

-- RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Admins can manage coupons
CREATE POLICY "Admins can manage coupons" ON public.coupons
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Anyone can view active coupons (needed for validation at checkout)
CREATE POLICY "Anyone can view active coupons" ON public.coupons
  FOR SELECT TO public
  USING (active = true);

-- Add coupon_code column to orders
ALTER TABLE public.orders ADD COLUMN coupon_code TEXT DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN coupon_discount NUMERIC DEFAULT 0;
