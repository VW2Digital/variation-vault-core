UPDATE public.coupons AS c
SET current_uses = COALESCE(o.total_uses, 0),
    updated_at = now()
FROM (
  SELECT lower(coupon_code) AS coupon_code, count(*)::int AS total_uses
  FROM public.orders
  WHERE coupon_code IS NOT NULL
    AND btrim(coupon_code) <> ''
  GROUP BY lower(coupon_code)
) AS o
WHERE lower(c.code) = o.coupon_code;

UPDATE public.coupons AS c
SET current_uses = 0,
    updated_at = now()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.orders o
  WHERE o.coupon_code IS NOT NULL
    AND btrim(o.coupon_code) <> ''
    AND lower(o.coupon_code) = lower(c.code)
);