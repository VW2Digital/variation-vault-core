CREATE TABLE public.payment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_email text,
  customer_name text,
  payment_method text,
  error_message text NOT NULL,
  error_source text NOT NULL DEFAULT 'frontend',
  request_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view payment logs"
  ON public.payment_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can insert payment logs"
  ON public.payment_logs FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Admins can delete payment logs"
  ON public.payment_logs FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));