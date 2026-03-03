
-- Add customer address fields to orders for shipping integration
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS customer_address text,
ADD COLUMN IF NOT EXISTS customer_number text,
ADD COLUMN IF NOT EXISTS customer_complement text,
ADD COLUMN IF NOT EXISTS customer_district text,
ADD COLUMN IF NOT EXISTS customer_city text,
ADD COLUMN IF NOT EXISTS customer_state text,
ADD COLUMN IF NOT EXISTS customer_postal_code text;
