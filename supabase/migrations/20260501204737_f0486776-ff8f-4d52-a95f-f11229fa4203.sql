
-- Trigger to enforce wholesale minimum quantity when inserting orders
-- Validates against the customer's cart_items + wholesale_prices when available

CREATE OR REPLACE FUNCTION public.enforce_wholesale_minimum_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_violation RECORD;
BEGIN
  -- Only validate when we have an authenticated customer linked to the order
  IF NEW.customer_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look for any cart item of this user whose quantity is below the minimum
  -- of the lowest wholesale tier configured for that variation
  SELECT
    pv.dosage,
    p.name AS product_name,
    ci.quantity AS cart_quantity,
    MIN(wp.min_quantity) AS required_min
  INTO v_violation
  FROM public.cart_items ci
  JOIN public.product_variations pv ON pv.id = ci.variation_id
  JOIN public.products p ON p.id = pv.product_id
  JOIN public.wholesale_prices wp ON wp.variation_id = ci.variation_id
  WHERE ci.user_id = NEW.customer_user_id
  GROUP BY pv.id, pv.dosage, p.name, ci.quantity
  HAVING ci.quantity < MIN(wp.min_quantity)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Quantidade abaixo do mínimo de atacado para "%" (%): mínimo de % unidades, encontrado %.',
      v_violation.product_name,
      COALESCE(v_violation.dosage, ''),
      v_violation.required_min,
      v_violation.cart_quantity
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_wholesale_minimum_on_order ON public.orders;

CREATE TRIGGER trg_enforce_wholesale_minimum_on_order
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_wholesale_minimum_on_order();

-- Also expose an RPC the frontend can call before submitting (single-product checkout)
-- It validates a specific (variation_id, quantity) pair
CREATE OR REPLACE FUNCTION public.validate_wholesale_minimum(
  _variation_id uuid,
  _quantity integer
)
RETURNS TABLE (
  valid boolean,
  required_min integer,
  product_name text,
  dosage text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min integer;
  v_name text;
  v_dosage text;
BEGIN
  SELECT MIN(wp.min_quantity), p.name, pv.dosage
  INTO v_min, v_name, v_dosage
  FROM public.wholesale_prices wp
  JOIN public.product_variations pv ON pv.id = wp.variation_id
  JOIN public.products p ON p.id = pv.product_id
  WHERE wp.variation_id = _variation_id
  GROUP BY p.name, pv.dosage;

  IF v_min IS NULL THEN
    RETURN QUERY SELECT true, 0, NULL::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT (_quantity >= v_min), v_min, v_name, v_dosage;
END;
$$;
