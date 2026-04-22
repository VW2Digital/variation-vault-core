-- Preferences for marketing channels (cart abandonment, etc.)
CREATE TABLE IF NOT EXISTS public.contact_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  allow_email_marketing boolean NOT NULL DEFAULT true,
  allow_whatsapp_marketing boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own contact preferences"
  ON public.contact_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own contact preferences"
  ON public.contact_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own contact preferences"
  ON public.contact_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all contact preferences"
  ON public.contact_preferences FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_contact_preferences_updated_at
  BEFORE UPDATE ON public.contact_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();