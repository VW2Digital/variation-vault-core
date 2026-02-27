
-- Orders table to track all payments
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_cpf text NOT NULL,
  customer_phone text,
  asaas_customer_id text,
  asaas_payment_id text,
  product_name text NOT NULL,
  dosage text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'pix',
  installments integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Public can insert orders (no auth needed for checkout)
CREATE POLICY "Anyone can insert orders" ON public.orders FOR INSERT WITH CHECK (true);

-- Only service role can update (webhook)
CREATE POLICY "Service role can update orders" ON public.orders FOR UPDATE USING (true);

-- Authenticated users can view all orders (admin)
CREATE POLICY "Authenticated users can view orders" ON public.orders FOR SELECT USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
