
-- Tabela para armazenar respostas de chamadas idempotentes
CREATE TABLE IF NOT EXISTS public.api_idempotency_keys (
  key text PRIMARY KEY,
  route text NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_expires
  ON public.api_idempotency_keys (expires_at);

ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Apenas service role escreve/lê. Admins podem auditar.
CREATE POLICY "Admins can view idempotency keys"
  ON public.api_idempotency_keys
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
