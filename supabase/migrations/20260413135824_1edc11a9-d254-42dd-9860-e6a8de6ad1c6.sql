
ALTER TABLE public.products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Set initial sort order based on created_at
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as rn
  FROM public.products
)
UPDATE public.products SET sort_order = ranked.rn FROM ranked WHERE products.id = ranked.id;
