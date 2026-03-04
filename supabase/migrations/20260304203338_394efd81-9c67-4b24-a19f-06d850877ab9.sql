
-- Fix orphaned rows: update user_id to the current admin
UPDATE public.site_settings 
SET user_id = '21037bba-b6ae-4e79-ba08-307fe3129eff' 
WHERE user_id = '59b3b07c-f0e9-4cf0-89e6-3763ab1d8afa';

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Authenticated users can update settings" ON public.site_settings;
DROP POLICY IF EXISTS "Authenticated users can insert settings" ON public.site_settings;

-- Create new policies that allow any admin to manage settings
CREATE POLICY "Admins can update settings" ON public.site_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert settings" ON public.site_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
