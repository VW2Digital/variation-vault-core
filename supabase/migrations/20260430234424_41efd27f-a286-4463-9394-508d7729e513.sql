-- 1) Add is_digital flag to variations
ALTER TABLE public.product_variations
  ADD COLUMN IF NOT EXISTS is_digital boolean NOT NULL DEFAULT false;

-- 2) Table to hold digital file metadata (1 variation -> N files)
CREATE TABLE IF NOT EXISTS public.product_variation_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id uuid NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pvf_variation ON public.product_variation_files(variation_id);

ALTER TABLE public.product_variation_files ENABLE ROW LEVEL SECURITY;

-- Owner (product owner) full access
CREATE POLICY "Owner can view digital files"
ON public.product_variation_files
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.product_variations pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = product_variation_files.variation_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Owner can insert digital files"
ON public.product_variation_files
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.product_variations pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = product_variation_files.variation_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Owner can update digital files"
ON public.product_variation_files
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.product_variations pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = product_variation_files.variation_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Owner can delete digital files"
ON public.product_variation_files
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.product_variations pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = product_variation_files.variation_id
      AND p.user_id = auth.uid()
  )
);

-- Customers can SEE metadata of files they have paid for (download itself goes via edge function)
CREATE POLICY "Customers can view files of their paid orders"
ON public.product_variation_files
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.product_variations pv
    JOIN public.orders o ON UPPER(o.status) IN ('PAID','CONFIRMED','RECEIVED','RECEIVED_IN_CASH')
    WHERE pv.id = product_variation_files.variation_id
      AND o.customer_user_id = auth.uid()
      AND (
        o.product_name ILIKE '%' || (SELECT name FROM public.products WHERE id = pv.product_id) || '%'
      )
  )
);

-- updated_at trigger
DROP TRIGGER IF EXISTS update_pvf_updated_at ON public.product_variation_files;
CREATE TRIGGER update_pvf_updated_at
BEFORE UPDATE ON public.product_variation_files
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Private storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('digital-files', 'digital-files', false, 52428800) -- 50MB
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 52428800;

-- 4) Storage policies — only product owner can upload/list/delete; download blocked (will be served via edge function)
CREATE POLICY "Owner can upload digital files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'digital-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Owner can read own digital files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'digital-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Owner can update own digital files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'digital-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Owner can delete own digital files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'digital-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);