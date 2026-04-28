CREATE TABLE public.bulk_email_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  html_content text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.bulk_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bulk_email_templates"
ON public.bulk_email_templates
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_bulk_email_templates_updated_at
BEFORE UPDATE ON public.bulk_email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();