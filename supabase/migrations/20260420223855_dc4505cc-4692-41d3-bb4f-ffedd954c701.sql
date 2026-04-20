-- Tabela para registro centralizado de eventos de webhook
CREATE TABLE public.webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gateway TEXT NOT NULL,
  event_type TEXT,
  http_status INTEGER NOT NULL DEFAULT 200,
  latency_ms INTEGER,
  signature_valid BOOLEAN,
  signature_error TEXT,
  order_id UUID,
  external_id TEXT,
  request_headers JSONB,
  request_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs (created_at DESC);
CREATE INDEX idx_webhook_logs_gateway ON public.webhook_logs (gateway, created_at DESC);
CREATE INDEX idx_webhook_logs_order_id ON public.webhook_logs (order_id);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admins leem; inserts feitos pelas edge functions com service role bypassam RLS
CREATE POLICY "Admins can view webhook logs"
  ON public.webhook_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete webhook logs"
  ON public.webhook_logs FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Habilita Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_logs;
ALTER TABLE public.webhook_logs REPLICA IDENTITY FULL;