
-- Clean up duplicates (keep oldest by updated_at)
DELETE FROM public.site_settings
WHERE id NOT IN (
  SELECT DISTINCT ON (key) id
  FROM public.site_settings
  ORDER BY key, updated_at ASC
);

-- Add unique constraint on key
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_key_unique UNIQUE (key);

-- Add DELETE policy for admins
CREATE POLICY "Admins can delete settings"
ON public.site_settings
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
