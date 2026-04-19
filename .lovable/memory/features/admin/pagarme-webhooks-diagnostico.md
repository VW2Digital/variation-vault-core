---
name: Pagar.me Webhooks Admin
description: Painel de diagnóstico de webhooks Pagar.me — listar, ver detalhes e reenviar via API v5
type: feature
---
Painel administrativo de diagnóstico de webhooks Pagar.me em `/admin/configuracoes/pagamento/pagarme`.

- Edge function: `pagarme-webhooks-admin` (action: `list` | `get` | `resend`)
- Endpoints Pagar.me v5 usados: `GET /core/v5/hooks`, `GET /core/v5/hooks/:id`, `POST /core/v5/hooks/:id/retry`
- Auth: requer usuário autenticado + role `admin` (validação em código com `auth.getClaims` + checagem em `user_roles`)
- Componente: `src/components/admin/PagarMeWebhooksPanel.tsx` — tabela de hooks com filtro por status, dialog de detalhes (payload completo) e botão de reenvio
- Renderizado dentro de `PagarMeSettings` apenas quando o gateway está ativo e há `pagarme_secret_key_<env>` salva
- Reenvio dispara refresh automático da lista após ~800ms para refletir nova tentativa
