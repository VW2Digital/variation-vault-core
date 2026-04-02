ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_gateway text DEFAULT 'asaas';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gateway_environment text DEFAULT 'sandbox';