
CREATE TABLE public.banners (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  text text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active banners" ON public.banners FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert banners" ON public.banners FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated users can update their banners" ON public.banners FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can delete their banners" ON public.banners FOR DELETE USING (auth.uid() = user_id);
