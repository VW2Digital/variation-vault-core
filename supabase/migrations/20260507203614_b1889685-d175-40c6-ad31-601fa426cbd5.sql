
CREATE TABLE public.flash_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT '',
  headline text NOT NULL DEFAULT '',
  subheadline text NOT NULL DEFAULT '',
  cta_text text NOT NULL DEFAULT 'GARANTIR AGORA',
  payment_link_id uuid NOT NULL REFERENCES public.payment_links(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  background_image text DEFAULT '',
  bg_color text DEFAULT '#0a0000',
  accent_color text DEFAULT '#ef4444',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flash_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view flash campaigns" ON public.flash_campaigns
  FOR SELECT USING (true);
CREATE POLICY "Admins manage flash campaigns" ON public.flash_campaigns
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_flash_campaigns_updated_at
  BEFORE UPDATE ON public.flash_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.flash_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.flash_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('view','click','conversion')),
  session_id text,
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_flash_events_campaign ON public.flash_campaign_events(campaign_id, event_type);

ALTER TABLE public.flash_campaign_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert flash events" ON public.flash_campaign_events
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins view flash events" ON public.flash_campaign_events
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete flash events" ON public.flash_campaign_events
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE VIEW public.flash_campaign_stats AS
SELECT
  c.id AS campaign_id,
  COUNT(*) FILTER (WHERE e.event_type = 'view') AS views,
  COUNT(*) FILTER (WHERE e.event_type = 'click') AS clicks,
  COUNT(*) FILTER (WHERE e.event_type = 'conversion') AS conversions,
  CASE WHEN COUNT(*) FILTER (WHERE e.event_type = 'view') > 0
    THEN ROUND(100.0 * COUNT(*) FILTER (WHERE e.event_type = 'conversion')
              / COUNT(*) FILTER (WHERE e.event_type = 'view'), 2)
    ELSE 0 END AS conversion_rate
FROM public.flash_campaigns c
LEFT JOIN public.flash_campaign_events e ON e.campaign_id = c.id
GROUP BY c.id;
