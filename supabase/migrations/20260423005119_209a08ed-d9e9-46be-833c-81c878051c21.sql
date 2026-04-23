CREATE TABLE IF NOT EXISTS public.webhook_retry_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway         text NOT NULL,
  function_name   text NOT NULL,
  external_id     text,
  request_payload jsonb NOT NULL,
  request_headers jsonb,
  status          text NOT NULL DEFAULT 'pending',
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 6,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  last_status     integer,
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_retry_queue_pending
  ON public.webhook_retry_queue (status, next_attempt_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_webhook_retry_queue_gateway
  ON public.webhook_retry_queue (gateway, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_webhook_retry_queue()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_webhook_retry_queue ON public.webhook_retry_queue;
CREATE TRIGGER trg_touch_webhook_retry_queue
  BEFORE UPDATE ON public.webhook_retry_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_webhook_retry_queue();

ALTER TABLE public.webhook_retry_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook retry queue"
  ON public.webhook_retry_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update webhook retry queue"
  ON public.webhook_retry_queue FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete webhook retry queue"
  ON public.webhook_retry_queue FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));