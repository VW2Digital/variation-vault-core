-- Tabela de eventos do A/B test
CREATE TABLE public.ab_card_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  variant text NOT NULL CHECK (variant IN ('A', 'B')),
  event_type text NOT NULL CHECK (event_type IN ('impression', 'cta_click')),
  product_id uuid,
  variation_id uuid,
  session_id text NOT NULL,
  user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Índices para análise rápida
CREATE INDEX idx_ab_card_events_variant_type ON public.ab_card_events(variant, event_type);
CREATE INDEX idx_ab_card_events_created_at ON public.ab_card_events(created_at DESC);
CREATE INDEX idx_ab_card_events_session ON public.ab_card_events(session_id);

-- RLS
ALTER TABLE public.ab_card_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert ab events"
  ON public.ab_card_events
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view ab events"
  ON public.ab_card_events
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete ab events"
  ON public.ab_card_events
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));