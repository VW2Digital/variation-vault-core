-- 1) Remover trigger de sincronização manual (agora será calculado em tempo real)
DROP TRIGGER IF EXISTS trg_sync_coupon_usage ON public.orders;
DROP FUNCTION IF EXISTS public.sync_coupon_usage_on_order_change();

-- 2) Criar view que calcula uses em tempo real a partir de orders
CREATE OR REPLACE VIEW public.coupons_with_usage
WITH (security_invoker = on) AS
SELECT
  c.id,
  c.user_id,
  c.code,
  c.discount_type,
  c.discount_value,
  c.max_uses,
  c.active,
  c.product_id,
  c.created_at,
  c.updated_at,
  COALESCE((
    SELECT COUNT(*)::int
    FROM public.orders o
    WHERE UPPER(o.coupon_code) = UPPER(c.code)
      AND o.status IN ('PAID','CONFIRMED','RECEIVED','paid','confirmed','received')
  ), 0) AS current_uses
FROM public.coupons c;

-- 3) Atualizar a função RPC de incremento para apenas validar disponibilidade
-- (não precisa mais incrementar manualmente, mas mantém compatibilidade chamando)
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