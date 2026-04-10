
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(_coupon_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.coupons
  SET current_uses = current_uses + 1,
      updated_at = now()
  WHERE LOWER(code) = LOWER(_coupon_code)
    AND active = true
    AND current_uses < max_uses;
END;
$$;
