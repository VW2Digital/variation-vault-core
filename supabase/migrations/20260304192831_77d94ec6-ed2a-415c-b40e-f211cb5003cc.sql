
-- Create banner_slides table for image banners with responsive images
CREATE TABLE public.banner_slides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  image_desktop TEXT NOT NULL DEFAULT '',
  image_tablet TEXT NOT NULL DEFAULT '',
  image_mobile TEXT NOT NULL DEFAULT '',
  link_url TEXT DEFAULT '',
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.banner_slides ENABLE ROW LEVEL SECURITY;

-- Anyone can view active banner slides
CREATE POLICY "Anyone can view banner slides" ON public.banner_slides
  FOR SELECT USING (true);

-- Authenticated users can insert their own
CREATE POLICY "Auth users can insert banner slides" ON public.banner_slides
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Authenticated users can update their own
CREATE POLICY "Auth users can update banner slides" ON public.banner_slides
  FOR UPDATE USING (auth.uid() = user_id);

-- Authenticated users can delete their own
CREATE POLICY "Auth users can delete banner slides" ON public.banner_slides
  FOR DELETE USING (auth.uid() = user_id);

-- Create storage bucket for banner images
INSERT INTO storage.buckets (id, name, public) VALUES ('banner-images', 'banner-images', true);

-- Storage policies for banner-images bucket
CREATE POLICY "Anyone can view banner images" ON storage.objects
  FOR SELECT USING (bucket_id = 'banner-images');

CREATE POLICY "Auth users can upload banner images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'banner-images' AND auth.role() = 'authenticated');

CREATE POLICY "Auth users can update banner images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'banner-images' AND auth.role() = 'authenticated');

CREATE POLICY "Auth users can delete banner images" ON storage.objects
  FOR DELETE USING (bucket_id = 'banner-images' AND auth.role() = 'authenticated');
