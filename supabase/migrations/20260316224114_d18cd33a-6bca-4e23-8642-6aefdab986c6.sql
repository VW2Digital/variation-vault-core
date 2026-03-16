
CREATE TABLE public.cart_abandonment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_sent_at timestamptz NOT NULL DEFAULT now(),
  cart_item_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.cart_abandonment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.cart_abandonment_logs
  FOR ALL TO public USING (true) WITH CHECK (true);
