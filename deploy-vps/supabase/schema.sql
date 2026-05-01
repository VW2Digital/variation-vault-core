-- =============================================================================
-- LIBERTY PHARMA — SCHEMA COMPLETO + REALTIME
-- Cole no SQL Editor de qualquer Supabase.com novo e clique RUN
-- 100% idempotente — pode rodar várias vezes sem erro
-- Atualizado: inclui product_upsells, products.active, webhook_logs,
--             contact_preferences, email_send_log, api_idempotency_keys
-- v2 (2026-04-28): inclui bulk_email_campaigns, bulk_email_templates,
--                  webhook_retry_queue, dispatch_order_email +
--                  trigger_send_order_emails (auto-email em orders)
-- v3 (2026-05-01): inclui ab_card_events, gateway_settings_audit,
--                  product_variation_files (produtos digitais),
--                  link_order_to_user_by_email + link_existing_orders_to_new_user,
--                  buckets digital-files (privado) e digital-file-covers (público)
-- v4 (2026-05-01): profiles.avatar_url + bucket público `avatars`
--                  (upload de foto de perfil pelo usuário, com Gravatar como fallback)
-- =============================================================================

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- pg_net é necessário para dispatch_order_email (HTTP POST para send-email)
-- pg_cron é opcional (recuperação de carrinho abandonado / sync de rastreio)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ENUMS
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- TABLES
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT '',
  cpf text DEFAULT '',
  phone text DEFAULT '',
  avatar_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- v4: garante a coluna em bancos antigos
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text DEFAULT '';

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'Casa',
  postal_code text NOT NULL,
  street text NOT NULL,
  number text NOT NULL,
  complement text DEFAULT '',
  district text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  fantasy_name text DEFAULT '',
  subtitle text DEFAULT '',
  description text DEFAULT '',
  category text DEFAULT '',
  active_ingredient text DEFAULT '',
  pharma_form text DEFAULT '',
  administration_route text DEFAULT '',
  frequency text DEFAULT '',
  images text[] DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  is_bestseller boolean NOT NULL DEFAULT false,
  free_shipping boolean NOT NULL DEFAULT false,
  free_shipping_min_value numeric DEFAULT 0,
  pix_discount_percent numeric DEFAULT 0,
  max_installments integer DEFAULT 6,
  installments_interest text DEFAULT 'sem_juros',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Garante coluna `active` em bancos antigos
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.product_variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  dosage text NOT NULL,
  subtitle text DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  offer_price numeric DEFAULT 0,
  is_offer boolean NOT NULL DEFAULT false,
  in_stock boolean NOT NULL DEFAULT true,
  stock_quantity integer NOT NULL DEFAULT 0,
  image_url text DEFAULT '',
  images text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wholesale_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id uuid NOT NULL REFERENCES public.product_variations(id) ON DELETE CASCADE,
  min_quantity integer NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sistema de Upsell no Checkout ("Leve também")
CREATE TABLE IF NOT EXISTS public.product_upsells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  upsell_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, upsell_product_id)
);

CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variation_id uuid NOT NULL REFERENCES public.product_variations(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, variation_id)
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_cpf text NOT NULL,
  customer_phone text,
  customer_postal_code text,
  customer_address text,
  customer_number text,
  customer_complement text,
  customer_district text,
  customer_city text,
  customer_state text,
  product_name text NOT NULL,
  dosage text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'pix',
  installments integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'PENDING',
  payment_gateway text DEFAULT 'asaas',
  gateway_environment text DEFAULT 'sandbox',
  asaas_customer_id text,
  asaas_payment_id text,
  coupon_code text,
  coupon_discount numeric DEFAULT 0,
  shipping_cost numeric DEFAULT 0,
  shipping_service text,
  shipping_status text DEFAULT 'pending',
  selected_service_id integer,
  shipment_id text,
  tracking_code text,
  tracking_url text,
  label_url text,
  delivery_status text DEFAULT 'PROCESSING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  discount_type text NOT NULL DEFAULT 'percentage',
  discount_value numeric NOT NULL DEFAULT 0,
  max_uses integer NOT NULL DEFAULT 1,
  current_uses integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_unique ON public.coupons (upper(code));

CREATE TABLE IF NOT EXISTS public.coupon_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text DEFAULT '',
  fantasy_name text,
  amount numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  pix_discount_percent numeric DEFAULT 0,
  max_installments integer DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_name text,
  customer_email text,
  payment_method text,
  error_message text NOT NULL,
  error_source text NOT NULL DEFAULT 'frontend',
  request_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shipping_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  event_type text,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Logs centralizados de webhooks de gateways (Asaas, MP, Pagar.me, PagBank, Melhor Envio)
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL,
  event_type text,
  external_id text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  http_status integer NOT NULL DEFAULT 200,
  latency_ms integer,
  signature_valid boolean,
  signature_error text,
  error_message text,
  request_headers jsonb,
  request_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotência da REST orders-api (24h padrão)
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

-- Preferências de contato (email/whatsapp marketing)
CREATE TABLE IF NOT EXISTS public.contact_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  allow_email_marketing boolean NOT NULL DEFAULT true,
  allow_whatsapp_marketing boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Histórico de envio de e-mails transacionais (send-email Edge Function)
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL,
  recipient_email text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'pending',
  message_id text,
  error_message text,
  provider_response jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Disparo de e-mails em massa (campanhas)
CREATE TABLE IF NOT EXISTS public.bulk_email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid,
  subject text NOT NULL,
  html_content text NOT NULL,
  audience_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  total_recipients integer NOT NULL DEFAULT 0,
  total_sent integer NOT NULL DEFAULT 0,
  total_failed integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Templates próprios salvos pelos administradores (Disparo de E-mails)
CREATE TABLE IF NOT EXISTS public.bulk_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  html_content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Fila de retry automático para webhooks (Asaas, MP, Pagar.me, PagBank)
CREATE TABLE IF NOT EXISTS public.webhook_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL,
  function_name text NOT NULL,
  external_id text,
  correlation_id text,
  request_headers jsonb,
  request_payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  status text NOT NULL DEFAULT 'pending',
  last_status integer,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cart_abandonment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cart_item_count integer NOT NULL DEFAULT 0,
  email_sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  text text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.banner_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  image_mobile text NOT NULL DEFAULT '',
  image_tablet text NOT NULL DEFAULT '',
  image_desktop text NOT NULL DEFAULT '',
  link_url text DEFAULT '',
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.popups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.video_testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  video_url text NOT NULL,
  thumbnail_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  rating integer NOT NULL DEFAULT 5,
  comment text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, order_id)
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_role text NOT NULL DEFAULT 'user',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A/B testing de cards do catálogo (variant 'A' ou 'B')
CREATE TABLE IF NOT EXISTS public.ab_card_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant text NOT NULL,
  event_type text NOT NULL,
  session_id text NOT NULL,
  user_id uuid,
  product_id uuid,
  variation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Auditoria de mudanças nos toggles de gateway de pagamento
CREATE TABLE IF NOT EXISTS public.gateway_settings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  gateway text NOT NULL,
  setting_type text NOT NULL,
  old_value boolean,
  new_value boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Arquivos digitais (e-books, PDFs) ligados a uma variação
CREATE TABLE IF NOT EXISTS public.product_variation_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id uuid NOT NULL,
  file_name text NOT NULL,
  display_name text,
  file_path text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  cover_image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.increment_coupon_usage(_coupon_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _updated_count integer;
BEGIN
  UPDATE public.coupons
  SET current_uses = current_uses + 1, updated_at = now()
  WHERE LOWER(code) = LOWER(_coupon_code) AND active = true AND current_uses < max_uses;
  GET DIAGNOSTICS _updated_count = ROW_COUNT;
  RETURN _updated_count > 0;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_single_default_address()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.addresses SET is_default = false
    WHERE user_id = NEW.user_id AND id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

-- Mantém updated_at da fila de retry
CREATE OR REPLACE FUNCTION public.touch_webhook_retry_queue()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Liga um pedido recém-criado a um usuário existente pelo e-mail
CREATE OR REPLACE FUNCTION public.link_order_to_user_by_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.customer_user_id IS NULL
     AND NEW.customer_email IS NOT NULL
     AND NEW.customer_email <> '' THEN
    SELECT id INTO NEW.customer_user_id
    FROM auth.users
    WHERE LOWER(email) = LOWER(NEW.customer_email)
    LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

-- Quando um novo usuário se cadastra, conecta pedidos antigos com mesmo e-mail
CREATE OR REPLACE FUNCTION public.link_existing_orders_to_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    UPDATE public.orders
    SET customer_user_id = NEW.id
    WHERE customer_user_id IS NULL
      AND LOWER(customer_email) = LOWER(NEW.email);
  END IF;
  RETURN NEW;
END $$;

-- Dispara e-mail transacional via Edge Function send-email
-- Requer site_settings.service_role_key_for_triggers configurado.
CREATE OR REPLACE FUNCTION public.dispatch_order_email(_template text, _to text, _subject text, _data jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _supabase_url text;
  _service_role_key text;
  _payload jsonb;
BEGIN
  SELECT value INTO _supabase_url FROM public.site_settings WHERE key = 'supabase_functions_url' LIMIT 1;
  IF _supabase_url IS NULL OR _supabase_url = '' THEN
    RAISE NOTICE 'supabase_functions_url não configurado em site_settings — email não enviado';
    RETURN;
  END IF;

  SELECT value INTO _service_role_key FROM public.site_settings WHERE key = 'service_role_key_for_triggers' LIMIT 1;
  IF _service_role_key IS NULL OR _service_role_key = '' THEN
    RAISE NOTICE 'service_role_key_for_triggers não configurado em site_settings — email não enviado';
    RETURN;
  END IF;

  IF _to IS NULL OR _to = '' THEN
    RETURN;
  END IF;

  _payload := jsonb_build_object(
    'template', _template,
    'to', _to,
    'subject', _subject,
    'data', _data
  );

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body := _payload
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'dispatch_order_email failed: %', SQLERRM;
END $$;

-- Trigger em orders: dispara e-mails de pedido criado, pago, falha e rastreio
CREATE OR REPLACE FUNCTION public.trigger_send_order_emails()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _payment_method text;
  _failed_statuses text[] := ARRAY['REFUSED','REPROVED','CANCELLED','CANCELED','FAILED','REJECTED','DECLINED','refused','reproved','cancelled','canceled','failed','rejected','declined'];
  _paid_statuses   text[] := ARRAY['PAID','CONFIRMED','RECEIVED','paid','confirmed','received'];
BEGIN
  _payment_method := CASE
    WHEN NEW.payment_method ILIKE '%credit%' OR NEW.payment_method ILIKE '%card%' THEN 'Cartão de Crédito'
    WHEN NEW.payment_method ILIKE '%pix%' THEN 'PIX'
    WHEN NEW.payment_method ILIKE '%boleto%' THEN 'Boleto'
    ELSE COALESCE(NEW.payment_method, '—')
  END;

  IF (TG_OP = 'INSERT') THEN
    IF NEW.status = ANY(_failed_statuses) THEN
      PERFORM public.dispatch_order_email(
        'payment_failure', NEW.customer_email,
        'Pagamento Não Aprovado - ' || COALESCE(NEW.product_name, 'seu pedido'),
        jsonb_build_object('customer_name', NEW.customer_name, 'order_id', NEW.id,
          'product_name', NEW.product_name, 'total_value', NEW.total_value,
          'payment_method', _payment_method, 'error_message', 'Pagamento não aprovado.')
      );
      RETURN NEW;
    END IF;

    PERFORM public.dispatch_order_email(
      'order_created', NEW.customer_email,
      'Pedido recebido — ' || COALESCE(NEW.product_name, 'seu pedido'),
      jsonb_build_object('customer_name', NEW.customer_name, 'order_id', NEW.id,
        'product_name', NEW.product_name, 'total_value', NEW.total_value,
        'payment_method', _payment_method)
    );
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.status IS DISTINCT FROM NEW.status)
       AND NEW.status = ANY(_paid_statuses)
       AND NOT (OLD.status = ANY(_paid_statuses)) THEN
      PERFORM public.dispatch_order_email(
        'order_paid', NEW.customer_email,
        'Pagamento Aprovado - ' || COALESCE(NEW.product_name, 'seu pedido'),
        jsonb_build_object('customer_name', NEW.customer_name, 'order_id', NEW.id,
          'product_name', NEW.product_name, 'total_value', NEW.total_value,
          'payment_method', _payment_method)
      );
    END IF;

    IF (OLD.status IS DISTINCT FROM NEW.status)
       AND NEW.status = ANY(_failed_statuses)
       AND NOT (OLD.status = ANY(_failed_statuses)) THEN
      PERFORM public.dispatch_order_email(
        'payment_failure', NEW.customer_email,
        'Pagamento Não Aprovado - ' || COALESCE(NEW.product_name, 'seu pedido'),
        jsonb_build_object('customer_name', NEW.customer_name, 'order_id', NEW.id,
          'product_name', NEW.product_name, 'total_value', NEW.total_value,
          'payment_method', _payment_method, 'error_message', 'Pagamento não aprovado.')
      );
    END IF;

    IF (COALESCE(OLD.tracking_code,'') IS DISTINCT FROM COALESCE(NEW.tracking_code,''))
       AND NEW.tracking_code IS NOT NULL AND NEW.tracking_code <> '' THEN
      PERFORM public.dispatch_order_email(
        'shipping_update', NEW.customer_email,
        'Seu pedido foi enviado! Código: ' || NEW.tracking_code,
        jsonb_build_object('customer_name', NEW.customer_name, 'order_id', NEW.id,
          'product_name', NEW.product_name, 'tracking_code', NEW.tracking_code,
          'tracking_url', NEW.tracking_url, 'shipping_service', NEW.shipping_service)
      );
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- =============================================================================
-- TRIGGERS
-- =============================================================================
DO $$ DECLARE t text;
BEGIN
  FOR t IN VALUES ('addresses'),('banner_slides'),('cart_items'),('contact_preferences'),
                  ('coupons'),('orders'),('payment_links'),('popups'),('products'),
                  ('profiles'),('site_settings'),('support_tickets'),('bulk_email_templates'),
                  ('product_variation_files')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I;', t, t);
    EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();', t, t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS ensure_single_default ON public.addresses;
CREATE TRIGGER ensure_single_default
  BEFORE INSERT OR UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_address();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Touch updated_at na fila de retry de webhooks
DROP TRIGGER IF EXISTS touch_webhook_retry_queue_updated ON public.webhook_retry_queue;
CREATE TRIGGER touch_webhook_retry_queue_updated
  BEFORE UPDATE ON public.webhook_retry_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_webhook_retry_queue();

-- Dispara e-mails transacionais quando pedidos são criados/atualizados
-- Requer extensão pg_net habilitada e site_settings.service_role_key_for_triggers
DROP TRIGGER IF EXISTS send_order_emails ON public.orders;
CREATE TRIGGER send_order_emails
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trigger_send_order_emails();

-- Liga pedido recém-criado a usuário existente pelo e-mail
DROP TRIGGER IF EXISTS link_order_to_user_by_email_trg ON public.orders;
CREATE TRIGGER link_order_to_user_by_email_trg
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.link_order_to_user_by_email();

-- Liga pedidos antigos a um novo usuário recém-cadastrado
DROP TRIGGER IF EXISTS link_existing_orders_to_new_user_trg ON auth.users;
CREATE TRIGGER link_existing_orders_to_new_user_trg
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_existing_orders_to_new_user();

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_orders_customer_email      ON public.orders (customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_customer_user_id    ON public.orders (customer_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status              ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at          ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id          ON public.addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_products_user_id           ON public.products (user_id);
CREATE INDEX IF NOT EXISTS idx_products_active            ON public.products (active);
CREATE INDEX IF NOT EXISTS idx_product_variations_product_id ON public.product_variations (product_id);
CREATE INDEX IF NOT EXISTS idx_product_upsells_product_id ON public.product_upsells (product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id         ON public.cart_items (user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON public.support_messages (ticket_id);
CREATE INDEX IF NOT EXISTS idx_shipping_logs_order_id     ON public.shipping_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_order_id      ON public.payment_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id            ON public.reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id         ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_gateway       ON public.webhook_logs (gateway);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at    ON public.webhook_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_order_id      ON public.webhook_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_email_send_log_created_at  ON public.email_send_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient   ON public.email_send_log (recipient_email);
CREATE INDEX IF NOT EXISTS idx_api_idempotency_expires    ON public.api_idempotency_keys (expires_at);
CREATE INDEX IF NOT EXISTS idx_bulk_email_campaigns_status     ON public.bulk_email_campaigns (status);
CREATE INDEX IF NOT EXISTS idx_bulk_email_campaigns_created_at ON public.bulk_email_campaigns (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_email_templates_user_id    ON public.bulk_email_templates (user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_retry_queue_status      ON public.webhook_retry_queue (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_webhook_retry_queue_gateway     ON public.webhook_retry_queue (gateway);
CREATE INDEX IF NOT EXISTS idx_ab_card_events_session         ON public.ab_card_events (session_id);
CREATE INDEX IF NOT EXISTS idx_ab_card_events_created_at      ON public.ab_card_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ab_card_events_product         ON public.ab_card_events (product_id);
CREATE INDEX IF NOT EXISTS idx_gateway_audit_created_at       ON public.gateway_settings_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv_files_variation_id          ON public.product_variation_files (variation_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE public.ab_card_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_idempotency_keys  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banner_slides         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_email_campaigns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_email_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_abandonment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_preferences   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gateway_settings_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_links         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popups                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_upsells       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variation_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_testimonials    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_retry_queue   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wholesale_prices      ENABLE ROW LEVEL SECURITY;

-- LIMPA TODAS AS POLICIES EXISTENTES (idempotência)
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname IN ('public','storage')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- =============================================================================
-- POLICIES
-- =============================================================================
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users can view own addresses" ON public.addresses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own addresses" ON public.addresses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own addresses" ON public.addresses FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own addresses" ON public.addresses FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated users can update their products" ON public.products FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can delete their products" ON public.products FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view variations" ON public.product_variations FOR SELECT USING (true);
CREATE POLICY "Owner can insert variations" ON public.product_variations FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.products WHERE id = product_variations.product_id AND user_id = auth.uid()));
CREATE POLICY "Owner can update variations" ON public.product_variations FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.products WHERE id = product_variations.product_id AND user_id = auth.uid()));
CREATE POLICY "Owner can delete variations" ON public.product_variations FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.products WHERE id = product_variations.product_id AND user_id = auth.uid()));

CREATE POLICY "Anyone can view wholesale prices" ON public.wholesale_prices FOR SELECT USING (true);
CREATE POLICY "Owner can insert wholesale prices" ON public.wholesale_prices FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.product_variations pv JOIN public.products p ON p.id=pv.product_id WHERE pv.id=variation_id AND p.user_id=auth.uid()));
CREATE POLICY "Owner can update wholesale prices" ON public.wholesale_prices FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.product_variations pv JOIN public.products p ON p.id=pv.product_id WHERE pv.id=variation_id AND p.user_id=auth.uid()));
CREATE POLICY "Owner can delete wholesale prices" ON public.wholesale_prices FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.product_variations pv JOIN public.products p ON p.id=pv.product_id WHERE pv.id=variation_id AND p.user_id=auth.uid()));

-- Product Upsells (dono do produto controla)
CREATE POLICY "Anyone can view upsells" ON public.product_upsells FOR SELECT USING (true);
CREATE POLICY "Owner can insert upsells" ON public.product_upsells FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_upsells.product_id AND p.user_id = auth.uid()));
CREATE POLICY "Owner can update upsells" ON public.product_upsells FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_upsells.product_id AND p.user_id = auth.uid()));
CREATE POLICY "Owner can delete upsells" ON public.product_upsells FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_upsells.product_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can view their own cart items" ON public.cart_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all cart items" ON public.cart_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users can insert their own cart items" ON public.cart_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own cart items" ON public.cart_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own cart items" ON public.cart_items FOR DELETE USING (auth.uid() = user_id);

-- Contact Preferences
CREATE POLICY "Users view own contact preferences" ON public.contact_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own contact preferences" ON public.contact_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own contact preferences" ON public.contact_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all contact preferences" ON public.contact_preferences FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Anyone can insert orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can view orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Customers can view their own orders" ON public.orders FOR SELECT USING (auth.uid() = customer_user_id);
CREATE POLICY "Service role can update orders" ON public.orders FOR UPDATE USING (true);
CREATE POLICY "Admins can delete orders" ON public.orders FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Anyone can view active coupons" ON public.coupons FOR SELECT USING (active = true);
CREATE POLICY "Admins can manage coupons" ON public.coupons FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Public can read coupon_products" ON public.coupon_products FOR SELECT USING (true);
CREATE POLICY "Admins can manage coupon_products" ON public.coupon_products FOR ALL USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Anyone can view active payment links" ON public.payment_links FOR SELECT USING (active = true);
CREATE POLICY "Admins can manage payment links" ON public.payment_links FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Anyone can insert payment logs" ON public.payment_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view payment logs" ON public.payment_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete payment logs" ON public.payment_logs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Authenticated users can view shipping logs" ON public.shipping_logs FOR SELECT USING (true);
CREATE POLICY "Service role can insert shipping logs" ON public.shipping_logs FOR INSERT WITH CHECK (true);

-- Webhook Logs (somente admins; service role bypassa RLS por padrão)
CREATE POLICY "Admins can view webhook logs" ON public.webhook_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete webhook logs" ON public.webhook_logs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Email send log (admins only — service role insere)
CREATE POLICY "Admins can view email send log" ON public.email_send_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete email send log" ON public.email_send_log FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- API idempotency keys (admins read-only — service role gerencia)
CREATE POLICY "Admins can view idempotency keys" ON public.api_idempotency_keys FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Bulk Email Campaigns / Templates (admins gerenciam tudo)
CREATE POLICY "Admins manage bulk_email_campaigns" ON public.bulk_email_campaigns FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage bulk_email_templates" ON public.bulk_email_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Webhook retry queue (admins read/update/delete; service role insere)
CREATE POLICY "Admins can view webhook retry queue" ON public.webhook_retry_queue FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can update webhook retry queue" ON public.webhook_retry_queue FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete webhook retry queue" ON public.webhook_retry_queue FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Service role full access" ON public.cart_abandonment_logs FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view active banners" ON public.banners FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert banners" ON public.banners FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated users can update their banners" ON public.banners FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can delete their banners" ON public.banners FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view banner slides" ON public.banner_slides FOR SELECT USING (true);
CREATE POLICY "Auth users can insert banner slides" ON public.banner_slides FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth users can update banner slides" ON public.banner_slides FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Auth users can delete banner slides" ON public.banner_slides FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view active popups" ON public.popups FOR SELECT USING (true);
CREATE POLICY "Admins can insert popups" ON public.popups FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can update popups" ON public.popups FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete popups" ON public.popups FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Anyone can view testimonials" ON public.video_testimonials FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert testimonials" ON public.video_testimonials FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated users can update testimonials" ON public.video_testimonials FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can delete testimonials" ON public.video_testimonials FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view reviews publicly" ON public.reviews FOR SELECT TO anon USING (true);
CREATE POLICY "Authenticated can view all reviews" ON public.reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view own reviews" ON public.reviews FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reviews" ON public.reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reviews" ON public.reviews FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reviews" ON public.reviews FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can delete any review" ON public.reviews FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users can view own tickets" ON public.support_tickets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all tickets" ON public.support_tickets FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users can insert own tickets" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tickets" ON public.support_tickets FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can update any ticket" ON public.support_tickets FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users can view own ticket messages" ON public.support_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.support_tickets WHERE id = ticket_id AND user_id = auth.uid()));
CREATE POLICY "Admins can view all messages" ON public.support_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users can insert messages on own tickets" ON public.support_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.support_tickets WHERE id = ticket_id AND user_id = auth.uid()));
CREATE POLICY "Admins can insert messages" ON public.support_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "Anyone can view settings" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "Admins can insert settings" ON public.site_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can update settings" ON public.site_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete settings" ON public.site_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- A/B card events: público insere, admin lê/deleta
CREATE POLICY "Anyone can insert ab events" ON public.ab_card_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view ab events" ON public.ab_card_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete ab events" ON public.ab_card_events FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Auditoria de gateways: somente admin
CREATE POLICY "Admins can view gateway audit" ON public.gateway_settings_audit FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can insert gateway audit" ON public.gateway_settings_audit FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') AND auth.uid() = user_id);
CREATE POLICY "Admins can delete gateway audit" ON public.gateway_settings_audit FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Arquivos digitais: dono gerencia; cliente acessa se tem pedido pago
CREATE POLICY "Owner can view digital files" ON public.product_variation_files FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.product_variations pv JOIN public.products p ON p.id = pv.product_id WHERE pv.id = product_variation_files.variation_id AND p.user_id = auth.uid()));
CREATE POLICY "Owner can insert digital files" ON public.product_variation_files FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.product_variations pv JOIN public.products p ON p.id = pv.product_id WHERE pv.id = product_variation_files.variation_id AND p.user_id = auth.uid()));
CREATE POLICY "Owner can update digital files" ON public.product_variation_files FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.product_variations pv JOIN public.products p ON p.id = pv.product_id WHERE pv.id = product_variation_files.variation_id AND p.user_id = auth.uid()));
CREATE POLICY "Owner can delete digital files" ON public.product_variation_files FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.product_variations pv JOIN public.products p ON p.id = pv.product_id WHERE pv.id = product_variation_files.variation_id AND p.user_id = auth.uid()));
CREATE POLICY "Customers can view files of their paid orders" ON public.product_variation_files FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.product_variations pv
    JOIN public.orders o ON UPPER(o.status) = ANY (ARRAY['PAID','CONFIRMED','RECEIVED','RECEIVED_IN_CASH'])
    WHERE pv.id = product_variation_files.variation_id
      AND o.customer_user_id = auth.uid()
      AND o.product_name ILIKE ('%' || (SELECT name FROM public.products WHERE id = pv.product_id) || '%')
  )
);

-- =============================================================================
-- STORAGE BUCKETS
-- =============================================================================
INSERT INTO storage.buckets (id, name, public) VALUES
  ('product-images', 'product-images', true),
  ('testimonial-videos', 'testimonial-videos', true),
  ('banner-images', 'banner-images', true),
  ('digital-file-covers', 'digital-file-covers', true),
  ('digital-files', 'digital-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read product-images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Auth upload product-images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "Auth update product-images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images');
CREATE POLICY "Auth delete product-images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images');

CREATE POLICY "Public read testimonial-videos" ON storage.objects FOR SELECT USING (bucket_id = 'testimonial-videos');
CREATE POLICY "Auth upload testimonial-videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'testimonial-videos');
CREATE POLICY "Auth update testimonial-videos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'testimonial-videos');
CREATE POLICY "Auth delete testimonial-videos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'testimonial-videos');

CREATE POLICY "Public read banner-images" ON storage.objects FOR SELECT USING (bucket_id = 'banner-images');
CREATE POLICY "Auth upload banner-images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'banner-images');
CREATE POLICY "Auth update banner-images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'banner-images');
CREATE POLICY "Auth delete banner-images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'banner-images');

-- Capas de e-books / PDFs (públicas para exibir miniatura)
CREATE POLICY "Public read digital-file-covers" ON storage.objects FOR SELECT USING (bucket_id = 'digital-file-covers');
CREATE POLICY "Auth upload digital-file-covers" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'digital-file-covers');
CREATE POLICY "Auth update digital-file-covers" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'digital-file-covers');
CREATE POLICY "Auth delete digital-file-covers" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'digital-file-covers');

-- Arquivos digitais (privados; download via signed URL gerada por edge function)
CREATE POLICY "Auth read digital-files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'digital-files');
CREATE POLICY "Auth upload digital-files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'digital-files');
CREATE POLICY "Auth update digital-files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'digital-files');
CREATE POLICY "Auth delete digital-files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'digital-files');

-- =============================================================================
-- REALTIME
-- =============================================================================
ALTER TABLE public.orders             REPLICA IDENTITY FULL;
ALTER TABLE public.cart_items         REPLICA IDENTITY FULL;
ALTER TABLE public.support_tickets    REPLICA IDENTITY FULL;
ALTER TABLE public.support_messages   REPLICA IDENTITY FULL;
ALTER TABLE public.payment_logs       REPLICA IDENTITY FULL;
ALTER TABLE public.products           REPLICA IDENTITY FULL;
ALTER TABLE public.product_variations REPLICA IDENTITY FULL;
ALTER TABLE public.product_upsells    REPLICA IDENTITY FULL;
ALTER TABLE public.site_settings      REPLICA IDENTITY FULL;
ALTER TABLE public.reviews            REPLICA IDENTITY FULL;
ALTER TABLE public.webhook_logs       REPLICA IDENTITY FULL;
ALTER TABLE public.email_send_log     REPLICA IDENTITY FULL;
ALTER TABLE public.bulk_email_campaigns REPLICA IDENTITY FULL;
ALTER TABLE public.webhook_retry_queue  REPLICA IDENTITY FULL;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['orders','cart_items','support_tickets','support_messages',
                         'payment_logs','products','product_variations','product_upsells',
                         'site_settings','reviews','webhook_logs','email_send_log',
                         'bulk_email_campaigns','webhook_retry_queue'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
