-- Corrige trigger de emails: NÃO disparar "Pedido recebido" (order_created)
-- quando o pedido já é criado com status de recusa/cancelamento.
-- Também garante que o email só é enviado se houver email do cliente.

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