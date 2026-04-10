DROP FUNCTION IF EXISTS public.increment_coupon_usage(text);

CREATE FUNCTION public.increment_coupon_usage(_coupon_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _updated_count integer;
BEGIN
  UPDATE public.coupons
  SET current_uses = current_uses + 1,
      updated_at = now()
  WHERE LOWER(code) = LOWER(_coupon_code)
    AND active = true
    AND current_uses < max_uses;

  GET DIAGNOSTICS _updated_count = ROW_COUNT;
  RETURN _updated_count > 0;
END;
$$;