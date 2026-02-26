CREATE TABLE public.site_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view settings" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert settings" ON public.site_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated users can update settings" ON public.site_settings FOR UPDATE USING (auth.uid() = user_id);

INSERT INTO public.site_settings (key, value, user_id) VALUES ('whatsapp_number', '', '00000000-0000-0000-0000-000000000000');