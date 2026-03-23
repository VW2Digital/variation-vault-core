CREATE POLICY "Admins can view all cart items"
ON public.cart_items FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));