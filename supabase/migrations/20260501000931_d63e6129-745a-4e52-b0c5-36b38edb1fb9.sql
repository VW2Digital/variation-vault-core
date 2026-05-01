-- 1. Novas colunas na tabela de arquivos digitais
ALTER TABLE public.product_variation_files
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- 2. Bucket público para capas dos arquivos digitais
INSERT INTO storage.buckets (id, name, public)
VALUES ('digital-file-covers', 'digital-file-covers', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Políticas no bucket digital-file-covers
DROP POLICY IF EXISTS "Anyone can view digital file covers" ON storage.objects;
CREATE POLICY "Anyone can view digital file covers"
ON storage.objects FOR SELECT
USING (bucket_id = 'digital-file-covers');

DROP POLICY IF EXISTS "Owner can upload digital file covers" ON storage.objects;
CREATE POLICY "Owner can upload digital file covers"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'digital-file-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Owner can update digital file covers" ON storage.objects;
CREATE POLICY "Owner can update digital file covers"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'digital-file-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Owner can delete digital file covers" ON storage.objects;
CREATE POLICY "Owner can delete digital file covers"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'digital-file-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);