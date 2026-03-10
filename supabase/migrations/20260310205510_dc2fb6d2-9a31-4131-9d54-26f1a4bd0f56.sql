
CREATE POLICY "Authenticated can view all reviews" ON public.reviews FOR SELECT TO authenticated USING (true);
