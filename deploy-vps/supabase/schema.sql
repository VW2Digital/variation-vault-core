--
-- PostgreSQL database dump
--

\restrict rdLBuiIaMglIP15yoOIpaDbMcTAU74EnFdJhPvqZBtIfsC07ui2c3TrEmu0A86o

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'user'
);


--
-- Name: dispatch_order_email(text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_order_email(_template text, _to text, _subject text, _data jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _supabase_url text;
  _service_role_key text;
  _payload jsonb;
BEGIN
  -- Lê config do vault (criada pelo setup_email_infra) ou usa fallback
  -- Se não existir vault, lê de site_settings
  SELECT value INTO _supabase_url FROM public.site_settings WHERE key = 'supabase_functions_url' LIMIT 1;
  IF _supabase_url IS NULL OR _supabase_url = '' THEN
    _supabase_url := 'https://vkomfiplmhpkhfpidrng.supabase.co';
  END IF;

  -- Service role key precisa estar em site_settings (chave: service_role_key_for_triggers)
  -- ou em uma extensão de vault. Para simplificar, lemos de site_settings.
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
END;
$$;


--
-- Name: ensure_single_default_address(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_single_default_address() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.addresses SET is_default = false
    WHERE user_id = NEW.user_id AND id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: increment_coupon_usage(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_coupon_usage(_coupon_code text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- A contagem agora é em tempo real via view coupons_with_usage.
  -- Esta função permanece apenas para compatibilidade com webhooks existentes.
  -- Retorna true se o cupom existe e está ativo.
  RETURN EXISTS (
    SELECT 1 FROM public.coupons
    WHERE LOWER(code) = LOWER(_coupon_code) AND active = true
  );
END;
$$;


--
-- Name: link_existing_orders_to_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_existing_orders_to_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    UPDATE public.orders
    SET customer_user_id = NEW.id
    WHERE customer_user_id IS NULL
      AND LOWER(customer_email) = LOWER(NEW.email);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: link_order_to_user_by_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_order_to_user_by_email() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END;
$$;


--
-- Name: touch_webhook_retry_queue(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_webhook_retry_queue() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: trigger_send_order_emails(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_send_order_emails() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _payment_method text;
  _failed_statuses text[] := ARRAY['REFUSED','REPROVED','CANCELLED','CANCELED','FAILED','REJECTED','DECLINED','refused','reproved','cancelled','canceled','failed','rejected','declined'];
  _paid_statuses   text[] := ARRAY['PAID','CONFIRMED','RECEIVED','paid','confirmed','received'];
BEGIN
  -- Normaliza método de pagamento para exibição
  _payment_method := CASE
    WHEN NEW.payment_method ILIKE '%credit%' OR NEW.payment_method ILIKE '%card%' THEN 'Cartão de Crédito'
    WHEN NEW.payment_method ILIKE '%pix%' THEN 'PIX'
    WHEN NEW.payment_method ILIKE '%boleto%' THEN 'Boleto'
    ELSE COALESCE(NEW.payment_method, '—')
  END;

  -- ── 1. INSERT ──────────────────────────────────────────────────────
  IF (TG_OP = 'INSERT') THEN
    -- Se o pedido já nasce recusado/cancelado, NÃO mandar "Pedido recebido".
    -- Em vez disso, dispara o email de falha de pagamento.
    IF NEW.status = ANY(_failed_statuses) THEN
      PERFORM public.dispatch_order_email(
        'payment_failure',
        NEW.customer_email,
        'Pagamento Não Aprovado - ' || COALESCE(NEW.product_name, 'seu pedido'),
        jsonb_build_object(
          'customer_name', NEW.customer_name,
          'order_id', NEW.id,
          'product_name', NEW.product_name,
          'total_value', NEW.total_value,
          'payment_method', _payment_method,
          'error_message', 'Pagamento não aprovado.'
        )
      );
      RETURN NEW;
    END IF;

    PERFORM public.dispatch_order_email(
      'order_created',
      NEW.customer_email,
      'Pedido recebido — ' || COALESCE(NEW.product_name, 'seu pedido'),
      jsonb_build_object(
        'customer_name', NEW.customer_name,
        'order_id', NEW.id,
        'product_name', NEW.product_name,
        'total_value', NEW.total_value,
        'payment_method', _payment_method
      )
    );
    RETURN NEW;
  END IF;

  -- ── 2. UPDATE ──────────────────────────────────────────────────────
  IF (TG_OP = 'UPDATE') THEN
    -- Pagamento aprovado
    IF (OLD.status IS DISTINCT FROM NEW.status)
       AND NEW.status = ANY(_paid_statuses)
       AND NOT (OLD.status = ANY(_paid_statuses)) THEN
      PERFORM public.dispatch_order_email(
        'order_paid',
        NEW.customer_email,
        'Pagamento Aprovado - ' || COALESCE(NEW.product_name, 'seu pedido'),
        jsonb_build_object(
          'customer_name', NEW.customer_name,
          'order_id', NEW.id,
          'product_name', NEW.product_name,
          'total_value', NEW.total_value,
          'payment_method', _payment_method
        )
      );
    END IF;

    -- Pagamento recusado / cancelado
    IF (OLD.status IS DISTINCT FROM NEW.status)
       AND NEW.status = ANY(_failed_statuses)
       AND NOT (OLD.status = ANY(_failed_statuses)) THEN
      PERFORM public.dispatch_order_email(
        'payment_failure',
        NEW.customer_email,
        'Pagamento Não Aprovado - ' || COALESCE(NEW.product_name, 'seu pedido'),
        jsonb_build_object(
          'customer_name', NEW.customer_name,
          'order_id', NEW.id,
          'product_name', NEW.product_name,
          'total_value', NEW.total_value,
          'payment_method', _payment_method,
          'error_message', 'Pagamento não aprovado.'
        )
      );
    END IF;

    -- Código de rastreio adicionado/atualizado
    IF (COALESCE(OLD.tracking_code, '') IS DISTINCT FROM COALESCE(NEW.tracking_code, ''))
       AND NEW.tracking_code IS NOT NULL
       AND NEW.tracking_code <> '' THEN
      PERFORM public.dispatch_order_email(
        'shipping_update',
        NEW.customer_email,
        'Seu pedido foi enviado! Código: ' || NEW.tracking_code,
        jsonb_build_object(
          'customer_name', NEW.customer_name,
          'order_id', NEW.id,
          'product_name', NEW.product_name,
          'tracking_code', NEW.tracking_code,
          'tracking_url', NEW.tracking_url,
          'shipping_service', NEW.shipping_service
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ab_card_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ab_card_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variant text NOT NULL,
    event_type text NOT NULL,
    product_id uuid,
    variation_id uuid,
    session_id text NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ab_card_events_event_type_check CHECK ((event_type = ANY (ARRAY['impression'::text, 'cta_click'::text]))),
    CONSTRAINT ab_card_events_variant_check CHECK ((variant = ANY (ARRAY['A'::text, 'B'::text])))
);


--
-- Name: addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    label text DEFAULT 'Casa'::text NOT NULL,
    postal_code text NOT NULL,
    street text NOT NULL,
    number text NOT NULL,
    complement text DEFAULT ''::text,
    district text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: api_idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_idempotency_keys (
    key text NOT NULL,
    route text NOT NULL,
    request_hash text NOT NULL,
    response_status integer NOT NULL,
    response_body jsonb NOT NULL,
    order_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL
);


--
-- Name: banner_slides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banner_slides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    image_desktop text DEFAULT ''::text NOT NULL,
    image_tablet text DEFAULT ''::text NOT NULL,
    image_mobile text DEFAULT ''::text NOT NULL,
    link_url text DEFAULT ''::text,
    product_id uuid,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    text text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: bulk_email_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bulk_email_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid,
    subject text NOT NULL,
    html_content text NOT NULL,
    audience_type text NOT NULL,
    total_recipients integer DEFAULT 0 NOT NULL,
    total_sent integer DEFAULT 0 NOT NULL,
    total_failed integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: bulk_email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bulk_email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    html_content text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cart_abandonment_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_abandonment_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email_sent_at timestamp with time zone DEFAULT now() NOT NULL,
    cart_item_count integer DEFAULT 0 NOT NULL
);


--
-- Name: cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variation_id uuid NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.cart_items REPLICA IDENTITY FULL;


--
-- Name: contact_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    allow_email_marketing boolean DEFAULT true NOT NULL,
    allow_whatsapp_marketing boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: coupon_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupon_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coupon_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    discount_type text DEFAULT 'percentage'::text NOT NULL,
    discount_value numeric DEFAULT 0 NOT NULL,
    max_uses integer DEFAULT 1 NOT NULL,
    current_uses integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    product_id uuid,
    CONSTRAINT coupons_discount_type_check CHECK ((discount_type = ANY (ARRAY['percentage'::text, 'fixed'::text])))
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_name text NOT NULL,
    customer_email text NOT NULL,
    customer_cpf text NOT NULL,
    customer_phone text,
    asaas_customer_id text,
    asaas_payment_id text,
    product_name text NOT NULL,
    dosage text,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    total_value numeric DEFAULT 0 NOT NULL,
    payment_method text DEFAULT 'pix'::text NOT NULL,
    installments integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tracking_code text,
    delivery_status text DEFAULT 'PROCESSING'::text,
    customer_user_id uuid,
    shipping_status text DEFAULT 'pending'::text,
    shipping_service text,
    shipment_id text,
    label_url text,
    tracking_url text,
    customer_address text,
    customer_number text,
    customer_complement text,
    customer_district text,
    customer_city text,
    customer_state text,
    customer_postal_code text,
    shipping_cost numeric DEFAULT 0,
    selected_service_id integer,
    payment_gateway text DEFAULT 'asaas'::text,
    gateway_environment text DEFAULT 'sandbox'::text,
    coupon_code text,
    coupon_discount numeric DEFAULT 0
);

ALTER TABLE ONLY public.orders REPLICA IDENTITY FULL;


--
-- Name: coupons_with_usage; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.coupons_with_usage WITH (security_invoker='on') AS
 SELECT id,
    user_id,
    code,
    discount_type,
    discount_value,
    max_uses,
    active,
    product_id,
    created_at,
    updated_at,
    COALESCE(( SELECT (count(*))::integer AS count
           FROM public.orders o
          WHERE ((upper(o.coupon_code) = upper(c.code)) AND (o.status = ANY (ARRAY['PAID'::text, 'CONFIRMED'::text, 'RECEIVED'::text, 'paid'::text, 'confirmed'::text, 'received'::text])))), 0) AS current_uses
   FROM public.coupons c;


--
-- Name: email_send_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_send_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id text,
    template_name text NOT NULL,
    recipient_email text NOT NULL,
    subject text,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    provider_response jsonb,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gateway_settings_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gateway_settings_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    user_email text,
    gateway text NOT NULL,
    setting_type text NOT NULL,
    old_value boolean,
    new_value boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text,
    amount numeric DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    pix_discount_percent numeric DEFAULT 0,
    max_installments integer DEFAULT 1,
    fantasy_name text,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL
);


--
-- Name: payment_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    customer_email text,
    customer_name text,
    payment_method text,
    error_message text NOT NULL,
    error_source text DEFAULT 'frontend'::text NOT NULL,
    request_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.payment_logs REPLICA IDENTITY FULL;


--
-- Name: popups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.popups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    image_url text DEFAULT ''::text NOT NULL,
    product_id uuid,
    active boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: product_upsells; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_upsells (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    upsell_product_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_upsells_no_self CHECK ((product_id <> upsell_product_id))
);


--
-- Name: product_variation_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variation_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variation_id uuid NOT NULL,
    file_path text NOT NULL,
    file_name text NOT NULL,
    file_size bigint DEFAULT 0 NOT NULL,
    mime_type text DEFAULT 'application/octet-stream'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    display_name text,
    cover_image_url text
);


--
-- Name: product_variations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    dosage text NOT NULL,
    price numeric DEFAULT 0 NOT NULL,
    in_stock boolean DEFAULT true NOT NULL,
    is_offer boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text DEFAULT ''::text,
    images text[] DEFAULT '{}'::text[],
    offer_price numeric DEFAULT 0,
    subtitle text DEFAULT ''::text,
    stock_quantity integer DEFAULT 0 NOT NULL,
    is_digital boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.product_variations REPLICA IDENTITY FULL;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    subtitle text DEFAULT ''::text,
    description text DEFAULT ''::text,
    active_ingredient text DEFAULT ''::text,
    pharma_form text DEFAULT ''::text,
    administration_route text DEFAULT ''::text,
    frequency text DEFAULT ''::text,
    images text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    free_shipping boolean DEFAULT false NOT NULL,
    free_shipping_min_value numeric DEFAULT 0,
    is_bestseller boolean DEFAULT false NOT NULL,
    pix_discount_percent numeric DEFAULT 0,
    max_installments integer DEFAULT 6,
    installments_interest text DEFAULT 'sem_juros'::text,
    fantasy_name text DEFAULT ''::text,
    sort_order integer DEFAULT 0 NOT NULL,
    category text DEFAULT ''::text,
    active boolean DEFAULT true NOT NULL
);

ALTER TABLE ONLY public.products REPLICA IDENTITY FULL;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cpf text DEFAULT ''::text,
    avatar_url text DEFAULT ''::text
);


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    order_id uuid NOT NULL,
    product_name text NOT NULL,
    rating integer DEFAULT 5 NOT NULL,
    comment text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.reviews REPLICA IDENTITY FULL;


--
-- Name: shipping_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    event_type text,
    request_payload jsonb,
    response_payload jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL
);

ALTER TABLE ONLY public.site_settings REPLICA IDENTITY FULL;


--
-- Name: support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    sender_role text DEFAULT 'user'::text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.support_messages REPLICA IDENTITY FULL;


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.support_tickets REPLICA IDENTITY FULL;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


--
-- Name: video_testimonials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_testimonials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    video_url text NOT NULL,
    thumbnail_url text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: webhook_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gateway text NOT NULL,
    event_type text,
    http_status integer DEFAULT 200 NOT NULL,
    latency_ms integer,
    signature_valid boolean,
    signature_error text,
    order_id uuid,
    external_id text,
    request_headers jsonb,
    request_payload jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.webhook_logs REPLICA IDENTITY FULL;


--
-- Name: webhook_retry_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_retry_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gateway text NOT NULL,
    function_name text NOT NULL,
    external_id text,
    request_payload jsonb NOT NULL,
    request_headers jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 6 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    last_status integer,
    correlation_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wholesale_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wholesale_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variation_id uuid NOT NULL,
    min_quantity integer NOT NULL,
    price numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ab_card_events ab_card_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_card_events
    ADD CONSTRAINT ab_card_events_pkey PRIMARY KEY (id);


--
-- Name: addresses addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_pkey PRIMARY KEY (id);


--
-- Name: api_idempotency_keys api_idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_idempotency_keys
    ADD CONSTRAINT api_idempotency_keys_pkey PRIMARY KEY (key);


--
-- Name: banner_slides banner_slides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banner_slides
    ADD CONSTRAINT banner_slides_pkey PRIMARY KEY (id);


--
-- Name: banners banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banners
    ADD CONSTRAINT banners_pkey PRIMARY KEY (id);


--
-- Name: bulk_email_campaigns bulk_email_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_email_campaigns
    ADD CONSTRAINT bulk_email_campaigns_pkey PRIMARY KEY (id);


--
-- Name: bulk_email_templates bulk_email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_email_templates
    ADD CONSTRAINT bulk_email_templates_pkey PRIMARY KEY (id);


--
-- Name: cart_abandonment_logs cart_abandonment_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_abandonment_logs
    ADD CONSTRAINT cart_abandonment_logs_pkey PRIMARY KEY (id);


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- Name: cart_items cart_items_user_id_variation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_user_id_variation_id_key UNIQUE (user_id, variation_id);


--
-- Name: contact_preferences contact_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_preferences
    ADD CONSTRAINT contact_preferences_pkey PRIMARY KEY (id);


--
-- Name: contact_preferences contact_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_preferences
    ADD CONSTRAINT contact_preferences_user_id_key UNIQUE (user_id);


--
-- Name: coupon_products coupon_products_coupon_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_products
    ADD CONSTRAINT coupon_products_coupon_id_product_id_key UNIQUE (coupon_id, product_id);


--
-- Name: coupon_products coupon_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_products
    ADD CONSTRAINT coupon_products_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: email_send_log email_send_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_send_log
    ADD CONSTRAINT email_send_log_pkey PRIMARY KEY (id);


--
-- Name: gateway_settings_audit gateway_settings_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gateway_settings_audit
    ADD CONSTRAINT gateway_settings_audit_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payment_links payment_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_pkey PRIMARY KEY (id);


--
-- Name: payment_links payment_links_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_slug_key UNIQUE (slug);


--
-- Name: payment_logs payment_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_logs
    ADD CONSTRAINT payment_logs_pkey PRIMARY KEY (id);


--
-- Name: popups popups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.popups
    ADD CONSTRAINT popups_pkey PRIMARY KEY (id);


--
-- Name: product_upsells product_upsells_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_upsells
    ADD CONSTRAINT product_upsells_pkey PRIMARY KEY (id);


--
-- Name: product_upsells product_upsells_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_upsells
    ADD CONSTRAINT product_upsells_unique UNIQUE (product_id, upsell_product_id);


--
-- Name: product_variation_files product_variation_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variation_files
    ADD CONSTRAINT product_variation_files_pkey PRIMARY KEY (id);


--
-- Name: product_variations product_variations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variations
    ADD CONSTRAINT product_variations_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_user_id_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_user_id_order_id_key UNIQUE (user_id, order_id);


--
-- Name: shipping_logs shipping_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_logs
    ADD CONSTRAINT shipping_logs_pkey PRIMARY KEY (id);


--
-- Name: site_settings site_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_key_key UNIQUE (key);


--
-- Name: site_settings site_settings_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_key_unique UNIQUE (key);


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);


--
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: video_testimonials video_testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_testimonials
    ADD CONSTRAINT video_testimonials_pkey PRIMARY KEY (id);


--
-- Name: webhook_logs webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: webhook_retry_queue webhook_retry_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_retry_queue
    ADD CONSTRAINT webhook_retry_queue_pkey PRIMARY KEY (id);


--
-- Name: wholesale_prices wholesale_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wholesale_prices
    ADD CONSTRAINT wholesale_prices_pkey PRIMARY KEY (id);


--
-- Name: coupons_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX coupons_code_unique ON public.coupons USING btree (upper(code));


--
-- Name: idx_ab_card_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ab_card_events_created_at ON public.ab_card_events USING btree (created_at DESC);


--
-- Name: idx_ab_card_events_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ab_card_events_session ON public.ab_card_events USING btree (session_id);


--
-- Name: idx_ab_card_events_variant_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ab_card_events_variant_type ON public.ab_card_events USING btree (variant, event_type);


--
-- Name: idx_addresses_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_addresses_user_id ON public.addresses USING btree (user_id);


--
-- Name: idx_api_idempotency_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_idempotency_expires ON public.api_idempotency_keys USING btree (expires_at);


--
-- Name: idx_bulk_email_campaigns_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_email_campaigns_created_at ON public.bulk_email_campaigns USING btree (created_at DESC);


--
-- Name: idx_email_send_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_send_log_created_at ON public.email_send_log USING btree (created_at DESC);


--
-- Name: idx_email_send_log_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_send_log_message_id ON public.email_send_log USING btree (message_id);


--
-- Name: idx_email_send_log_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_send_log_status ON public.email_send_log USING btree (status);


--
-- Name: idx_email_send_log_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_send_log_template ON public.email_send_log USING btree (template_name);


--
-- Name: idx_gateway_audit_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gateway_audit_created_at ON public.gateway_settings_audit USING btree (created_at DESC);


--
-- Name: idx_gateway_audit_gateway; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gateway_audit_gateway ON public.gateway_settings_audit USING btree (gateway);


--
-- Name: idx_orders_customer_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_customer_email ON public.orders USING btree (customer_email);


--
-- Name: idx_orders_customer_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_customer_email_lower ON public.orders USING btree (lower(customer_email));


--
-- Name: idx_orders_customer_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_customer_user_id ON public.orders USING btree (customer_user_id);


--
-- Name: idx_product_upsells_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_upsells_product_id ON public.product_upsells USING btree (product_id);


--
-- Name: idx_product_variations_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_variations_product_id ON public.product_variations USING btree (product_id);


--
-- Name: idx_products_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_active ON public.products USING btree (active);


--
-- Name: idx_products_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_user_id ON public.products USING btree (user_id);


--
-- Name: idx_pvf_variation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pvf_variation ON public.product_variation_files USING btree (variation_id);


--
-- Name: idx_shipping_logs_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipping_logs_order_id ON public.shipping_logs USING btree (order_id);


--
-- Name: idx_support_messages_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_messages_ticket_id ON public.support_messages USING btree (ticket_id);


--
-- Name: idx_webhook_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs USING btree (created_at DESC);


--
-- Name: idx_webhook_logs_gateway; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_logs_gateway ON public.webhook_logs USING btree (gateway, created_at DESC);


--
-- Name: idx_webhook_logs_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_logs_order_id ON public.webhook_logs USING btree (order_id);


--
-- Name: idx_webhook_retry_queue_gateway; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_retry_queue_gateway ON public.webhook_retry_queue USING btree (gateway, created_at DESC);


--
-- Name: idx_webhook_retry_queue_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_retry_queue_pending ON public.webhook_retry_queue USING btree (status, next_attempt_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: addresses ensure_single_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ensure_single_default BEFORE INSERT OR UPDATE ON public.addresses FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_address();


--
-- Name: orders orders_send_email_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_send_email_insert AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trigger_send_order_emails();


--
-- Name: orders orders_send_email_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_send_email_update AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trigger_send_order_emails();


--
-- Name: orders trg_link_order_to_user; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_link_order_to_user BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.link_order_to_user_by_email();


--
-- Name: webhook_retry_queue trg_touch_webhook_retry_queue; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch_webhook_retry_queue BEFORE UPDATE ON public.webhook_retry_queue FOR EACH ROW EXECUTE FUNCTION public.touch_webhook_retry_queue();


--
-- Name: addresses update_addresses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_addresses_updated_at BEFORE UPDATE ON public.addresses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: banner_slides update_banner_slides_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_banner_slides_updated_at BEFORE UPDATE ON public.banner_slides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bulk_email_templates update_bulk_email_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bulk_email_templates_updated_at BEFORE UPDATE ON public.bulk_email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cart_items update_cart_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cart_items_updated_at BEFORE UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contact_preferences update_contact_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contact_preferences_updated_at BEFORE UPDATE ON public.contact_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: coupons update_coupons_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_coupons_updated_at BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: orders update_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payment_links update_payment_links_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_payment_links_updated_at BEFORE UPDATE ON public.payment_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: popups update_popups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_popups_updated_at BEFORE UPDATE ON public.popups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: products update_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_variation_files update_pvf_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pvf_updated_at BEFORE UPDATE ON public.product_variation_files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: site_settings update_site_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_site_settings_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: support_tickets update_support_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: addresses addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: banner_slides banner_slides_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banner_slides
    ADD CONSTRAINT banner_slides_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: bulk_email_campaigns bulk_email_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_email_campaigns
    ADD CONSTRAINT bulk_email_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: cart_items cart_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE CASCADE;


--
-- Name: coupon_products coupon_products_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_products
    ADD CONSTRAINT coupon_products_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE CASCADE;


--
-- Name: coupon_products coupon_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_products
    ADD CONSTRAINT coupon_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: coupons coupons_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: orders orders_customer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_user_id_fkey FOREIGN KEY (customer_user_id) REFERENCES auth.users(id);


--
-- Name: payment_logs payment_logs_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_logs
    ADD CONSTRAINT payment_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: popups popups_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.popups
    ADD CONSTRAINT popups_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: product_upsells product_upsells_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_upsells
    ADD CONSTRAINT product_upsells_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_upsells product_upsells_upsell_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_upsells
    ADD CONSTRAINT product_upsells_upsell_product_id_fkey FOREIGN KEY (upsell_product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_variations product_variations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variations
    ADD CONSTRAINT product_variations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: shipping_logs shipping_logs_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_logs
    ADD CONSTRAINT shipping_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: support_messages support_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wholesale_prices wholesale_prices_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wholesale_prices
    ADD CONSTRAINT wholesale_prices_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE CASCADE;


--
-- Name: ab_card_events Admins can delete ab events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete ab events" ON public.ab_card_events FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: reviews Admins can delete any review; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete any review" ON public.reviews FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: email_send_log Admins can delete email send log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete email send log" ON public.email_send_log FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: gateway_settings_audit Admins can delete gateway audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete gateway audit" ON public.gateway_settings_audit FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: orders Admins can delete orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete orders" ON public.orders FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: payment_logs Admins can delete payment logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete payment logs" ON public.payment_logs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: popups Admins can delete popups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete popups" ON public.popups FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can delete roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: site_settings Admins can delete settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete settings" ON public.site_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: webhook_logs Admins can delete webhook logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete webhook logs" ON public.webhook_logs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: webhook_retry_queue Admins can delete webhook retry queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete webhook retry queue" ON public.webhook_retry_queue FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: gateway_settings_audit Admins can insert gateway audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert gateway audit" ON public.gateway_settings_audit FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (auth.uid() = user_id)));


--
-- Name: support_messages Admins can insert messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert messages" ON public.support_messages FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: popups Admins can insert popups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert popups" ON public.popups FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can insert roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: site_settings Admins can insert settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert settings" ON public.site_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: coupon_products Admins can manage coupon_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage coupon_products" ON public.coupon_products USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: coupons Admins can manage coupons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage coupons" ON public.coupons TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: payment_links Admins can manage payment links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage payment links" ON public.payment_links TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins can update all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: support_tickets Admins can update any ticket; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update any ticket" ON public.support_tickets FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: popups Admins can update popups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update popups" ON public.popups FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: site_settings Admins can update settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update settings" ON public.site_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: webhook_retry_queue Admins can update webhook retry queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update webhook retry queue" ON public.webhook_retry_queue FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: ab_card_events Admins can view ab events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view ab events" ON public.ab_card_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: cart_items Admins can view all cart items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all cart items" ON public.cart_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: support_messages Admins can view all messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all messages" ON public.support_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can view all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: support_tickets Admins can view all tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all tickets" ON public.support_tickets FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: email_send_log Admins can view email send log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view email send log" ON public.email_send_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: gateway_settings_audit Admins can view gateway audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view gateway audit" ON public.gateway_settings_audit FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: api_idempotency_keys Admins can view idempotency keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view idempotency keys" ON public.api_idempotency_keys FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: payment_logs Admins can view payment logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view payment logs" ON public.payment_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: webhook_logs Admins can view webhook logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view webhook logs" ON public.webhook_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: webhook_retry_queue Admins can view webhook retry queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view webhook retry queue" ON public.webhook_retry_queue FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: bulk_email_campaigns Admins manage bulk_email_campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage bulk_email_campaigns" ON public.bulk_email_campaigns TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: bulk_email_templates Admins manage bulk_email_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage bulk_email_templates" ON public.bulk_email_templates TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: contact_preferences Admins view all contact preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view all contact preferences" ON public.contact_preferences FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: ab_card_events Anyone can insert ab events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert ab events" ON public.ab_card_events FOR INSERT WITH CHECK (true);


--
-- Name: orders Anyone can insert orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert orders" ON public.orders FOR INSERT WITH CHECK (true);


--
-- Name: payment_logs Anyone can insert payment logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert payment logs" ON public.payment_logs FOR INSERT WITH CHECK (true);


--
-- Name: banners Anyone can view active banners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active banners" ON public.banners FOR SELECT USING (true);


--
-- Name: coupons Anyone can view active coupons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active coupons" ON public.coupons FOR SELECT USING ((active = true));


--
-- Name: payment_links Anyone can view active payment links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active payment links" ON public.payment_links FOR SELECT USING ((active = true));


--
-- Name: popups Anyone can view active popups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active popups" ON public.popups FOR SELECT USING (true);


--
-- Name: banner_slides Anyone can view banner slides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view banner slides" ON public.banner_slides FOR SELECT USING (true);


--
-- Name: reviews Anyone can view reviews publicly; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view reviews publicly" ON public.reviews FOR SELECT TO anon USING (true);


--
-- Name: site_settings Anyone can view settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view settings" ON public.site_settings FOR SELECT USING (true);


--
-- Name: video_testimonials Anyone can view testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view testimonials" ON public.video_testimonials FOR SELECT USING (true);


--
-- Name: product_upsells Anyone can view upsells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view upsells" ON public.product_upsells FOR SELECT USING (true);


--
-- Name: product_variations Anyone can view variations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view variations" ON public.product_variations FOR SELECT USING (true);


--
-- Name: wholesale_prices Anyone can view wholesale prices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view wholesale prices" ON public.wholesale_prices FOR SELECT USING (true);


--
-- Name: banner_slides Auth users can delete banner slides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users can delete banner slides" ON public.banner_slides FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: banner_slides Auth users can insert banner slides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users can insert banner slides" ON public.banner_slides FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: banner_slides Auth users can update banner slides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users can update banner slides" ON public.banner_slides FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: reviews Authenticated can view all reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view all reviews" ON public.reviews FOR SELECT TO authenticated USING (true);


--
-- Name: video_testimonials Authenticated users can delete testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete testimonials" ON public.video_testimonials FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: banners Authenticated users can delete their banners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete their banners" ON public.banners FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: products Authenticated users can delete their products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete their products" ON public.products FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: banners Authenticated users can insert banners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert banners" ON public.banners FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: products Authenticated users can insert products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: video_testimonials Authenticated users can insert testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert testimonials" ON public.video_testimonials FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: video_testimonials Authenticated users can update testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update testimonials" ON public.video_testimonials FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: banners Authenticated users can update their banners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update their banners" ON public.banners FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: products Authenticated users can update their products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update their products" ON public.products FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: orders Authenticated users can view orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view orders" ON public.orders FOR SELECT USING (true);


--
-- Name: products Authenticated users can view products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view products" ON public.products FOR SELECT USING (true);


--
-- Name: shipping_logs Authenticated users can view shipping logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view shipping logs" ON public.shipping_logs FOR SELECT USING (true);


--
-- Name: product_variation_files Customers can view files of their paid orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can view files of their paid orders" ON public.product_variation_files FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.product_variations pv
     JOIN public.orders o ON ((upper(o.status) = ANY (ARRAY['PAID'::text, 'CONFIRMED'::text, 'RECEIVED'::text, 'RECEIVED_IN_CASH'::text]))))
  WHERE ((pv.id = product_variation_files.variation_id) AND (o.customer_user_id = auth.uid()) AND (o.product_name ~~* (('%'::text || ( SELECT products.name
           FROM public.products
          WHERE (products.id = pv.product_id))) || '%'::text))))));


--
-- Name: orders Customers can view their own orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can view their own orders" ON public.orders FOR SELECT USING ((auth.uid() = customer_user_id));


--
-- Name: product_variation_files Owner can delete digital files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can delete digital files" ON public.product_variation_files FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.product_variations pv
     JOIN public.products p ON ((p.id = pv.product_id)))
  WHERE ((pv.id = product_variation_files.variation_id) AND (p.user_id = auth.uid())))));


--
-- Name: product_upsells Owner can delete upsells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can delete upsells" ON public.product_upsells FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = product_upsells.product_id) AND (p.user_id = auth.uid())))));


--
-- Name: product_variations Owner can delete variations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can delete variations" ON public.product_variations FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variations.product_id) AND (products.user_id = auth.uid())))));


--
-- Name: wholesale_prices Owner can delete wholesale prices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can delete wholesale prices" ON public.wholesale_prices FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.product_variations pv
     JOIN public.products p ON ((p.id = pv.product_id)))
  WHERE ((pv.id = wholesale_prices.variation_id) AND (p.user_id = auth.uid())))));


--
-- Name: product_variation_files Owner can insert digital files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can insert digital files" ON public.product_variation_files FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.product_variations pv
     JOIN public.products p ON ((p.id = pv.product_id)))
  WHERE ((pv.id = product_variation_files.variation_id) AND (p.user_id = auth.uid())))));


--
-- Name: product_upsells Owner can insert upsells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can insert upsells" ON public.product_upsells FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = product_upsells.product_id) AND (p.user_id = auth.uid())))));


--
-- Name: product_variations Owner can insert variations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can insert variations" ON public.product_variations FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variations.product_id) AND (products.user_id = auth.uid())))));


--
-- Name: wholesale_prices Owner can insert wholesale prices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can insert wholesale prices" ON public.wholesale_prices FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.product_variations pv
     JOIN public.products p ON ((p.id = pv.product_id)))
  WHERE ((pv.id = wholesale_prices.variation_id) AND (p.user_id = auth.uid())))));


--
-- Name: product_variation_files Owner can update digital files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can update digital files" ON public.product_variation_files FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.product_variations pv
     JOIN public.products p ON ((p.id = pv.product_id)))
  WHERE ((pv.id = product_variation_files.variation_id) AND (p.user_id = auth.uid())))));


--
-- Name: product_upsells Owner can update upsells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can update upsells" ON public.product_upsells FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = product_upsells.product_id) AND (p.user_id = auth.uid())))));


--
-- Name: product_variations Owner can update variations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can update variations" ON public.product_variations FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variations.product_id) AND (products.user_id = auth.uid())))));


--
-- Name: wholesale_prices Owner can update wholesale prices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can update wholesale prices" ON public.wholesale_prices FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.product_variations pv
     JOIN public.products p ON ((p.id = pv.product_id)))
  WHERE ((pv.id = wholesale_prices.variation_id) AND (p.user_id = auth.uid())))));


--
-- Name: product_variation_files Owner can view digital files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can view digital files" ON public.product_variation_files FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.product_variations pv
     JOIN public.products p ON ((p.id = pv.product_id)))
  WHERE ((pv.id = product_variation_files.variation_id) AND (p.user_id = auth.uid())))));


--
-- Name: coupon_products Public can read coupon_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read coupon_products" ON public.coupon_products FOR SELECT USING (true);


--
-- Name: shipping_logs Service role can insert shipping logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert shipping logs" ON public.shipping_logs FOR INSERT WITH CHECK (true);


--
-- Name: orders Service role can update orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update orders" ON public.orders FOR UPDATE USING (true);


--
-- Name: cart_abandonment_logs Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.cart_abandonment_logs USING (true) WITH CHECK (true);


--
-- Name: addresses Users can delete own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own addresses" ON public.addresses FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: reviews Users can delete own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own reviews" ON public.reviews FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: cart_items Users can delete their own cart items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own cart items" ON public.cart_items FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: support_messages Users can insert messages on own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert messages on own tickets" ON public.support_messages FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM public.support_tickets
  WHERE ((support_tickets.id = support_messages.ticket_id) AND (support_tickets.user_id = auth.uid()))))));


--
-- Name: addresses Users can insert own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own addresses" ON public.addresses FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: reviews Users can insert own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own reviews" ON public.reviews FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: support_tickets Users can insert own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own tickets" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: cart_items Users can insert their own cart items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own cart items" ON public.cart_items FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: addresses Users can update own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own addresses" ON public.addresses FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: reviews Users can update own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own reviews" ON public.reviews FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: support_tickets Users can update own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own tickets" ON public.support_tickets FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: cart_items Users can update their own cart items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own cart items" ON public.cart_items FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: addresses Users can view own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own addresses" ON public.addresses FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: reviews Users can view own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own reviews" ON public.reviews FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: user_roles Users can view own role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: support_messages Users can view own ticket messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own ticket messages" ON public.support_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.support_tickets
  WHERE ((support_tickets.id = support_messages.ticket_id) AND (support_tickets.user_id = auth.uid())))));


--
-- Name: support_tickets Users can view own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tickets" ON public.support_tickets FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: cart_items Users can view their own cart items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own cart items" ON public.cart_items FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: contact_preferences Users insert own contact preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own contact preferences" ON public.contact_preferences FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: contact_preferences Users update own contact preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own contact preferences" ON public.contact_preferences FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: contact_preferences Users view own contact preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own contact preferences" ON public.contact_preferences FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: ab_card_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ab_card_events ENABLE ROW LEVEL SECURITY;

--
-- Name: addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: api_idempotency_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: banner_slides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.banner_slides ENABLE ROW LEVEL SECURITY;

--
-- Name: banners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

--
-- Name: bulk_email_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bulk_email_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: bulk_email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bulk_email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: cart_abandonment_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cart_abandonment_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: cart_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: coupon_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupon_products ENABLE ROW LEVEL SECURITY;

--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: email_send_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

--
-- Name: gateway_settings_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gateway_settings_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: popups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.popups ENABLE ROW LEVEL SECURITY;

--
-- Name: product_upsells; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_upsells ENABLE ROW LEVEL SECURITY;

--
-- Name: product_variation_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_variation_files ENABLE ROW LEVEL SECURITY;

--
-- Name: product_variations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: shipping_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipping_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: site_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: support_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: video_testimonials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.video_testimonials ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_retry_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_retry_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: wholesale_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wholesale_prices ENABLE ROW LEVEL SECURITY;


--
-- Supabase Storage buckets used by the application.
-- pg_dump --schema=public does not include these because they live in storage.*,
-- so they are appended here to keep the replica complete.
--

INSERT INTO storage.buckets (id, name, public) VALUES
    ('avatars', 'avatars', true),
    ('banner-images', 'banner-images', true),
    ('digital-file-covers', 'digital-file-covers', true),
    ('digital-files', 'digital-files', false),
    ('product-images', 'product-images', true),
    ('testimonial-videos', 'testimonial-videos', true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    public = EXCLUDED.public;

--
-- Name: objects Anyone can view banner images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Anyone can view banner images" ON storage.objects FOR SELECT USING ((bucket_id = 'banner-images'::text));

--
-- Name: objects Anyone can view digital file covers; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Anyone can view digital file covers" ON storage.objects FOR SELECT USING ((bucket_id = 'digital-file-covers'::text));

--
-- Name: objects Auth users can delete banner images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Auth users can delete banner images" ON storage.objects FOR DELETE USING (((bucket_id = 'banner-images'::text) AND (auth.role() = 'authenticated'::text)));

--
-- Name: objects Auth users can update banner images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Auth users can update banner images" ON storage.objects FOR UPDATE USING (((bucket_id = 'banner-images'::text) AND (auth.role() = 'authenticated'::text)));

--
-- Name: objects Auth users can upload banner images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Auth users can upload banner images" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'banner-images'::text) AND (auth.role() = 'authenticated'::text)));

--
-- Name: objects Authenticated can delete product images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated can delete product images" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'product-images'::text));

--
-- Name: objects Authenticated can delete testimonial videos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated can delete testimonial videos" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'testimonial-videos'::text));

--
-- Name: objects Authenticated can update product images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated can update product images" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'product-images'::text));

--
-- Name: objects Authenticated can update testimonial videos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated can update testimonial videos" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'testimonial-videos'::text));

--
-- Name: objects Authenticated can upload product images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated can upload product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'product-images'::text));

--
-- Name: objects Authenticated can upload testimonial videos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated can upload testimonial videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'testimonial-videos'::text));

--
-- Name: objects Avatars are publicly accessible; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Avatars are publicly accessible" ON storage.objects FOR SELECT USING ((bucket_id = 'avatars'::text));

--
-- Name: objects Owner can delete digital file covers; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Owner can delete digital file covers" ON storage.objects FOR DELETE USING (((bucket_id = 'digital-file-covers'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

--
-- Name: objects Owner can delete own digital files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Owner can delete own digital files" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'digital-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

--
-- Name: objects Owner can read own digital files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Owner can read own digital files" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'digital-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

--
-- Name: objects Owner can update digital file covers; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Owner can update digital file covers" ON storage.objects FOR UPDATE USING (((bucket_id = 'digital-file-covers'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

--
-- Name: objects Owner can update own digital files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Owner can update own digital files" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'digital-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

--
-- Name: objects Owner can upload digital file covers; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Owner can upload digital file covers" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'digital-file-covers'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

--
-- Name: objects Owner can upload digital files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Owner can upload digital files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'digital-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

--
-- Name: objects Public can view product images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Public can view product images" ON storage.objects FOR SELECT USING ((bucket_id = 'product-images'::text));

--
-- Name: objects Public can view testimonial videos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Public can view testimonial videos" ON storage.objects FOR SELECT USING ((bucket_id = 'testimonial-videos'::text));

--
-- Name: objects Users can delete their own avatar; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

--
-- Name: objects Users can update their own avatar; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

--
-- Name: objects Users can upload their own avatar; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

--
-- PostgreSQL database dump complete
--

\unrestrict rdLBuiIaMglIP15yoOIpaDbMcTAU74EnFdJhPvqZBtIfsC07ui2c3TrEmu0A86o

