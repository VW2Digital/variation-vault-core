
-- Add shipping columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS shipping_service text,
  ADD COLUMN IF NOT EXISTS shipment_id text,
  ADD COLUMN IF NOT EXISTS label_url text,
  ADD COLUMN IF NOT EXISTS tracking_url text;

-- Create shipping_logs table
CREATE TABLE IF NOT EXISTS public.shipping_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  event_type text,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.shipping_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view shipping logs"
  ON public.shipping_logs FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert shipping logs"
  ON public.shipping_logs FOR INSERT
  WITH CHECK (true);
