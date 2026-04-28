# Schema do Liberty Pharma para Supabase Cloud

Pacote SQL único que cria **toda** a estrutura do banco no seu projeto Supabase: 30 tabelas, RLS, triggers, funções, enum `app_role` e 3 buckets de storage.

## Como usar (1 clique)

1. Crie um projeto novo em https://supabase.com/dashboard/projects
2. Aguarde provisionar (~2 min)
3. Vá em **SQL Editor → New query**
4. Cole o conteúdo de [`schema.sql`](./schema.sql)
5. Clique em **Run** (ou Ctrl+Enter)
6. Aguarde "Success. No rows returned"

Pronto — schema completo no ar.

## O que é criado

| Categoria | Itens |
|---|---|
| **Tabelas** | profiles, user_roles, addresses, products, product_variations, product_upsells, wholesale_prices, cart_items, orders, coupons, coupon_products, payment_links, payment_logs, shipping_logs, webhook_logs, webhook_retry_queue, api_idempotency_keys, contact_preferences, email_send_log, bulk_email_campaigns, bulk_email_templates, cart_abandonment_logs, banners, banner_slides, popups, video_testimonials, reviews, support_tickets, support_messages, site_settings |
| **Enum** | `app_role` (admin, user) |
| **Funções** | `has_role`, `increment_coupon_usage`, `update_updated_at_column`, `ensure_single_default_address`, `handle_new_user`, `touch_webhook_retry_queue`, `dispatch_order_email`, `trigger_send_order_emails` |
| **Triggers** | 13 `updated_at` automáticos + endereço padrão único + auto-criação de perfil + auto-envio de e-mails de pedidos + touch da fila de retry |
| **RLS** | 113 políticas garantindo isolamento entre usuários e privilégios admin |
| **Storage** | Buckets `product-images`, `testimonial-videos`, `banner-images` (públicos) com policies |
| **Constraints únicos** | `(user_id, variation_id)` em carrinho, `upper(code)` em cupons, `(user_id, order_id)` em reviews, `key` em settings, `slug` em payment_links |
| **Extensões** | `pgcrypto`, `uuid-ossp`, `pg_net` (auto). `pg_cron` opcional para jobs agendados. |

## Pegar URL e chave para a VPS

Depois do schema rodar, vá em **Project Settings → API**:

- **Project URL** → `https://xxx.supabase.co`
- **anon / public key** → `eyJ...` (JWT longo)
- **Project Reference** → `xxx` (parte antes de `.supabase.co`)

Cole esses 3 valores quando o `install.sh` da VPS perguntar.

## Próximos passos manuais no painel

1. **Auth → Providers → Email**: deixe ativo. Se quiser pular confirmação de email, desmarque "Confirm email" (modo dev).
2. **Auth → Users**: clique em "Add user" e crie seu primeiro usuário.
3. **SQL Editor**: promova ele a admin:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('UUID-DO-USUARIO-AQUI', 'admin');
   ```
4. **Database → Extensions**: habilite `pg_cron` e `pg_net` se for usar carrinho abandonado / sync de rastreio.
5. **Edge Functions**: faça deploy de cada função em `supabase/functions/` via [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```bash
   supabase login
   supabase link --project-ref SEU_REF
   supabase functions deploy --no-verify-jwt
   ```
6. **Secrets das Edge Functions** (em Functions → Settings → Add new secret): adicione apenas as que for usar — `RESEND_API_KEY`, `MP_WEBHOOK_SECRET`, `LOVABLE_API_KEY`, etc.

## Segurança

- Todas as tabelas têm **RLS ativada** com policies específicas.
- A função `has_role` é `SECURITY DEFINER` para evitar recursão em policies.
- Roles ficam em tabela separada (`user_roles`) — nunca em `profiles` — pra evitar privilege escalation.
- Trigger em `auth.users` cria o perfil automaticamente no signup.

## Reset / reinstalação

O script é **idempotente para tabelas e funções** (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`), mas **não** apaga dados. Para zerar completamente:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
```

E depois rode o `schema.sql` de novo.
