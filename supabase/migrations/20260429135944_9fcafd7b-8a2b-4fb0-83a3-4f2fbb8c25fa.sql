-- 1) Índice case-insensitive em customer_email
CREATE INDEX IF NOT EXISTS idx_orders_customer_email_lower
  ON public.orders (LOWER(customer_email));

-- 2) Backfill: vincular pedidos órfãos ao usuário correto (case-insensitive)
UPDATE public.orders o
SET customer_user_id = u.id
FROM auth.users u
WHERE o.customer_user_id IS NULL
  AND o.customer_email IS NOT NULL
  AND o.customer_email <> ''
  AND LOWER(u.email) = LOWER(o.customer_email);

-- 3) Trigger: ao inserir pedido sem user_id, tenta vincular pelo email
CREATE OR REPLACE FUNCTION public.link_order_to_user_by_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_link_order_to_user ON public.orders;
CREATE TRIGGER trg_link_order_to_user
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.link_order_to_user_by_email();

-- 4) Trigger: quando um novo usuário se cadastra, vincula pedidos antigos do mesmo email
CREATE OR REPLACE FUNCTION public.link_existing_orders_to_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_link_orders_on_new_user ON auth.users;
CREATE TRIGGER trg_link_orders_on_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_existing_orders_to_new_user();