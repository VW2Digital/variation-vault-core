-- 1) Sincronizar contador atual com pedidos pagos existentes
UPDATE public.coupons c
SET current_uses = sub.cnt,
    updated_at = now()
FROM (
  SELECT UPPER(coupon_code) AS code, COUNT(*) AS cnt
  FROM public.orders
  WHERE coupon_code IS NOT NULL
    AND coupon_code <> ''
    AND status IN ('PAID','CONFIRMED','RECEIVED','paid','confirmed','received')
  GROUP BY UPPER(coupon_code)
) sub
WHERE UPPER(c.code) = sub.code;

-- 2) Trigger para incrementar/decrementar automaticamente quando o pedido muda para pago
CREATE OR REPLACE FUNCTION public.sync_coupon_usage_on_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _paid_statuses text[] := ARRAY['PAID','CONFIRMED','RECEIVED','paid','confirmed','received'];
  _was_paid boolean := false;
  _is_paid boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.coupon_code IS NOT NULL AND NEW.coupon_code <> '' AND NEW.status = ANY(_paid_statuses) THEN
      UPDATE public.coupons
      SET current_uses = current_uses + 1, updated_at = now()
      WHERE UPPER(code) = UPPER(NEW.coupon_code);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    _was_paid := OLD.status = ANY(_paid_statuses);
    _is_paid  := NEW.status = ANY(_paid_statuses);

    -- Tornou-se pago agora
    IF (NOT _was_paid) AND _is_paid AND NEW.coupon_code IS NOT NULL AND NEW.coupon_code <> '' THEN
      UPDATE public.coupons
      SET current_uses = current_uses + 1, updated_at = now()
      WHERE UPPER(code) = UPPER(NEW.coupon_code);
    END IF;

    -- Era pago e deixou de ser (estorno/cancelamento)
    IF _was_paid AND (NOT _is_paid) AND OLD.coupon_code IS NOT NULL AND OLD.coupon_code <> '' THEN
      UPDATE public.coupons
      SET current_uses = GREATEST(current_uses - 1, 0), updated_at = now()
      WHERE UPPER(code) = UPPER(OLD.coupon_code);
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_coupon_usage ON public.orders;
CREATE TRIGGER trg_sync_coupon_usage
AFTER INSERT OR UPDATE OF status, coupon_code ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_coupon_usage_on_order_change();

-- 3) Atualizar increment_coupon_usage para ser idempotente quando chamado manualmente
-- (continua funcionando, mas trigger é a fonte primária agora)