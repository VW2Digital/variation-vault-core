-- ============================================================================
-- Triggers para disparar send-email automaticamente em mudanças de orders
-- ============================================================================

-- Garantir extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Função auxiliar: monta payload e chama a edge function send-email
CREATE OR REPLACE FUNCTION public.dispatch_order_email(
  _template text,
  _to text,
  _subject text,
  _data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Trigger function: dispara em INSERT e UPDATE em orders
CREATE OR REPLACE FUNCTION public.trigger_send_order_emails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _payment_method text;
BEGIN
  -- Normaliza método de pagamento para exibição
  _payment_method := CASE
    WHEN NEW.payment_method ILIKE '%credit%' OR NEW.payment_method ILIKE '%card%' THEN 'Cartão de Crédito'
    WHEN NEW.payment_method ILIKE '%pix%' THEN 'PIX'
    WHEN NEW.payment_method ILIKE '%boleto%' THEN 'Boleto'
    ELSE COALESCE(NEW.payment_method, '—')
  END;

  -- ── 1. INSERT: pedido recebido ──────────────────────────────────────
  IF (TG_OP = 'INSERT') THEN
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

  -- ── 2. UPDATE: status mudou ─────────────────────────────────────────
  IF (TG_OP = 'UPDATE') THEN
    -- Pagamento aprovado
    IF (OLD.status IS DISTINCT FROM NEW.status)
       AND NEW.status IN ('PAID', 'CONFIRMED', 'RECEIVED', 'paid', 'confirmed')
       AND OLD.status NOT IN ('PAID', 'CONFIRMED', 'RECEIVED', 'paid', 'confirmed') THEN
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

    -- Pagamento recusado
    IF (OLD.status IS DISTINCT FROM NEW.status)
       AND NEW.status IN ('REFUSED', 'REPROVED', 'CANCELLED', 'CANCELED', 'FAILED', 'refused', 'cancelled') THEN
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

-- Drop triggers antigos (se existirem) e recria
DROP TRIGGER IF EXISTS orders_send_email_insert ON public.orders;
DROP TRIGGER IF EXISTS orders_send_email_update ON public.orders;

CREATE TRIGGER orders_send_email_insert
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_send_order_emails();

CREATE TRIGGER orders_send_email_update
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_send_order_emails();
