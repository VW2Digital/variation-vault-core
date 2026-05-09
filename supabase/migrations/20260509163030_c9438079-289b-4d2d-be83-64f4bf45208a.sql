CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON public.password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_email ON public.password_reset_tokens(email);
CREATE INDEX IF NOT EXISTS idx_prt_expires_at ON public.password_reset_tokens(expires_at);

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Apenas service_role pode acessar (via edge functions). Sem políticas para anon/authenticated.
DROP POLICY IF EXISTS "service_role_all" ON public.password_reset_tokens;
CREATE POLICY "service_role_all" ON public.password_reset_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);