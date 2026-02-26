
-- Fix overly permissive RLS on product_variations
-- Drop the permissive policies
DROP POLICY "Authenticated users can insert variations" ON public.product_variations;
DROP POLICY "Authenticated users can update variations" ON public.product_variations;
DROP POLICY "Authenticated users can delete variations" ON public.product_variations;

-- Create proper policies that check ownership via the parent product
CREATE POLICY "Owner can insert variations" ON public.product_variations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.products WHERE id = product_id AND user_id = auth.uid())
  );

CREATE POLICY "Owner can update variations" ON public.product_variations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products WHERE id = product_id AND user_id = auth.uid())
  );

CREATE POLICY "Owner can delete variations" ON public.product_variations
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products WHERE id = product_id AND user_id = auth.uid())
  );
