
-- Add tracking columns to orders table
ALTER TABLE public.orders
ADD COLUMN tracking_code text DEFAULT NULL,
ADD COLUMN delivery_status text DEFAULT 'PROCESSING',
ADD COLUMN customer_user_id uuid REFERENCES auth.users(id) DEFAULT NULL;

-- Create index for customer lookup
CREATE INDEX idx_orders_customer_user_id ON public.orders(customer_user_id);
CREATE INDEX idx_orders_customer_email ON public.orders(customer_email);

-- Policy: customers can view their own orders
CREATE POLICY "Customers can view their own orders"
ON public.orders
FOR SELECT
USING (auth.uid() = customer_user_id);
