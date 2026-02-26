
-- Timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  description TEXT DEFAULT '',
  active_ingredient TEXT DEFAULT '',
  pharma_form TEXT DEFAULT '',
  administration_route TEXT DEFAULT '',
  frequency TEXT DEFAULT '',
  images TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated users can update their products" ON public.products FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can delete their products" ON public.products FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Product variations table
CREATE TABLE public.product_variations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  dosage TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  in_stock BOOLEAN NOT NULL DEFAULT true,
  is_offer BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view variations" ON public.product_variations FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert variations" ON public.product_variations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update variations" ON public.product_variations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete variations" ON public.product_variations FOR DELETE TO authenticated USING (true);

-- Video testimonials table
CREATE TABLE public.video_testimonials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.video_testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view testimonials" ON public.video_testimonials FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert testimonials" ON public.video_testimonials FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated users can update testimonials" ON public.video_testimonials FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can delete testimonials" ON public.video_testimonials FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('testimonial-videos', 'testimonial-videos', true);

-- Storage policies
CREATE POLICY "Public can view product images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Authenticated can upload product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "Authenticated can update product images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images');
CREATE POLICY "Authenticated can delete product images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images');

CREATE POLICY "Public can view testimonial videos" ON storage.objects FOR SELECT USING (bucket_id = 'testimonial-videos');
CREATE POLICY "Authenticated can upload testimonial videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'testimonial-videos');
CREATE POLICY "Authenticated can update testimonial videos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'testimonial-videos');
CREATE POLICY "Authenticated can delete testimonial videos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'testimonial-videos');
