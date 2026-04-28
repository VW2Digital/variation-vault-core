
-- Tabela de campanhas de envio em massa
CREATE TABLE public.bulk_email_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  audience_type TEXT NOT NULL, -- all_customers, paid_customers, no_orders, manual
  total_recipients INTEGER NOT NULL DEFAULT 0,
  total_sent INTEGER NOT NULL DEFAULT 0,
  total_failed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.bulk_email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bulk_email_campaigns"
ON public.bulk_email_campaigns
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_bulk_email_campaigns_created_at ON public.bulk_email_campaigns(created_at DESC);
