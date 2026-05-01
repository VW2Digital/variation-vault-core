-- ============================================================
-- Schema completo — copiar e colar no SQL Editor do Supabase
-- Idempotente: pode ser executado múltiplas vezes com segurança
-- Inclui: extensões, enums, tabelas, RLS, políticas, funções,
-- triggers e seeds dos toggles de gateway.
-- ============================================================

-- 1) Extensões
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2) Enum app_role
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin','user');
  END IF;
END $$;

-- 3) Tabelas + colunas (ADD COLUMN IF NOT EXISTS)

-- Tabela: ab_card_events
CREATE TABLE IF NOT EXISTS public.ab_card_events ();
ALTER TABLE public.ab_card_events ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ab_card_events ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.ab_card_events ADD COLUMN IF NOT EXISTS variant text;
ALTER TABLE public.ab_card_events ALTER COLUMN variant SET NOT NULL;
ALTER TABLE public.ab_card_events ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE public.ab_card_events ALTER COLUMN event_type SET NOT NULL;
ALTER TABLE public.ab_card_events ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.ab_card_events ADD COLUMN IF NOT EXISTS variation_id uuid;
ALTER TABLE public.ab_card_events ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE public.ab_card_events ALTER COLUMN session_id SET NOT NULL;
ALTER TABLE public.ab_card_events ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.ab_card_events ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.ab_card_events ALTER COLUMN created_at SET NOT NULL;

-- Tabela: addresses
CREATE TABLE IF NOT EXISTS public.addresses ();
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.addresses ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.addresses ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS label text DEFAULT 'Casa'::text;
ALTER TABLE public.addresses ALTER COLUMN label SET NOT NULL;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE public.addresses ALTER COLUMN postal_code SET NOT NULL;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE public.addresses ALTER COLUMN street SET NOT NULL;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS number text;
ALTER TABLE public.addresses ALTER COLUMN number SET NOT NULL;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS complement text DEFAULT ''::text;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE public.addresses ALTER COLUMN district SET NOT NULL;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.addresses ALTER COLUMN city SET NOT NULL;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.addresses ALTER COLUMN state SET NOT NULL;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;
ALTER TABLE public.addresses ALTER COLUMN is_default SET NOT NULL;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.addresses ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.addresses ALTER COLUMN updated_at SET NOT NULL;

-- Tabela: api_idempotency_keys
CREATE TABLE IF NOT EXISTS public.api_idempotency_keys ();
ALTER TABLE public.api_idempotency_keys ADD COLUMN IF NOT EXISTS key text;
ALTER TABLE public.api_idempotency_keys ALTER COLUMN key SET NOT NULL;
ALTER TABLE public.api_idempotency_keys ADD COLUMN IF NOT EXISTS route text;
ALTER TABLE public.api_idempotency_keys ALTER COLUMN route SET NOT NULL;
ALTER TABLE public.api_idempotency_keys ADD COLUMN IF NOT EXISTS request_hash text;
ALTER TABLE public.api_idempotency_keys ALTER COLUMN request_hash SET NOT NULL;
ALTER TABLE public.api_idempotency_keys ADD COLUMN IF NOT EXISTS response_status integer;
ALTER TABLE public.api_idempotency_keys ALTER COLUMN response_status SET NOT NULL;
ALTER TABLE public.api_idempotency_keys ADD COLUMN IF NOT EXISTS response_body jsonb;
ALTER TABLE public.api_idempotency_keys ALTER COLUMN response_body SET NOT NULL;
ALTER TABLE public.api_idempotency_keys ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE public.api_idempotency_keys ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.api_idempotency_keys ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.api_idempotency_keys ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + '24:00:00'::interval);
ALTER TABLE public.api_idempotency_keys ALTER COLUMN expires_at SET NOT NULL;

-- Tabela: banner_slides
CREATE TABLE IF NOT EXISTS public.banner_slides ();
ALTER TABLE public.banner_slides ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.banner_slides ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.banner_slides ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.banner_slides ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.banner_slides ADD COLUMN IF NOT EXISTS title text DEFAULT ''::text;
ALTER TABLE public.banner_slides ALTER COLUMN title SET NOT NULL;
ALTER TABLE public.banner_slides ADD COLUMN IF NOT EXISTS image_desktop text DEFAULT ''::text;
ALTER TABLE public.banner_slides ALTER COLUMN image_desktop SET NOT NULL;
ALTER TABLE public.banner_slides ADD COLUMN IF NOT EXISTS image_tablet text DEFAULT ''::text;
ALTER TABLE public.banner_slides ALTER COLUMN image_tablet SET NOT NULL;
ALTER TABLE public.banner_slides ADD COLUMN IF NOT EXISTS image_mobile text DEFAULT ''::text;
ALTER TABLE public.banner_slides ALTER COLUMN image_mobile SET NOT NULL;
ALTER TABLE public.banner_slides ADD COLUMN IF NOT EXISTS link_url text DEFAULT ''::text;
ALTER TABLE public.banner_slides ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.banner_slides ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE public.banner_slides ALTER COLUMN active SET NOT NULL;
ALTER TABLE public.banner_slides ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE public.banner_slides ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE public.banner_slides ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.banner_slides ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.banner_slides ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.banner_slides ALTER COLUMN updated_at SET NOT NULL;

-- Tabela: banners
CREATE TABLE IF NOT EXISTS public.banners ();
ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.banners ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS text text;
ALTER TABLE public.banners ALTER COLUMN text SET NOT NULL;
ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE public.banners ALTER COLUMN active SET NOT NULL;
ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.banners ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.banners ALTER COLUMN user_id SET NOT NULL;

-- Tabela: bulk_email_campaigns
CREATE TABLE IF NOT EXISTS public.bulk_email_campaigns ();
ALTER TABLE public.bulk_email_campaigns ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.bulk_email_campaigns ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.bulk_email_campaigns ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.bulk_email_campaigns ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.bulk_email_campaigns ALTER COLUMN subject SET NOT NULL;
ALTER TABLE public.bulk_email_campaigns ADD COLUMN IF NOT EXISTS html_content text;
ALTER TABLE public.bulk_email_campaigns ALTER COLUMN html_content SET NOT NULL;
ALTER TABLE public.bulk_email_campaigns ADD COLUMN IF NOT EXISTS audience_type text;
ALTER TABLE public.bulk_email_campaigns ALTER COLUMN audience_type SET NOT NULL;
ALTER TABLE public.bulk_email_campaigns ADD COLUMN IF NOT EXISTS total_recipients integer DEFAULT 0;
ALTER TABLE public.bulk_email_campaigns ALTER COLUMN total_recipients SET NOT NULL;
ALTER TABLE public.bulk_email_campaigns ADD COLUMN IF NOT EXISTS total_sent integer DEFAULT 0;
ALTER TABLE public.bulk_email_campaigns ALTER COLUMN total_sent SET NOT NULL;
ALTER TABLE public.bulk_email_campaigns ADD COLUMN IF NOT EXISTS total_failed integer DEFAULT 0;
ALTER TABLE public.bulk_email_campaigns ALTER COLUMN total_failed SET NOT NULL;
ALTER TABLE public.bulk_email_campaigns ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text;
ALTER TABLE public.bulk_email_campaigns ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.bulk_email_campaigns ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.bulk_email_campaigns ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.bulk_email_campaigns ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.bulk_email_campaigns ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.bulk_email_campaigns ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Tabela: bulk_email_templates
CREATE TABLE IF NOT EXISTS public.bulk_email_templates ();
ALTER TABLE public.bulk_email_templates ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.bulk_email_templates ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.bulk_email_templates ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.bulk_email_templates ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.bulk_email_templates ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.bulk_email_templates ALTER COLUMN name SET NOT NULL;
ALTER TABLE public.bulk_email_templates ADD COLUMN IF NOT EXISTS subject text DEFAULT ''::text;
ALTER TABLE public.bulk_email_templates ALTER COLUMN subject SET NOT NULL;
ALTER TABLE public.bulk_email_templates ADD COLUMN IF NOT EXISTS html_content text DEFAULT ''::text;
ALTER TABLE public.bulk_email_templates ALTER COLUMN html_content SET NOT NULL;
ALTER TABLE public.bulk_email_templates ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.bulk_email_templates ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.bulk_email_templates ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.bulk_email_templates ALTER COLUMN updated_at SET NOT NULL;

-- Tabela: cart_abandonment_logs
CREATE TABLE IF NOT EXISTS public.cart_abandonment_logs ();
ALTER TABLE public.cart_abandonment_logs ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.cart_abandonment_logs ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.cart_abandonment_logs ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.cart_abandonment_logs ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.cart_abandonment_logs ADD COLUMN IF NOT EXISTS email_sent_at timestamptz DEFAULT now();
ALTER TABLE public.cart_abandonment_logs ALTER COLUMN email_sent_at SET NOT NULL;
ALTER TABLE public.cart_abandonment_logs ADD COLUMN IF NOT EXISTS cart_item_count integer DEFAULT 0;
ALTER TABLE public.cart_abandonment_logs ALTER COLUMN cart_item_count SET NOT NULL;

-- Tabela: cart_items
CREATE TABLE IF NOT EXISTS public.cart_items ();
ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.cart_items ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.cart_items ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.cart_items ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS variation_id uuid;
ALTER TABLE public.cart_items ALTER COLUMN variation_id SET NOT NULL;
ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1;
ALTER TABLE public.cart_items ALTER COLUMN quantity SET NOT NULL;
ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.cart_items ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.cart_items ALTER COLUMN updated_at SET NOT NULL;

-- Tabela: contact_preferences
CREATE TABLE IF NOT EXISTS public.contact_preferences ();
ALTER TABLE public.contact_preferences ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.contact_preferences ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.contact_preferences ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.contact_preferences ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.contact_preferences ADD COLUMN IF NOT EXISTS allow_email_marketing boolean DEFAULT true;
ALTER TABLE public.contact_preferences ALTER COLUMN allow_email_marketing SET NOT NULL;
ALTER TABLE public.contact_preferences ADD COLUMN IF NOT EXISTS allow_whatsapp_marketing boolean DEFAULT true;
ALTER TABLE public.contact_preferences ALTER COLUMN allow_whatsapp_marketing SET NOT NULL;
ALTER TABLE public.contact_preferences ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.contact_preferences ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.contact_preferences ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.contact_preferences ALTER COLUMN updated_at SET NOT NULL;

-- Tabela: coupon_products
CREATE TABLE IF NOT EXISTS public.coupon_products ();
ALTER TABLE public.coupon_products ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.coupon_products ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.coupon_products ADD COLUMN IF NOT EXISTS coupon_id uuid;
ALTER TABLE public.coupon_products ALTER COLUMN coupon_id SET NOT NULL;
ALTER TABLE public.coupon_products ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.coupon_products ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE public.coupon_products ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.coupon_products ALTER COLUMN created_at SET NOT NULL;

-- Tabela: coupons
CREATE TABLE IF NOT EXISTS public.coupons ();
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.coupons ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.coupons ALTER COLUMN code SET NOT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'percentage'::text;
ALTER TABLE public.coupons ALTER COLUMN discount_type SET NOT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0;
ALTER TABLE public.coupons ALTER COLUMN discount_value SET NOT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS max_uses integer DEFAULT 1;
ALTER TABLE public.coupons ALTER COLUMN max_uses SET NOT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS current_uses integer DEFAULT 0;
ALTER TABLE public.coupons ALTER COLUMN current_uses SET NOT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE public.coupons ALTER COLUMN active SET NOT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.coupons ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.coupons ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.coupons ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS product_id uuid;

-- Tabela: email_send_log
CREATE TABLE IF NOT EXISTS public.email_send_log ();
ALTER TABLE public.email_send_log ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.email_send_log ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.email_send_log ADD COLUMN IF NOT EXISTS message_id text;
ALTER TABLE public.email_send_log ADD COLUMN IF NOT EXISTS template_name text;
ALTER TABLE public.email_send_log ALTER COLUMN template_name SET NOT NULL;
ALTER TABLE public.email_send_log ADD COLUMN IF NOT EXISTS recipient_email text;
ALTER TABLE public.email_send_log ALTER COLUMN recipient_email SET NOT NULL;
ALTER TABLE public.email_send_log ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.email_send_log ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text;
ALTER TABLE public.email_send_log ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.email_send_log ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.email_send_log ADD COLUMN IF NOT EXISTS provider_response jsonb;
ALTER TABLE public.email_send_log ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.email_send_log ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.email_send_log ALTER COLUMN created_at SET NOT NULL;

-- Tabela: gateway_settings_audit
CREATE TABLE IF NOT EXISTS public.gateway_settings_audit ();
ALTER TABLE public.gateway_settings_audit ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.gateway_settings_audit ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.gateway_settings_audit ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.gateway_settings_audit ADD COLUMN IF NOT EXISTS user_email text;
ALTER TABLE public.gateway_settings_audit ADD COLUMN IF NOT EXISTS gateway text;
ALTER TABLE public.gateway_settings_audit ALTER COLUMN gateway SET NOT NULL;
ALTER TABLE public.gateway_settings_audit ADD COLUMN IF NOT EXISTS setting_type text;
ALTER TABLE public.gateway_settings_audit ALTER COLUMN setting_type SET NOT NULL;
ALTER TABLE public.gateway_settings_audit ADD COLUMN IF NOT EXISTS old_value boolean;
ALTER TABLE public.gateway_settings_audit ADD COLUMN IF NOT EXISTS new_value boolean;
ALTER TABLE public.gateway_settings_audit ALTER COLUMN new_value SET NOT NULL;
ALTER TABLE public.gateway_settings_audit ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.gateway_settings_audit ALTER COLUMN created_at SET NOT NULL;

-- Tabela: orders
CREATE TABLE IF NOT EXISTS public.orders ();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.orders ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.orders ALTER COLUMN customer_name SET NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE public.orders ALTER COLUMN customer_email SET NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_cpf text;
ALTER TABLE public.orders ALTER COLUMN customer_cpf SET NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS asaas_customer_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS asaas_payment_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE public.orders ALTER COLUMN product_name SET NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dosage text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1;
ALTER TABLE public.orders ALTER COLUMN quantity SET NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0;
ALTER TABLE public.orders ALTER COLUMN unit_price SET NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_value numeric DEFAULT 0;
ALTER TABLE public.orders ALTER COLUMN total_value SET NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'pix'::text;
ALTER TABLE public.orders ALTER COLUMN payment_method SET NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS installments integer DEFAULT 1;
ALTER TABLE public.orders ALTER COLUMN installments SET NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status text DEFAULT 'PENDING'::text;
ALTER TABLE public.orders ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.orders ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.orders ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'PROCESSING'::text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_user_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_status text DEFAULT 'pending'::text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_service text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipment_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS label_url text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_url text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_address text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_complement text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_district text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_city text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_state text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_postal_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_cost numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS selected_service_id integer;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_gateway text DEFAULT 'asaas'::text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gateway_environment text DEFAULT 'sandbox'::text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_discount numeric DEFAULT 0;

-- Tabela: payment_links
CREATE TABLE IF NOT EXISTS public.payment_links ();
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.payment_links ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.payment_links ALTER COLUMN title SET NOT NULL;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS description text DEFAULT ''::text;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0;
ALTER TABLE public.payment_links ALTER COLUMN amount SET NOT NULL;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE public.payment_links ALTER COLUMN active SET NOT NULL;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.payment_links ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.payment_links ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.payment_links ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.payment_links ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS pix_discount_percent numeric DEFAULT 0;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS max_installments integer DEFAULT 1;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS fantasy_name text;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1;
ALTER TABLE public.payment_links ALTER COLUMN quantity SET NOT NULL;
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0;
ALTER TABLE public.payment_links ALTER COLUMN unit_price SET NOT NULL;

-- Tabela: payment_logs
CREATE TABLE IF NOT EXISTS public.payment_logs ();
ALTER TABLE public.payment_logs ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.payment_logs ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.payment_logs ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE public.payment_logs ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE public.payment_logs ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.payment_logs ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.payment_logs ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.payment_logs ALTER COLUMN error_message SET NOT NULL;
ALTER TABLE public.payment_logs ADD COLUMN IF NOT EXISTS error_source text DEFAULT 'frontend'::text;
ALTER TABLE public.payment_logs ALTER COLUMN error_source SET NOT NULL;
ALTER TABLE public.payment_logs ADD COLUMN IF NOT EXISTS request_payload jsonb;
ALTER TABLE public.payment_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.payment_logs ALTER COLUMN created_at SET NOT NULL;

-- Tabela: popups
CREATE TABLE IF NOT EXISTS public.popups ();
ALTER TABLE public.popups ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.popups ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.popups ADD COLUMN IF NOT EXISTS title text DEFAULT ''::text;
ALTER TABLE public.popups ALTER COLUMN title SET NOT NULL;
ALTER TABLE public.popups ADD COLUMN IF NOT EXISTS image_url text DEFAULT ''::text;
ALTER TABLE public.popups ALTER COLUMN image_url SET NOT NULL;
ALTER TABLE public.popups ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.popups ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE public.popups ALTER COLUMN active SET NOT NULL;
ALTER TABLE public.popups ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.popups ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.popups ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.popups ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.popups ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.popups ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.popups ALTER COLUMN user_id SET NOT NULL;

-- Tabela: product_upsells
CREATE TABLE IF NOT EXISTS public.product_upsells ();
ALTER TABLE public.product_upsells ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.product_upsells ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.product_upsells ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.product_upsells ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE public.product_upsells ADD COLUMN IF NOT EXISTS upsell_product_id uuid;
ALTER TABLE public.product_upsells ALTER COLUMN upsell_product_id SET NOT NULL;
ALTER TABLE public.product_upsells ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE public.product_upsells ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE public.product_upsells ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.product_upsells ALTER COLUMN created_at SET NOT NULL;

-- Tabela: product_variation_files
CREATE TABLE IF NOT EXISTS public.product_variation_files ();
ALTER TABLE public.product_variation_files ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.product_variation_files ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.product_variation_files ADD COLUMN IF NOT EXISTS variation_id uuid;
ALTER TABLE public.product_variation_files ALTER COLUMN variation_id SET NOT NULL;
ALTER TABLE public.product_variation_files ADD COLUMN IF NOT EXISTS file_path text;
ALTER TABLE public.product_variation_files ALTER COLUMN file_path SET NOT NULL;
ALTER TABLE public.product_variation_files ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.product_variation_files ALTER COLUMN file_name SET NOT NULL;
ALTER TABLE public.product_variation_files ADD COLUMN IF NOT EXISTS file_size bigint DEFAULT 0;
ALTER TABLE public.product_variation_files ALTER COLUMN file_size SET NOT NULL;
ALTER TABLE public.product_variation_files ADD COLUMN IF NOT EXISTS mime_type text DEFAULT 'application/octet-stream'::text;
ALTER TABLE public.product_variation_files ALTER COLUMN mime_type SET NOT NULL;
ALTER TABLE public.product_variation_files ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE public.product_variation_files ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE public.product_variation_files ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.product_variation_files ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.product_variation_files ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.product_variation_files ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.product_variation_files ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.product_variation_files ADD COLUMN IF NOT EXISTS cover_image_url text;

-- Tabela: product_variations
CREATE TABLE IF NOT EXISTS public.product_variations ();
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.product_variations ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.product_variations ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS dosage text;
ALTER TABLE public.product_variations ALTER COLUMN dosage SET NOT NULL;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0;
ALTER TABLE public.product_variations ALTER COLUMN price SET NOT NULL;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS in_stock boolean DEFAULT true;
ALTER TABLE public.product_variations ALTER COLUMN in_stock SET NOT NULL;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS is_offer boolean DEFAULT false;
ALTER TABLE public.product_variations ALTER COLUMN is_offer SET NOT NULL;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.product_variations ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS image_url text DEFAULT ''::text;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}'::text[];
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS offer_price numeric DEFAULT 0;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS subtitle text DEFAULT ''::text;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS stock_quantity integer DEFAULT 0;
ALTER TABLE public.product_variations ALTER COLUMN stock_quantity SET NOT NULL;
ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS is_digital boolean DEFAULT false;
ALTER TABLE public.product_variations ALTER COLUMN is_digital SET NOT NULL;

-- Tabela: products
CREATE TABLE IF NOT EXISTS public.products ();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.products ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.products ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.products ALTER COLUMN name SET NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS subtitle text DEFAULT ''::text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text DEFAULT ''::text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS active_ingredient text DEFAULT ''::text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pharma_form text DEFAULT ''::text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS administration_route text DEFAULT ''::text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS frequency text DEFAULT ''::text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}'::text[];
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.products ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.products ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS free_shipping boolean DEFAULT false;
ALTER TABLE public.products ALTER COLUMN free_shipping SET NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS free_shipping_min_value numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_bestseller boolean DEFAULT false;
ALTER TABLE public.products ALTER COLUMN is_bestseller SET NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pix_discount_percent numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS max_installments integer DEFAULT 6;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS installments_interest text DEFAULT 'sem_juros'::text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS fantasy_name text DEFAULT ''::text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE public.products ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category text DEFAULT ''::text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE public.products ALTER COLUMN active SET NOT NULL;

-- Tabela: profiles
CREATE TABLE IF NOT EXISTS public.profiles ();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.profiles ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.profiles ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text DEFAULT ''::text;
ALTER TABLE public.profiles ALTER COLUMN full_name SET NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text DEFAULT ''::text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.profiles ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.profiles ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf text DEFAULT ''::text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text DEFAULT ''::text;

-- Tabela: reviews
CREATE TABLE IF NOT EXISTS public.reviews ();
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.reviews ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.reviews ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE public.reviews ALTER COLUMN order_id SET NOT NULL;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE public.reviews ALTER COLUMN product_name SET NOT NULL;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS rating integer DEFAULT 5;
ALTER TABLE public.reviews ALTER COLUMN rating SET NOT NULL;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS comment text DEFAULT ''::text;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.reviews ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.reviews ALTER COLUMN updated_at SET NOT NULL;

-- Tabela: shipping_logs
CREATE TABLE IF NOT EXISTS public.shipping_logs ();
ALTER TABLE public.shipping_logs ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.shipping_logs ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.shipping_logs ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE public.shipping_logs ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE public.shipping_logs ADD COLUMN IF NOT EXISTS request_payload jsonb;
ALTER TABLE public.shipping_logs ADD COLUMN IF NOT EXISTS response_payload jsonb;
ALTER TABLE public.shipping_logs ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.shipping_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.shipping_logs ALTER COLUMN created_at SET NOT NULL;

-- Tabela: site_settings
CREATE TABLE IF NOT EXISTS public.site_settings ();
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.site_settings ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS key text;
ALTER TABLE public.site_settings ALTER COLUMN key SET NOT NULL;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS value text DEFAULT ''::text;
ALTER TABLE public.site_settings ALTER COLUMN value SET NOT NULL;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.site_settings ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.site_settings ALTER COLUMN user_id SET NOT NULL;

-- Tabela: support_messages
CREATE TABLE IF NOT EXISTS public.support_messages ();
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.support_messages ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS ticket_id uuid;
ALTER TABLE public.support_messages ALTER COLUMN ticket_id SET NOT NULL;
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS sender_id uuid;
ALTER TABLE public.support_messages ALTER COLUMN sender_id SET NOT NULL;
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS sender_role text DEFAULT 'user'::text;
ALTER TABLE public.support_messages ALTER COLUMN sender_role SET NOT NULL;
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE public.support_messages ALTER COLUMN message SET NOT NULL;
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.support_messages ALTER COLUMN created_at SET NOT NULL;

-- Tabela: support_tickets
CREATE TABLE IF NOT EXISTS public.support_tickets ();
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.support_tickets ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.support_tickets ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.support_tickets ALTER COLUMN subject SET NOT NULL;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS status text DEFAULT 'open'::text;
ALTER TABLE public.support_tickets ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.support_tickets ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.support_tickets ALTER COLUMN updated_at SET NOT NULL;

-- Tabela: user_roles
CREATE TABLE IF NOT EXISTS public.user_roles ();
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.user_roles ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.user_roles ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role app_role;
ALTER TABLE public.user_roles ALTER COLUMN role SET NOT NULL;

-- Tabela: video_testimonials
CREATE TABLE IF NOT EXISTS public.video_testimonials ();
ALTER TABLE public.video_testimonials ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.video_testimonials ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.video_testimonials ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.video_testimonials ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.video_testimonials ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.video_testimonials ALTER COLUMN name SET NOT NULL;
ALTER TABLE public.video_testimonials ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE public.video_testimonials ALTER COLUMN video_url SET NOT NULL;
ALTER TABLE public.video_testimonials ADD COLUMN IF NOT EXISTS thumbnail_url text DEFAULT ''::text;
ALTER TABLE public.video_testimonials ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.video_testimonials ALTER COLUMN created_at SET NOT NULL;

-- Tabela: webhook_logs
CREATE TABLE IF NOT EXISTS public.webhook_logs ();
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.webhook_logs ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS gateway text;
ALTER TABLE public.webhook_logs ALTER COLUMN gateway SET NOT NULL;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS http_status integer DEFAULT 200;
ALTER TABLE public.webhook_logs ALTER COLUMN http_status SET NOT NULL;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS latency_ms integer;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS signature_valid boolean;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS signature_error text;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS request_headers jsonb;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS request_payload jsonb;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.webhook_logs ALTER COLUMN created_at SET NOT NULL;

-- Tabela: webhook_retry_queue
CREATE TABLE IF NOT EXISTS public.webhook_retry_queue ();
ALTER TABLE public.webhook_retry_queue ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.webhook_retry_queue ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.webhook_retry_queue ADD COLUMN IF NOT EXISTS gateway text;
ALTER TABLE public.webhook_retry_queue ALTER COLUMN gateway SET NOT NULL;
ALTER TABLE public.webhook_retry_queue ADD COLUMN IF NOT EXISTS function_name text;
ALTER TABLE public.webhook_retry_queue ALTER COLUMN function_name SET NOT NULL;
ALTER TABLE public.webhook_retry_queue ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.webhook_retry_queue ADD COLUMN IF NOT EXISTS request_payload jsonb;
ALTER TABLE public.webhook_retry_queue ALTER COLUMN request_payload SET NOT NULL;
ALTER TABLE public.webhook_retry_queue ADD COLUMN IF NOT EXISTS request_headers jsonb;
ALTER TABLE public.webhook_retry_queue ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text;
ALTER TABLE public.webhook_retry_queue ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.webhook_retry_queue ADD COLUMN IF NOT EXISTS attempts integer DEFAULT 0;
ALTER TABLE public.webhook_retry_queue ALTER COLUMN attempts SET NOT NULL;
ALTER TABLE public.webhook_retry_queue ADD COLUMN IF NOT EXISTS max_attempts integer DEFAULT 6;
ALTER TABLE public.webhook_retry_queue ALTER COLUMN max_attempts SET NOT NULL;
ALTER TABLE public.webhook_retry_queue ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz DEFAULT now();
ALTER TABLE public.webhook_retry_queue ALTER COLUMN next_attempt_at SET NOT NULL;
ALTER TABLE public.webhook_retry_queue ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.webhook_retry_queue ADD COLUMN IF NOT EXISTS last_status integer;
ALTER TABLE public.webhook_retry_queue ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE public.webhook_retry_queue ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.webhook_retry_queue ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.webhook_retry_queue ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.webhook_retry_queue ALTER COLUMN updated_at SET NOT NULL;

-- Tabela: wholesale_prices
CREATE TABLE IF NOT EXISTS public.wholesale_prices ();
ALTER TABLE public.wholesale_prices ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.wholesale_prices ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.wholesale_prices ADD COLUMN IF NOT EXISTS variation_id uuid;
ALTER TABLE public.wholesale_prices ALTER COLUMN variation_id SET NOT NULL;
ALTER TABLE public.wholesale_prices ADD COLUMN IF NOT EXISTS min_quantity integer;
ALTER TABLE public.wholesale_prices ALTER COLUMN min_quantity SET NOT NULL;
ALTER TABLE public.wholesale_prices ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0;
ALTER TABLE public.wholesale_prices ALTER COLUMN price SET NOT NULL;
ALTER TABLE public.wholesale_prices ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.wholesale_prices ALTER COLUMN created_at SET NOT NULL;

-- 4) Constraints (Primary Keys e Unique)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ab_card_events_pkey') THEN
    ALTER TABLE public.ab_card_events ADD CONSTRAINT ab_card_events_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='addresses_pkey') THEN
    ALTER TABLE public.addresses ADD CONSTRAINT addresses_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='api_idempotency_keys_pkey') THEN
    ALTER TABLE public.api_idempotency_keys ADD CONSTRAINT api_idempotency_keys_pkey PRIMARY KEY (key);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='banner_slides_pkey') THEN
    ALTER TABLE public.banner_slides ADD CONSTRAINT banner_slides_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='banners_pkey') THEN
    ALTER TABLE public.banners ADD CONSTRAINT banners_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bulk_email_campaigns_pkey') THEN
    ALTER TABLE public.bulk_email_campaigns ADD CONSTRAINT bulk_email_campaigns_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bulk_email_templates_pkey') THEN
    ALTER TABLE public.bulk_email_templates ADD CONSTRAINT bulk_email_templates_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cart_abandonment_logs_pkey') THEN
    ALTER TABLE public.cart_abandonment_logs ADD CONSTRAINT cart_abandonment_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cart_items_pkey') THEN
    ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cart_items_user_id_variation_id_key') THEN
    ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_user_id_variation_id_key UNIQUE (user_id, variation_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_preferences_pkey') THEN
    ALTER TABLE public.contact_preferences ADD CONSTRAINT contact_preferences_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contact_preferences_user_id_key') THEN
    ALTER TABLE public.contact_preferences ADD CONSTRAINT contact_preferences_user_id_key UNIQUE (user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='coupon_products_coupon_id_product_id_key') THEN
    ALTER TABLE public.coupon_products ADD CONSTRAINT coupon_products_coupon_id_product_id_key UNIQUE (coupon_id, product_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='coupon_products_pkey') THEN
    ALTER TABLE public.coupon_products ADD CONSTRAINT coupon_products_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='coupons_pkey') THEN
    ALTER TABLE public.coupons ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_send_log_pkey') THEN
    ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='gateway_settings_audit_pkey') THEN
    ALTER TABLE public.gateway_settings_audit ADD CONSTRAINT gateway_settings_audit_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orders_pkey') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_links_pkey') THEN
    ALTER TABLE public.payment_links ADD CONSTRAINT payment_links_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_links_slug_key') THEN
    ALTER TABLE public.payment_links ADD CONSTRAINT payment_links_slug_key UNIQUE (slug);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_logs_pkey') THEN
    ALTER TABLE public.payment_logs ADD CONSTRAINT payment_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='popups_pkey') THEN
    ALTER TABLE public.popups ADD CONSTRAINT popups_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_upsells_pkey') THEN
    ALTER TABLE public.product_upsells ADD CONSTRAINT product_upsells_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_upsells_unique') THEN
    ALTER TABLE public.product_upsells ADD CONSTRAINT product_upsells_unique UNIQUE (product_id, upsell_product_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_variation_files_pkey') THEN
    ALTER TABLE public.product_variation_files ADD CONSTRAINT product_variation_files_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_variations_pkey') THEN
    ALTER TABLE public.product_variations ADD CONSTRAINT product_variations_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_pkey') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_pkey') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_user_id_key') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reviews_pkey') THEN
    ALTER TABLE public.reviews ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reviews_user_id_order_id_key') THEN
    ALTER TABLE public.reviews ADD CONSTRAINT reviews_user_id_order_id_key UNIQUE (user_id, order_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='shipping_logs_pkey') THEN
    ALTER TABLE public.shipping_logs ADD CONSTRAINT shipping_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='site_settings_key_key') THEN
    ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_key_key UNIQUE (key);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='site_settings_key_unique') THEN
    ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_key_unique UNIQUE (key);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='site_settings_pkey') THEN
    ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='support_messages_pkey') THEN
    ALTER TABLE public.support_messages ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='support_tickets_pkey') THEN
    ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_roles_pkey') THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_roles_user_id_role_key') THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='video_testimonials_pkey') THEN
    ALTER TABLE public.video_testimonials ADD CONSTRAINT video_testimonials_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='webhook_logs_pkey') THEN
    ALTER TABLE public.webhook_logs ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='webhook_retry_queue_pkey') THEN
    ALTER TABLE public.webhook_retry_queue ADD CONSTRAINT webhook_retry_queue_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='wholesale_prices_pkey') THEN
    ALTER TABLE public.wholesale_prices ADD CONSTRAINT wholesale_prices_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- 5) Foreign Keys

-- 6) Row Level Security

ALTER TABLE public.ab_card_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banner_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_abandonment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gateway_settings_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_upsells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variation_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_retry_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wholesale_prices ENABLE ROW LEVEL SECURITY;

-- 7) Funções

CREATE OR REPLACE FUNCTION public.dispatch_order_email(_template text, _to text, _subject text, _data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.ensure_single_default_address()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.addresses SET is_default = false
    WHERE user_id = NEW.user_id AND id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;

CREATE OR REPLACE FUNCTION public.increment_coupon_usage(_coupon_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- A contagem agora é em tempo real via view coupons_with_usage.
  -- Esta função permanece apenas para compatibilidade com webhooks existentes.
  -- Retorna true se o cupom existe e está ativo.
  RETURN EXISTS (
    SELECT 1 FROM public.coupons
    WHERE LOWER(code) = LOWER(_coupon_code) AND active = true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_existing_orders_to_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    UPDATE public.orders
    SET customer_user_id = NEW.id
    WHERE customer_user_id IS NULL
      AND LOWER(customer_email) = LOWER(NEW.email);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_order_to_user_by_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.touch_webhook_retry_queue()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_send_order_emails()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 8) Políticas RLS

DROP POLICY IF EXISTS "Admins can delete ab events" ON public.ab_card_events;
CREATE POLICY "Admins can delete ab events" ON public.ab_card_events AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can view ab events" ON public.ab_card_events;
CREATE POLICY "Admins can view ab events" ON public.ab_card_events AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Anyone can insert ab events" ON public.ab_card_events;
CREATE POLICY "Anyone can insert ab events" ON public.ab_card_events AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Users can delete own addresses" ON public.addresses;
CREATE POLICY "Users can delete own addresses" ON public.addresses AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can insert own addresses" ON public.addresses;
CREATE POLICY "Users can insert own addresses" ON public.addresses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can update own addresses" ON public.addresses;
CREATE POLICY "Users can update own addresses" ON public.addresses AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can view own addresses" ON public.addresses;
CREATE POLICY "Users can view own addresses" ON public.addresses AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Admins can view idempotency keys" ON public.api_idempotency_keys;
CREATE POLICY "Admins can view idempotency keys" ON public.api_idempotency_keys AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Anyone can view banner slides" ON public.banner_slides;
CREATE POLICY "Anyone can view banner slides" ON public.banner_slides AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Auth users can delete banner slides" ON public.banner_slides;
CREATE POLICY "Auth users can delete banner slides" ON public.banner_slides AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Auth users can insert banner slides" ON public.banner_slides;
CREATE POLICY "Auth users can insert banner slides" ON public.banner_slides AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Auth users can update banner slides" ON public.banner_slides;
CREATE POLICY "Auth users can update banner slides" ON public.banner_slides AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Anyone can view active banners" ON public.banners;
CREATE POLICY "Anyone can view active banners" ON public.banners AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete their banners" ON public.banners;
CREATE POLICY "Authenticated users can delete their banners" ON public.banners AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Authenticated users can insert banners" ON public.banners;
CREATE POLICY "Authenticated users can insert banners" ON public.banners AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Authenticated users can update their banners" ON public.banners;
CREATE POLICY "Authenticated users can update their banners" ON public.banners AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Admins manage bulk_email_campaigns" ON public.bulk_email_campaigns;
CREATE POLICY "Admins manage bulk_email_campaigns" ON public.bulk_email_campaigns AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins manage bulk_email_templates" ON public.bulk_email_templates;
CREATE POLICY "Admins manage bulk_email_templates" ON public.bulk_email_templates AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Service role full access" ON public.cart_abandonment_logs;
CREATE POLICY "Service role full access" ON public.cart_abandonment_logs AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can view all cart items" ON public.cart_items;
CREATE POLICY "Admins can view all cart items" ON public.cart_items AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can delete their own cart items" ON public.cart_items;
CREATE POLICY "Users can delete their own cart items" ON public.cart_items AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can insert their own cart items" ON public.cart_items;
CREATE POLICY "Users can insert their own cart items" ON public.cart_items AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can update their own cart items" ON public.cart_items;
CREATE POLICY "Users can update their own cart items" ON public.cart_items AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can view their own cart items" ON public.cart_items;
CREATE POLICY "Users can view their own cart items" ON public.cart_items AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Admins view all contact preferences" ON public.contact_preferences;
CREATE POLICY "Admins view all contact preferences" ON public.contact_preferences AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users insert own contact preferences" ON public.contact_preferences;
CREATE POLICY "Users insert own contact preferences" ON public.contact_preferences AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users update own contact preferences" ON public.contact_preferences;
CREATE POLICY "Users update own contact preferences" ON public.contact_preferences AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users view own contact preferences" ON public.contact_preferences;
CREATE POLICY "Users view own contact preferences" ON public.contact_preferences AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Admins can manage coupon_products" ON public.coupon_products;
CREATE POLICY "Admins can manage coupon_products" ON public.coupon_products AS PERMISSIVE FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Public can read coupon_products" ON public.coupon_products;
CREATE POLICY "Public can read coupon_products" ON public.coupon_products AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admins can manage coupons" ON public.coupons;
CREATE POLICY "Admins can manage coupons" ON public.coupons AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Anyone can view active coupons" ON public.coupons;
CREATE POLICY "Anyone can view active coupons" ON public.coupons AS PERMISSIVE FOR SELECT TO public USING ((active = true));
DROP POLICY IF EXISTS "Admins can delete email send log" ON public.email_send_log;
CREATE POLICY "Admins can delete email send log" ON public.email_send_log AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can view email send log" ON public.email_send_log;
CREATE POLICY "Admins can view email send log" ON public.email_send_log AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can delete gateway audit" ON public.gateway_settings_audit;
CREATE POLICY "Admins can delete gateway audit" ON public.gateway_settings_audit AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can insert gateway audit" ON public.gateway_settings_audit;
CREATE POLICY "Admins can insert gateway audit" ON public.gateway_settings_audit AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) AND (auth.uid() = user_id)));
DROP POLICY IF EXISTS "Admins can view gateway audit" ON public.gateway_settings_audit;
CREATE POLICY "Admins can view gateway audit" ON public.gateway_settings_audit AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can delete orders" ON public.orders;
CREATE POLICY "Admins can delete orders" ON public.orders AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Anyone can insert orders" ON public.orders;
CREATE POLICY "Anyone can insert orders" ON public.orders AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.orders;
CREATE POLICY "Authenticated users can view orders" ON public.orders AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Customers can view their own orders" ON public.orders;
CREATE POLICY "Customers can view their own orders" ON public.orders AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = customer_user_id));
DROP POLICY IF EXISTS "Service role can update orders" ON public.orders;
CREATE POLICY "Service role can update orders" ON public.orders AS PERMISSIVE FOR UPDATE TO public USING (true);
DROP POLICY IF EXISTS "Admins can manage payment links" ON public.payment_links;
CREATE POLICY "Admins can manage payment links" ON public.payment_links AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Anyone can view active payment links" ON public.payment_links;
CREATE POLICY "Anyone can view active payment links" ON public.payment_links AS PERMISSIVE FOR SELECT TO public USING ((active = true));
DROP POLICY IF EXISTS "Admins can delete payment logs" ON public.payment_logs;
CREATE POLICY "Admins can delete payment logs" ON public.payment_logs AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can view payment logs" ON public.payment_logs;
CREATE POLICY "Admins can view payment logs" ON public.payment_logs AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Anyone can insert payment logs" ON public.payment_logs;
CREATE POLICY "Anyone can insert payment logs" ON public.payment_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can delete popups" ON public.popups;
CREATE POLICY "Admins can delete popups" ON public.popups AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can insert popups" ON public.popups;
CREATE POLICY "Admins can insert popups" ON public.popups AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can update popups" ON public.popups;
CREATE POLICY "Admins can update popups" ON public.popups AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Anyone can view active popups" ON public.popups;
CREATE POLICY "Anyone can view active popups" ON public.popups AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Anyone can view upsells" ON public.product_upsells;
CREATE POLICY "Anyone can view upsells" ON public.product_upsells AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Owner can delete upsells" ON public.product_upsells;
CREATE POLICY "Owner can delete upsells" ON public.product_upsells AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_upsells.product_id) AND (p.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Owner can insert upsells" ON public.product_upsells;
CREATE POLICY "Owner can insert upsells" ON public.product_upsells AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_upsells.product_id) AND (p.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Owner can update upsells" ON public.product_upsells;
CREATE POLICY "Owner can update upsells" ON public.product_upsells AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_upsells.product_id) AND (p.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Customers can view files of their paid orders" ON public.product_variation_files;
CREATE POLICY "Customers can view files of their paid orders" ON public.product_variation_files AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (product_variations pv
     JOIN orders o ON ((upper(o.status) = ANY (ARRAY['PAID'::text, 'CONFIRMED'::text, 'RECEIVED'::text, 'RECEIVED_IN_CASH'::text]))))
  WHERE ((pv.id = product_variation_files.variation_id) AND (o.customer_user_id = auth.uid()) AND (o.product_name ~~* (('%'::text || ( SELECT products.name
           FROM products
          WHERE (products.id = pv.product_id))) || '%'::text))))));
DROP POLICY IF EXISTS "Owner can delete digital files" ON public.product_variation_files;
CREATE POLICY "Owner can delete digital files" ON public.product_variation_files AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (product_variations pv
     JOIN products p ON ((p.id = pv.product_id)))
  WHERE ((pv.id = product_variation_files.variation_id) AND (p.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Owner can insert digital files" ON public.product_variation_files;
CREATE POLICY "Owner can insert digital files" ON public.product_variation_files AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (product_variations pv
     JOIN products p ON ((p.id = pv.product_id)))
  WHERE ((pv.id = product_variation_files.variation_id) AND (p.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Owner can update digital files" ON public.product_variation_files;
CREATE POLICY "Owner can update digital files" ON public.product_variation_files AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (product_variations pv
     JOIN products p ON ((p.id = pv.product_id)))
  WHERE ((pv.id = product_variation_files.variation_id) AND (p.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Owner can view digital files" ON public.product_variation_files;
CREATE POLICY "Owner can view digital files" ON public.product_variation_files AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (product_variations pv
     JOIN products p ON ((p.id = pv.product_id)))
  WHERE ((pv.id = product_variation_files.variation_id) AND (p.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Anyone can view variations" ON public.product_variations;
CREATE POLICY "Anyone can view variations" ON public.product_variations AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Owner can delete variations" ON public.product_variations;
CREATE POLICY "Owner can delete variations" ON public.product_variations AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM products
  WHERE ((products.id = product_variations.product_id) AND (products.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Owner can insert variations" ON public.product_variations;
CREATE POLICY "Owner can insert variations" ON public.product_variations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM products
  WHERE ((products.id = product_variations.product_id) AND (products.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Owner can update variations" ON public.product_variations;
CREATE POLICY "Owner can update variations" ON public.product_variations AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM products
  WHERE ((products.id = product_variations.product_id) AND (products.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Authenticated users can delete their products" ON public.products;
CREATE POLICY "Authenticated users can delete their products" ON public.products AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
CREATE POLICY "Authenticated users can insert products" ON public.products AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Authenticated users can update their products" ON public.products;
CREATE POLICY "Authenticated users can update their products" ON public.products AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
CREATE POLICY "Authenticated users can view products" ON public.products AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Admins can delete any review" ON public.reviews;
CREATE POLICY "Admins can delete any review" ON public.reviews AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Anyone can view reviews publicly" ON public.reviews;
CREATE POLICY "Anyone can view reviews publicly" ON public.reviews AS PERMISSIVE FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Authenticated can view all reviews" ON public.reviews;
CREATE POLICY "Authenticated can view all reviews" ON public.reviews AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users can delete own reviews" ON public.reviews;
CREATE POLICY "Users can delete own reviews" ON public.reviews AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can insert own reviews" ON public.reviews;
CREATE POLICY "Users can insert own reviews" ON public.reviews AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can update own reviews" ON public.reviews;
CREATE POLICY "Users can update own reviews" ON public.reviews AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can view own reviews" ON public.reviews;
CREATE POLICY "Users can view own reviews" ON public.reviews AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Authenticated users can view shipping logs" ON public.shipping_logs;
CREATE POLICY "Authenticated users can view shipping logs" ON public.shipping_logs AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Service role can insert shipping logs" ON public.shipping_logs;
CREATE POLICY "Service role can insert shipping logs" ON public.shipping_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can delete settings" ON public.site_settings;
CREATE POLICY "Admins can delete settings" ON public.site_settings AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can insert settings" ON public.site_settings;
CREATE POLICY "Admins can insert settings" ON public.site_settings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can update settings" ON public.site_settings;
CREATE POLICY "Admins can update settings" ON public.site_settings AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Anyone can view settings" ON public.site_settings;
CREATE POLICY "Anyone can view settings" ON public.site_settings AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admins can insert messages" ON public.support_messages;
CREATE POLICY "Admins can insert messages" ON public.support_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND has_role(auth.uid(), 'admin'::app_role)));
DROP POLICY IF EXISTS "Admins can view all messages" ON public.support_messages;
CREATE POLICY "Admins can view all messages" ON public.support_messages AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can insert messages on own tickets" ON public.support_messages;
CREATE POLICY "Users can insert messages on own tickets" ON public.support_messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM support_tickets
  WHERE ((support_tickets.id = support_messages.ticket_id) AND (support_tickets.user_id = auth.uid()))))));
DROP POLICY IF EXISTS "Users can view own ticket messages" ON public.support_messages;
CREATE POLICY "Users can view own ticket messages" ON public.support_messages AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM support_tickets
  WHERE ((support_tickets.id = support_messages.ticket_id) AND (support_tickets.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Admins can update any ticket" ON public.support_tickets;
CREATE POLICY "Admins can update any ticket" ON public.support_tickets AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can view all tickets" ON public.support_tickets;
CREATE POLICY "Admins can view all tickets" ON public.support_tickets AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can insert own tickets" ON public.support_tickets;
CREATE POLICY "Users can insert own tickets" ON public.support_tickets AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can update own tickets" ON public.support_tickets;
CREATE POLICY "Users can update own tickets" ON public.support_tickets AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can view own tickets" ON public.support_tickets;
CREATE POLICY "Users can view own tickets" ON public.support_tickets AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles" ON public.user_roles AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles" ON public.user_roles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
CREATE POLICY "Users can view own role" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Anyone can view testimonials" ON public.video_testimonials;
CREATE POLICY "Anyone can view testimonials" ON public.video_testimonials AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete testimonials" ON public.video_testimonials;
CREATE POLICY "Authenticated users can delete testimonials" ON public.video_testimonials AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Authenticated users can insert testimonials" ON public.video_testimonials;
CREATE POLICY "Authenticated users can insert testimonials" ON public.video_testimonials AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Authenticated users can update testimonials" ON public.video_testimonials;
CREATE POLICY "Authenticated users can update testimonials" ON public.video_testimonials AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Admins can delete webhook logs" ON public.webhook_logs;
CREATE POLICY "Admins can delete webhook logs" ON public.webhook_logs AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can view webhook logs" ON public.webhook_logs;
CREATE POLICY "Admins can view webhook logs" ON public.webhook_logs AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can delete webhook retry queue" ON public.webhook_retry_queue;
CREATE POLICY "Admins can delete webhook retry queue" ON public.webhook_retry_queue AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can update webhook retry queue" ON public.webhook_retry_queue;
CREATE POLICY "Admins can update webhook retry queue" ON public.webhook_retry_queue AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can view webhook retry queue" ON public.webhook_retry_queue;
CREATE POLICY "Admins can view webhook retry queue" ON public.webhook_retry_queue AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Anyone can view wholesale prices" ON public.wholesale_prices;
CREATE POLICY "Anyone can view wholesale prices" ON public.wholesale_prices AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Owner can delete wholesale prices" ON public.wholesale_prices;
CREATE POLICY "Owner can delete wholesale prices" ON public.wholesale_prices AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (product_variations pv
     JOIN products p ON ((p.id = pv.product_id)))
  WHERE ((pv.id = wholesale_prices.variation_id) AND (p.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Owner can insert wholesale prices" ON public.wholesale_prices;
CREATE POLICY "Owner can insert wholesale prices" ON public.wholesale_prices AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (product_variations pv
     JOIN products p ON ((p.id = pv.product_id)))
  WHERE ((pv.id = wholesale_prices.variation_id) AND (p.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Owner can update wholesale prices" ON public.wholesale_prices;
CREATE POLICY "Owner can update wholesale prices" ON public.wholesale_prices AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (product_variations pv
     JOIN products p ON ((p.id = pv.product_id)))
  WHERE ((pv.id = wholesale_prices.variation_id) AND (p.user_id = auth.uid())))));

-- 9) Views

CREATE OR REPLACE VIEW public.coupons_with_usage AS
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
           FROM orders o
          WHERE ((upper(o.coupon_code) = upper(c.code)) AND (o.status = ANY (ARRAY['PAID'::text, 'CONFIRMED'::text, 'RECEIVED'::text, 'paid'::text, 'confirmed'::text, 'received'::text])))), 0) AS current_uses
   FROM coupons c;

-- 10) Triggers

-- 11) Triggers em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
DROP TRIGGER IF EXISTS on_auth_user_link_orders ON auth.users;
CREATE TRIGGER on_auth_user_link_orders AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.link_existing_orders_to_new_user();

-- 12) Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars','avatars',true),
  ('banner-images','banner-images',true),
  ('digital-file-covers','digital-file-covers',true),
  ('digital-files','digital-files',false),
  ('product-images','product-images',true),
  ('testimonial-videos','testimonial-videos',true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- 13) Storage policies
DROP POLICY IF EXISTS "Anyone can view banner images" ON storage.objects;
CREATE POLICY "Anyone can view banner images" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'banner-images'::text));
DROP POLICY IF EXISTS "Anyone can view digital file covers" ON storage.objects;
CREATE POLICY "Anyone can view digital file covers" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'digital-file-covers'::text));
DROP POLICY IF EXISTS "Auth users can delete banner images" ON storage.objects;
CREATE POLICY "Auth users can delete banner images" ON storage.objects FOR DELETE TO public USING (((bucket_id = 'banner-images'::text) AND (auth.role() = 'authenticated'::text)));
DROP POLICY IF EXISTS "Auth users can update banner images" ON storage.objects;
CREATE POLICY "Auth users can update banner images" ON storage.objects FOR UPDATE TO public USING (((bucket_id = 'banner-images'::text) AND (auth.role() = 'authenticated'::text)));
DROP POLICY IF EXISTS "Auth users can upload banner images" ON storage.objects;
CREATE POLICY "Auth users can upload banner images" ON storage.objects FOR INSERT TO public WITH CHECK (((bucket_id = 'banner-images'::text) AND (auth.role() = 'authenticated'::text)));
DROP POLICY IF EXISTS "Authenticated can delete product images" ON storage.objects;
CREATE POLICY "Authenticated can delete product images" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'product-images'::text));
DROP POLICY IF EXISTS "Authenticated can delete testimonial videos" ON storage.objects;
CREATE POLICY "Authenticated can delete testimonial videos" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'testimonial-videos'::text));
DROP POLICY IF EXISTS "Authenticated can update product images" ON storage.objects;
CREATE POLICY "Authenticated can update product images" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'product-images'::text));
DROP POLICY IF EXISTS "Authenticated can update testimonial videos" ON storage.objects;
CREATE POLICY "Authenticated can update testimonial videos" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'testimonial-videos'::text));
DROP POLICY IF EXISTS "Authenticated can upload product images" ON storage.objects;
CREATE POLICY "Authenticated can upload product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'product-images'::text));
DROP POLICY IF EXISTS "Authenticated can upload testimonial videos" ON storage.objects;
CREATE POLICY "Authenticated can upload testimonial videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'testimonial-videos'::text));
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
CREATE POLICY "Avatars are publicly accessible" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'avatars'::text));
DROP POLICY IF EXISTS "Owner can delete digital file covers" ON storage.objects;
CREATE POLICY "Owner can delete digital file covers" ON storage.objects FOR DELETE TO public USING (((bucket_id = 'digital-file-covers'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
DROP POLICY IF EXISTS "Owner can delete own digital files" ON storage.objects;
CREATE POLICY "Owner can delete own digital files" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'digital-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
DROP POLICY IF EXISTS "Owner can read own digital files" ON storage.objects;
CREATE POLICY "Owner can read own digital files" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'digital-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
DROP POLICY IF EXISTS "Owner can update digital file covers" ON storage.objects;
CREATE POLICY "Owner can update digital file covers" ON storage.objects FOR UPDATE TO public USING (((bucket_id = 'digital-file-covers'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
DROP POLICY IF EXISTS "Owner can update own digital files" ON storage.objects;
CREATE POLICY "Owner can update own digital files" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'digital-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
DROP POLICY IF EXISTS "Owner can upload digital file covers" ON storage.objects;
CREATE POLICY "Owner can upload digital file covers" ON storage.objects FOR INSERT TO public WITH CHECK (((bucket_id = 'digital-file-covers'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
DROP POLICY IF EXISTS "Owner can upload digital files" ON storage.objects;
CREATE POLICY "Owner can upload digital files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'digital-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;
CREATE POLICY "Public can view product images" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'product-images'::text));
DROP POLICY IF EXISTS "Public can view testimonial videos" ON storage.objects;
CREATE POLICY "Public can view testimonial videos" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'testimonial-videos'::text));
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE TO public USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE TO public USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT TO public WITH CHECK (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

-- ============================================================
-- FIM do schema
-- ============================================================
