-- Tabela de auditoria de toggles de gateway de pagamento
CREATE TABLE public.gateway_settings_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_email TEXT,
  gateway TEXT NOT NULL,
  setting_type TEXT NOT NULL, -- 'enabled' | 'fallback_enabled'
  old_value BOOLEAN,
  new_value BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gateway_settings_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view gateway audit"
  ON public.gateway_settings_audit FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert gateway audit"
  ON public.gateway_settings_audit FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND auth.uid() = user_id);

CREATE POLICY "Admins can delete gateway audit"
  ON public.gateway_settings_audit FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_gateway_audit_created_at ON public.gateway_settings_audit (created_at DESC);
CREATE INDEX idx_gateway_audit_gateway ON public.gateway_settings_audit (gateway);