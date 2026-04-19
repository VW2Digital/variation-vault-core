---
name: Checkout Pagar.me
description: Integração Pagar.me v5 transparente exclusiva, com tokenização direta via API, HMAC-SHA1 no webhook e notificações WhatsApp/Email
type: feature
---

Integração com gateway Pagar.me v5 para checkout transparente (PIX e Cartão de crédito) na mesma página, seguindo o padrão Factory multi-gateway (`payment-checkout`) junto a Asaas, Mercado Pago e PagBank.

**Exclusividade**: Apenas um gateway pode estar ativo por vez. Ativar Pagar.me em `SettingsPayment.tsx` desabilita automaticamente Asaas, MP e PagBank.

**Tokenização**: Cartão tokenizado via API direta do Pagar.me (`/core/v5/tokens?appId={public_key}`) usando a Public Key (`pk_`), implementada em `useMercadoPago.ts` (`tokenizePagarMeCard`). Não usa SDK JS — chamada `fetch` direta no frontend.

**Backend (`payment-checkout`)**: Classe `PagarMeGateway` processa valores em centavos, suporta `antifraud_enabled`, gera PIX com `pixQrCodeUrl` e processa cartão tokenizado. Autenticação via Basic Auth com Secret Key (`sk_`).

**Webhook (`pagarme-webhook`)**: Validação de assinatura **HMAC-SHA1** via header `X-Hub-Signature` (formato `sha1=...`) usando o webhook secret configurado. Aplica prioridade de status (igual MP/Asaas) para evitar regressão de pedidos confirmados. Dispara notificações WhatsApp (Evolution API) e Email (Resend) para admin e cliente em transições para `PAID` ou `REFUSED`.

**Configuração**: `site_settings` armazena `pagarme_environment` (sandbox/production), `pagarme_secret_key_sandbox/prod`, `pagarme_public_key_sandbox/prod`, `pagarme_webhook_secret`, `pagarme_antifraud_enabled`. Endpoint webhook: `/functions/v1/pagarme-webhook`.

**Test Connection**: Botão no admin invoca `payment-checkout` com `action: 'test_connection'` para validar credenciais antes de ativar.
