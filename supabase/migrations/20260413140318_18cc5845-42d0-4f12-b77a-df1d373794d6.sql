
ALTER TABLE public.product_variations ADD COLUMN stock_quantity INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.products ADD COLUMN category TEXT DEFAULT ''::text;
